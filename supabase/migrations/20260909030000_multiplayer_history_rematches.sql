-- Immutable multiplayer summaries, participant-scoped history, and atomic rematches.
create table public.multiplayer_games (
  id uuid primary key,
  room_id uuid references public.rooms(id) on delete set null,
  started_at timestamptz not null,
  finished_at timestamptz not null,
  scoring_mode text not null check (scoring_mode in ('announced-points','made-points')),
  target_score integer not null check (target_score > 0),
  team_0_score integer not null check (team_0_score >= 0),
  team_1_score integer not null check (team_1_score >= 0),
  winner_team smallint not null check (winner_team in (0,1)),
  end_reason text not null check (end_reason in ('score','forfeit')),
  forfeiting_team smallint check (forfeiting_team in (0,1)),
  round_count integer not null check (round_count >= 0),
  created_at timestamptz not null default now(),
  check (
    (end_reason = 'score' and forfeiting_team is null)
    or (end_reason = 'forfeit' and forfeiting_team is not null and forfeiting_team <> winner_team)
  )
);

create table public.multiplayer_game_players (
  game_id uuid not null references public.multiplayer_games(id) on delete cascade,
  seat_index smallint not null check (seat_index between 0 and 3),
  kind text not null check (kind in ('human','bot')),
  user_id uuid references auth.users(id) on delete set null,
  display_name text not null check (char_length(display_name) between 1 and 40),
  bot_profile_id text,
  team_id smallint not null check (team_id in (0,1)),
  primary key (game_id, seat_index),
  check (team_id = (seat_index % 2)),
  check (
    (kind = 'human' and user_id is not null and bot_profile_id is null)
    or (kind = 'bot' and user_id is null and bot_profile_id is not null)
  )
);

create index multiplayer_games_finished_at_idx on public.multiplayer_games(finished_at desc);
create index multiplayer_game_players_user_id_idx
  on public.multiplayer_game_players(user_id, game_id) where user_id is not null;

-- The id exists before its immutable history row, so this deliberately is not a foreign key.
alter table public.rooms add column active_game_id uuid;
create unique index rooms_active_game_id_idx on public.rooms(active_game_id) where active_game_id is not null;

alter table public.multiplayer_games enable row level security;
alter table public.multiplayer_game_players enable row level security;

create or replace function public.is_multiplayer_game_participant(p_game_id uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.multiplayer_game_players
     where game_id = p_game_id and kind = 'human' and user_id = auth.uid()
  );
$$;

revoke all on function public.is_multiplayer_game_participant(uuid) from public, anon;
grant execute on function public.is_multiplayer_game_participant(uuid) to authenticated, service_role;

create policy multiplayer_games_participant_read on public.multiplayer_games
  for select to authenticated using (public.is_multiplayer_game_participant(id));
create policy multiplayer_game_players_participant_read on public.multiplayer_game_players
  for select to authenticated using (public.is_multiplayer_game_participant(game_id));

revoke all on public.multiplayer_games, public.multiplayer_game_players from anon, authenticated;
grant select on public.multiplayer_games to authenticated;
grant select(game_id, seat_index, kind, display_name, bot_profile_id, team_id)
  on public.multiplayer_game_players to authenticated;
grant all on public.multiplayer_games, public.multiplayer_game_players to service_role;

create or replace function public.persist_multiplayer_archive(
  p_room_id uuid,
  p_game jsonb,
  p_players jsonb
) returns void
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  source_game public.multiplayer_games%rowtype;
begin
  if p_game is null or p_players is null then return; end if;
  source_game := jsonb_populate_record(null::public.multiplayer_games, p_game);
  if source_game.id is null
     or source_game.room_id is distinct from p_room_id
     or not exists (
       select 1 from public.rooms where id = p_room_id and active_game_id = source_game.id
     ) then
    raise exception 'Invalid multiplayer archive identity';
  end if;

  insert into public.multiplayer_games(
    id, room_id, started_at, finished_at, scoring_mode, target_score,
    team_0_score, team_1_score, winner_team, end_reason, forfeiting_team, round_count
  ) values (
    source_game.id, source_game.room_id, source_game.started_at, source_game.finished_at,
    source_game.scoring_mode, source_game.target_score, source_game.team_0_score,
    source_game.team_1_score, source_game.winner_team, source_game.end_reason,
    source_game.forfeiting_team, source_game.round_count
  ) on conflict (id) do nothing;

  insert into public.multiplayer_game_players(
    game_id, seat_index, kind, user_id, display_name, bot_profile_id, team_id
  )
  select source.game_id, source.seat_index, source.kind, source.user_id,
         source.display_name, source.bot_profile_id, source.team_id
    from jsonb_populate_recordset(null::public.multiplayer_game_players, p_players) as source
  on conflict (game_id, seat_index) do nothing;
end;
$$;

revoke all on function public.persist_multiplayer_archive(uuid,jsonb,jsonb) from public, anon, authenticated;
grant execute on function public.persist_multiplayer_archive(uuid,jsonb,jsonb) to service_role;

drop function if exists public.commit_room_state(uuid,bigint,jsonb,text,text,jsonb,timestamptz,uuid,boolean);
create function public.commit_room_state(
  p_room_id uuid,
  p_expected_version bigint,
  p_state jsonb,
  p_status text,
  p_game_phase text,
  p_players jsonb default null,
  p_turn_deadline_at timestamptz default null,
  p_host_user_id uuid default null,
  p_update_host boolean default false,
  p_active_game_id uuid default null,
  p_update_active_game boolean default false,
  p_archive_game jsonb default null,
  p_archive_players jsonb default null
) returns boolean
language plpgsql security definer set search_path = public, pg_temp
as $$
begin
  update public.rooms as target
     set state_version = target.state_version + 1,
         status = source.status,
         game_phase = source.game_phase,
         turn_deadline_at = p_turn_deadline_at,
         host_user_id = case when p_update_host then p_host_user_id else target.host_user_id end,
         active_game_id = case
           when p_status = 'lobby' then null
           when p_update_active_game then p_active_game_id
           else target.active_game_id
         end,
         started_at = case when p_status = 'playing' then coalesce(target.started_at, now()) when p_status = 'lobby' then null else target.started_at end,
         finished_at = case when p_status = 'finished' then now() when p_status = 'lobby' then null else target.finished_at end,
         updated_at = now()
    from jsonb_populate_record(null::public.rooms, jsonb_build_object('status', p_status, 'game_phase', p_game_phase)) as source
   where target.id = p_room_id and target.state_version = p_expected_version;
  if not found then return false; end if;

  if p_players is not null then
    update public.room_players as target
       set kind = source.kind, user_id = source.user_id, bot_profile_id = source.bot_profile_id,
           display_name = source.display_name, is_ready = source.is_ready,
           is_connected = source.is_connected, bot_takeover = source.bot_takeover,
           last_seen_at = source.last_seen_at, joined_at = source.joined_at,
           left_at = source.left_at, updated_at = now()
      from jsonb_populate_recordset(null::public.room_players, p_players) as source
     where target.id = source.id and target.room_id = p_room_id;
  end if;

  if p_state is null then
    delete from public.room_game_states where room_id = p_room_id;
  else
    insert into public.room_game_states(room_id, state, updated_at) values (p_room_id, p_state, now())
    on conflict (room_id) do update set state = excluded.state, updated_at = excluded.updated_at;
  end if;
  perform public.persist_multiplayer_archive(p_room_id, p_archive_game, p_archive_players);
  return true;
end;
$$;

drop function if exists public.enable_bot_takeover(uuid,uuid,smallint,bigint,timestamptz,jsonb,text,text,timestamptz);
create function public.enable_bot_takeover(
  p_room_id uuid,
  p_actor_user_id uuid,
  p_seat_index smallint,
  p_expected_version bigint,
  p_offline_before timestamptz,
  p_state jsonb,
  p_status text,
  p_game_phase text,
  p_turn_deadline_at timestamptz default null,
  p_active_game_id uuid default null,
  p_archive_game jsonb default null,
  p_archive_players jsonb default null
) returns boolean
language plpgsql security definer set search_path = public, pg_temp
as $$
begin
  perform 1 from public.rooms as room
    join public.room_players as player on player.room_id = room.id
   where room.id = p_room_id and room.host_user_id = p_actor_user_id
     and room.status = 'playing' and room.state_version = p_expected_version
     and player.seat_index = p_seat_index and player.kind = 'human'
     and player.bot_takeover = false
     and (player.last_seen_at is null or player.last_seen_at < p_offline_before)
   for update of room, player;
  if not found then return false; end if;

  update public.rooms as target
     set state_version = target.state_version + 1, status = source.status, game_phase = source.game_phase,
         turn_deadline_at = p_turn_deadline_at,
         active_game_id = coalesce(target.active_game_id, p_active_game_id),
         finished_at = case when p_status = 'finished' then now() else target.finished_at end,
         updated_at = now()
    from jsonb_populate_record(null::public.rooms, jsonb_build_object('status', p_status, 'game_phase', p_game_phase)) as source
   where target.id = p_room_id and target.state_version = p_expected_version;
  if not found then return false; end if;

  update public.room_players set bot_takeover = true, updated_at = now()
   where room_id = p_room_id and seat_index = p_seat_index;
  insert into public.room_game_states(room_id, state, updated_at) values (p_room_id, p_state, now())
  on conflict (room_id) do update set state = excluded.state, updated_at = excluded.updated_at;
  perform public.persist_multiplayer_archive(p_room_id, p_archive_game, p_archive_players);
  return true;
end;
$$;

drop function if exists public.commit_timed_out_turn(uuid,bigint,jsonb,text,text,timestamptz);
create function public.commit_timed_out_turn(
  p_room_id uuid,
  p_expected_version bigint,
  p_state jsonb,
  p_status text,
  p_game_phase text,
  p_turn_deadline_at timestamptz,
  p_active_game_id uuid default null,
  p_archive_game jsonb default null,
  p_archive_players jsonb default null
) returns boolean
language plpgsql security definer set search_path = public, pg_temp
as $$
begin
  if p_state is null then return false; end if;
  update public.rooms as target
     set state_version = target.state_version + 1, status = source.status, game_phase = source.game_phase,
         turn_deadline_at = p_turn_deadline_at,
         active_game_id = coalesce(target.active_game_id, p_active_game_id),
         finished_at = case when p_status = 'finished' then now() else target.finished_at end,
         updated_at = now()
    from jsonb_populate_record(null::public.rooms, jsonb_build_object('status', p_status, 'game_phase', p_game_phase)) as source
   where target.id = p_room_id and target.status = 'playing' and target.state_version = p_expected_version
     and target.turn_deadline_at is not null and target.turn_deadline_at <= now();
  if not found then return false; end if;
  insert into public.room_game_states(room_id, state, updated_at) values (p_room_id, p_state, now())
  on conflict (room_id) do update set state = excluded.state, updated_at = excluded.updated_at;
  perform public.persist_multiplayer_archive(p_room_id, p_archive_game, p_archive_players);
  return true;
end;
$$;

create or replace function public.rematch_room(
  p_room_id uuid,
  p_expected_version bigint,
  p_players jsonb
) returns boolean
language plpgsql security definer set search_path = public, pg_temp
as $$
begin
  update public.rooms as room
     set state_version = room.state_version + 1, status = 'lobby', game_phase = null,
         turn_deadline_at = null, active_game_id = null, started_at = null,
         finished_at = null, updated_at = now()
   where room.id = p_room_id and room.status = 'finished'
     and room.state_version = p_expected_version and room.active_game_id is not null
     and exists (select 1 from public.multiplayer_games where id = room.active_game_id);
  if not found then return false; end if;

  update public.room_players as target
     set kind = source.kind, user_id = source.user_id, bot_profile_id = source.bot_profile_id,
         display_name = source.display_name, is_ready = source.is_ready,
         is_connected = source.is_connected, bot_takeover = source.bot_takeover,
         last_seen_at = source.last_seen_at, joined_at = source.joined_at,
         left_at = source.left_at, updated_at = now()
    from jsonb_populate_recordset(null::public.room_players, p_players) as source
   where target.id = source.id and target.room_id = p_room_id;
  delete from public.room_game_states where room_id = p_room_id;
  return true;
end;
$$;

create or replace function public.get_my_multiplayer_history() returns jsonb
language sql stable security definer set search_path = public, pg_temp
as $$
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', game.id,
      'started_at', game.started_at,
      'finished_at', game.finished_at,
      'scoring_mode', game.scoring_mode,
      'target_score', game.target_score,
      'team_0_score', game.team_0_score,
      'team_1_score', game.team_1_score,
      'winner_team', game.winner_team,
      'end_reason', game.end_reason,
      'forfeiting_team', game.forfeiting_team,
      'round_count', game.round_count,
      'viewer_seat_index', viewer.seat_index,
      'players', (
        select coalesce(jsonb_agg(jsonb_build_object(
          'seat_index', player.seat_index,
          'kind', player.kind,
          'display_name', player.display_name,
          'bot_profile_id', player.bot_profile_id,
          'team_id', player.team_id
        ) order by player.seat_index), '[]'::jsonb)
        from public.multiplayer_game_players as player where player.game_id = game.id
      )
    ) order by game.finished_at desc
  ), '[]'::jsonb)
  from public.multiplayer_games as game
  join public.multiplayer_game_players as viewer
    on viewer.game_id = game.id and viewer.kind = 'human' and viewer.user_id = auth.uid();
$$;

revoke all on function public.commit_room_state(uuid,bigint,jsonb,text,text,jsonb,timestamptz,uuid,boolean,uuid,boolean,jsonb,jsonb) from public, anon, authenticated;
grant execute on function public.commit_room_state(uuid,bigint,jsonb,text,text,jsonb,timestamptz,uuid,boolean,uuid,boolean,jsonb,jsonb) to service_role;
revoke all on function public.enable_bot_takeover(uuid,uuid,smallint,bigint,timestamptz,jsonb,text,text,timestamptz,uuid,jsonb,jsonb) from public, anon, authenticated;
grant execute on function public.enable_bot_takeover(uuid,uuid,smallint,bigint,timestamptz,jsonb,text,text,timestamptz,uuid,jsonb,jsonb) to service_role;
revoke all on function public.commit_timed_out_turn(uuid,bigint,jsonb,text,text,timestamptz,uuid,jsonb,jsonb) from public, anon, authenticated;
grant execute on function public.commit_timed_out_turn(uuid,bigint,jsonb,text,text,timestamptz,uuid,jsonb,jsonb) to service_role;
revoke all on function public.rematch_room(uuid,bigint,jsonb) from public, anon, authenticated;
grant execute on function public.rematch_room(uuid,bigint,jsonb) to service_role;
revoke all on function public.get_my_multiplayer_history() from public, anon;
grant execute on function public.get_my_multiplayer_history() to authenticated, service_role;

notify pgrst, 'reload schema';
