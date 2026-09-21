-- Elo V1 lifecycle. This migration is applied only after the PR is merged.
alter table public.multiplayer_games
  add column forfeiting_seat_index smallint check (forfeiting_seat_index between 0 and 3);
alter table public.multiplayer_games
  add constraint multiplayer_games_forfeiting_seat_team check (
    forfeiting_seat_index is null or
    (end_reason = 'forfeit' and forfeiting_team = forfeiting_seat_index % 2)
  );

create function private.rating_create_start_snapshot(
  p_room_id uuid, p_game_id uuid, p_state jsonb,
  p_official_ruleset jsonb, p_rating_bots jsonb
) returns void language plpgsql security definer set search_path = '' as $$
declare
  v_room public.rooms%rowtype;
  v_seat public.room_players%rowtype;
  v_bot record;
  v_rating public.player_ratings%rowtype;
  v_humans integer;
  v_bots integer;
  v_reliability numeric(4,2);
begin
  select * into strict v_room from public.rooms where id = p_room_id;
  if v_room.status <> 'playing' or v_room.active_game_id is distinct from p_game_id then
    raise exception 'rating_start_invalid_room';
  end if;
  if p_official_ruleset is null
     or p_official_ruleset ->> 'id' is distinct from 'contree-kffr'
     or (p_official_ruleset ->> 'version')::integer is distinct from 1 then
    raise exception 'rating_start_invalid_official_preset';
  end if;
  -- JSONB equality checks the whole normalized preset, not just id/version.
  if v_room.ruleset_id <> 'contree-kffr' or v_room.ruleset_version <> 1
     or v_room.ruleset_snapshot is distinct from p_official_ruleset then
    return;
  end if;
  if p_state -> 'settings' -> 'ruleset' is distinct from p_official_ruleset then
    raise exception 'rating_start_ruleset_mismatch';
  end if;
  select count(*) filter (where kind = 'human'),
         count(*) filter (where kind = 'bot')
    into v_humans, v_bots
    from public.room_players where room_id = p_room_id;
  if (select count(*) from public.room_players where room_id = p_room_id) <> 4
     or v_humans not between 1 and 4 or v_humans + v_bots <> 4 then
    raise exception 'rating_start_invalid_seats';
  end if;
  if jsonb_typeof(coalesce(p_rating_bots, '[]'::jsonb)) <> 'array'
     or jsonb_array_length(coalesce(p_rating_bots, '[]'::jsonb)) <> v_bots then
    raise exception 'rating_start_invalid_bots';
  end if;
  v_reliability := case
    when v_humans = 4 then 1.00
    when v_humans = 3 then 0.95
    when v_humans = 2 and
      (select count(distinct seat_index % 2) from public.room_players
        where room_id = p_room_id and kind = 'human') = 2 then 0.85
    when v_humans = 2 then 0.60
    else 0.20
  end;
  insert into public.rating_start_snapshots (
    source_game_id, source_room_id, formula_version, ruleset_id,
    ruleset_version, ruleset_snapshot, human_count, reliability_factor, started_at
  ) values (
    p_game_id, p_room_id, 1, 'contree-kffr', 1, p_official_ruleset,
    v_humans, v_reliability, v_room.started_at
  );
  -- All paths that lock multiple ratings use ascending user_id order.
  for v_seat in select * from public.room_players
    where room_id = p_room_id and kind = 'human' order by user_id
  loop
    if v_seat.user_id is null or v_seat.bot_profile_id is not null then
      raise exception 'rating_start_invalid_human';
    end if;
    insert into public.player_ratings(user_id) values (v_seat.user_id)
      on conflict (user_id) do nothing;
    select * into strict v_rating from public.player_ratings
      where user_id = v_seat.user_id for update;
    insert into public.rating_start_snapshot_participants (
      source_game_id, seat_index, team_id, kind, user_id,
      rating_snapshot, k_factor_snapshot
    ) values (
      p_game_id, v_seat.seat_index, v_seat.seat_index % 2, 'human',
      v_seat.user_id, v_rating.rating,
      case when v_rating.rated_games < 10 then 40
           when v_rating.rated_games < 30 then 36 else 32 end
    );
  end loop;
  for v_seat in select * from public.room_players
    where room_id = p_room_id and kind = 'bot' order by seat_index
  loop
    select * into v_bot from jsonb_to_recordset(p_rating_bots)
      as bot(seat_index smallint, bot_profile_id text, bot_version text, bot_rating_snapshot integer)
      where seat_index = v_seat.seat_index;
    if not found or v_bot.bot_profile_id is distinct from v_seat.bot_profile_id
       or v_bot.bot_version is null or v_bot.bot_rating_snapshot < 0 then
      raise exception 'rating_start_bot_config_mismatch';
    end if;
    insert into public.rating_start_snapshot_participants (
      source_game_id, seat_index, team_id, kind, rating_snapshot,
      bot_profile_id, bot_version, bot_rating_snapshot
    ) values (
      p_game_id, v_seat.seat_index, v_seat.seat_index % 2, 'bot',
      v_bot.bot_rating_snapshot, v_bot.bot_profile_id, v_bot.bot_version,
      v_bot.bot_rating_snapshot
    );
  end loop;
end;
$$;
revoke all on function private.rating_create_start_snapshot(uuid,uuid,jsonb,jsonb,jsonb)
  from public, anon, authenticated;
grant execute on function private.rating_create_start_snapshot(uuid,uuid,jsonb,jsonb,jsonb)
  to service_role;

-- Calling the existing commit RPC inside this wrapper keeps the room transition
-- and rating snapshot in one Postgres transaction.
create function public.start_multiplayer_game(
  p_room_id uuid, p_expected_version bigint, p_state jsonb, p_status text,
  p_game_phase text, p_players jsonb, p_turn_deadline_at timestamptz,
  p_host_user_id uuid, p_update_host boolean, p_active_game_id uuid,
  p_update_active_game boolean, p_archive_game jsonb, p_archive_players jsonb,
  p_official_ruleset jsonb, p_rating_bots jsonb
) returns boolean language plpgsql security definer set search_path = '' as $$
declare v_started boolean;
begin
  if p_status <> 'playing' or p_game_phase = 'game-over'
     or p_active_game_id is null or not p_update_active_game
     or p_players is null or p_state is null or p_archive_game is not null
     or not exists (
       select 1 from public.rooms
       where id = p_room_id and status = 'lobby' and state_version = p_expected_version
     ) then
    return false;
  end if;
  v_started := public.commit_room_state(
    p_room_id, p_expected_version, p_state, p_status, p_game_phase,
    p_players, p_turn_deadline_at, p_host_user_id, p_update_host,
    p_active_game_id, p_update_active_game, p_archive_game, p_archive_players
  );
  if not v_started then return false; end if;
  perform private.rating_create_start_snapshot(
    p_room_id, p_active_game_id, p_state, p_official_ruleset, p_rating_bots
  );
  return true;
end;
$$;
revoke all on function public.start_multiplayer_game(
  uuid,bigint,jsonb,text,text,jsonb,timestamptz,uuid,boolean,uuid,boolean,jsonb,jsonb,jsonb,jsonb
) from public, anon, authenticated;
grant execute on function public.start_multiplayer_game(
  uuid,bigint,jsonb,text,text,jsonb,timestamptz,uuid,boolean,uuid,boolean,jsonb,jsonb,jsonb,jsonb
) to service_role;

create function private.rating_pending_from_archive(p_game_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_game public.multiplayer_games%rowtype;
  v_start public.rating_start_snapshots%rowtype;
  v_match public.rating_matches%rowtype;
  v_seat public.rating_start_snapshot_participants%rowtype;
  v_archive_seat public.multiplayer_game_players%rowtype;
begin
  select * into v_start from public.rating_start_snapshots where source_game_id = p_game_id;
  if not found then return; end if;
  select * into strict v_game from public.multiplayer_games where id = p_game_id;
  if v_game.ruleset_id is distinct from v_start.ruleset_id
     or v_game.ruleset_version is distinct from v_start.ruleset_version
     or v_game.ruleset_snapshot is distinct from v_start.ruleset_snapshot
     or v_game.started_at is distinct from v_start.started_at then
    raise exception 'rating_finish_snapshot_mismatch';
  end if;
  if (select count(*) from public.rating_start_snapshot_participants
      where source_game_id = p_game_id) <> 4
     or (select count(*) from public.multiplayer_game_players
      where game_id = p_game_id) <> 4 then
    raise exception 'rating_finish_incomplete_seats';
  end if;
  if v_game.end_reason = 'forfeit' and (
    v_game.forfeiting_seat_index is null
    or not exists (
      select 1 from public.rating_start_snapshot_participants
      where source_game_id = p_game_id
        and seat_index = v_game.forfeiting_seat_index and kind = 'human'
    )
  ) then
    raise exception 'rating_finish_invalid_forfeiter';
  end if;
  insert into public.rating_matches (
    source_game_id, source_room_id, ruleset_id, ruleset_version,
    ruleset_snapshot, formula_version, human_count, reliability_factor,
    winner_team, end_reason, forfeiting_seat_index, status, started_at, completed_at
  ) values (
    p_game_id, v_game.room_id, v_start.ruleset_id, v_start.ruleset_version,
    v_start.ruleset_snapshot, v_start.formula_version, v_start.human_count,
    v_start.reliability_factor, v_game.winner_team, v_game.end_reason,
    v_game.forfeiting_seat_index, 'pending', v_start.started_at, v_game.finished_at
  ) on conflict (source_game_id) do nothing;
  if found then
    raise log 'rating pending created source_game_id=%', p_game_id;
  end if;
  select * into strict v_match from public.rating_matches where source_game_id = p_game_id;
  if v_match.winner_team is distinct from v_game.winner_team
     or v_match.end_reason is distinct from v_game.end_reason
     or v_match.forfeiting_seat_index is distinct from v_game.forfeiting_seat_index
     or v_match.completed_at is distinct from v_game.finished_at then
    raise exception 'rating_finish_conflicting_result';
  end if;
  for v_seat in select * from public.rating_start_snapshot_participants
    where source_game_id = p_game_id order by seat_index
  loop
    select * into strict v_archive_seat from public.multiplayer_game_players
      where game_id = p_game_id and seat_index = v_seat.seat_index;
    if v_archive_seat.kind is distinct from v_seat.kind
       or v_archive_seat.user_id is distinct from v_seat.user_id
       or v_archive_seat.bot_profile_id is distinct from v_seat.bot_profile_id
       or v_archive_seat.team_id is distinct from v_seat.team_id then
      raise exception 'rating_finish_participant_mismatch';
    end if;
    insert into public.rating_match_participants (
      match_id, seat_index, team_id, kind, user_id, rating_snapshot,
      k_factor_snapshot, bot_profile_id, bot_version, bot_rating_snapshot,
      result, forfeited
    ) values (
      v_match.id, v_seat.seat_index, v_seat.team_id, v_seat.kind,
      v_seat.user_id, v_seat.rating_snapshot, v_seat.k_factor_snapshot,
      v_seat.bot_profile_id, v_seat.bot_version, v_seat.bot_rating_snapshot,
      case when v_seat.team_id = v_game.winner_team then 1 else 0 end,
      v_game.end_reason = 'forfeit' and v_seat.seat_index = v_game.forfeiting_seat_index
    ) on conflict (match_id, seat_index) do nothing;
  end loop;
end;
$$;
revoke all on function private.rating_pending_from_archive(uuid) from public, anon, authenticated;
grant execute on function private.rating_pending_from_archive(uuid) to service_role;

-- Every authoritative finish path calls this existing function: ordinary move,
-- timer, bot takeover and voluntary forfeit. Pending creation shares its commit.
create or replace function public.persist_multiplayer_archive(
  p_room_id uuid, p_game jsonb, p_players jsonb
) returns void language plpgsql security definer set search_path = '' as $$
declare
  source_game public.multiplayer_games%rowtype;
  v_existing public.multiplayer_games%rowtype;
begin
  if p_game is null or p_players is null then return; end if;
  source_game := jsonb_populate_record(null::public.multiplayer_games, p_game);
  if source_game.id is null or source_game.room_id is distinct from p_room_id
     or not exists (
       select 1 from public.rooms
       where id = p_room_id and active_game_id = source_game.id and status = 'finished'
     ) then
    raise exception 'Invalid multiplayer archive identity';
  end if;
  if source_game.end_reason = 'forfeit' and (
    source_game.forfeiting_seat_index is null
    or not exists (
      select 1 from public.room_players
      where room_id = p_room_id and seat_index = source_game.forfeiting_seat_index
        and kind = 'human' and user_id is not null
    )
  ) then
    raise exception 'Invalid multiplayer forfeiter seat';
  end if;
  insert into public.multiplayer_games (
    id,room_id,started_at,finished_at,scoring_mode,target_score,
    team_0_score,team_1_score,winner_team,end_reason,forfeiting_team,
    forfeiting_seat_index,round_count,ruleset_id,ruleset_version,
    ruleset_snapshot,round_history,player_names
  ) values (
    source_game.id,source_game.room_id,source_game.started_at,source_game.finished_at,
    source_game.scoring_mode,source_game.target_score,source_game.team_0_score,
    source_game.team_1_score,source_game.winner_team,source_game.end_reason,
    source_game.forfeiting_team,source_game.forfeiting_seat_index,source_game.round_count,
    source_game.ruleset_id,source_game.ruleset_version,source_game.ruleset_snapshot,
    coalesce(source_game.round_history,'[]'::jsonb),source_game.player_names
  ) on conflict (id) do nothing;
  select * into strict v_existing from public.multiplayer_games where id = source_game.id;
  if v_existing.room_id is distinct from source_game.room_id
     or v_existing.winner_team is distinct from source_game.winner_team
     or v_existing.end_reason is distinct from source_game.end_reason
     or v_existing.forfeiting_seat_index is distinct from source_game.forfeiting_seat_index then
    raise exception 'Conflicting multiplayer archive';
  end if;
  insert into public.multiplayer_game_players (
    game_id,seat_index,kind,user_id,display_name,bot_profile_id,team_id
  )
  select source.game_id,source.seat_index,source.kind,source.user_id,
         source.display_name,source.bot_profile_id,source.team_id
    from jsonb_populate_recordset(null::public.multiplayer_game_players,p_players) source
  on conflict (game_id,seat_index) do nothing;
  perform private.rating_pending_from_archive(source_game.id);
end;
$$;
revoke all on function public.persist_multiplayer_archive(uuid,jsonb,jsonb)
  from public, anon, authenticated;
grant execute on function public.persist_multiplayer_archive(uuid,jsonb,jsonb)
  to service_role;

create function public.apply_rating_match(p_source_game_id uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_match public.rating_matches%rowtype;
  v_start public.rating_start_snapshots%rowtype;
  v_game public.multiplayer_games%rowtype;
  v_seat public.rating_match_participants%rowtype;
  v_start_seat public.rating_start_snapshot_participants%rowtype;
  v_archive_seat public.multiplayer_game_players%rowtype;
  v_rating public.player_ratings%rowtype;
  v_strength double precision[] := array[0,0];
  v_expected double precision[] := array[0,0];
  v_deltas integer[] := array[0,0,0,0];
  v_result integer;
  v_partner integer;
  v_transfer integer;
  v_before integer;
  v_effective integer;
  v_after integer;
begin
  select * into v_match from public.rating_matches
    where source_game_id = p_source_game_id for update;
  if not found then return 'not_found'; end if;
  if v_match.status = 'applied' then return 'already_applied'; end if;
  if v_match.status = 'void' then return 'void'; end if;
  select * into strict v_start from public.rating_start_snapshots
    where source_game_id = p_source_game_id;
  select * into strict v_game from public.multiplayer_games
    where id = p_source_game_id;
  if v_match.formula_version <> 1
     or v_match.ruleset_snapshot is distinct from v_start.ruleset_snapshot
     or v_game.ruleset_snapshot is distinct from v_start.ruleset_snapshot
     or v_match.started_at is distinct from v_start.started_at
     or v_match.completed_at is distinct from v_game.finished_at
     or v_match.winner_team is distinct from v_game.winner_team
     or v_match.end_reason is distinct from v_game.end_reason
     or v_match.forfeiting_seat_index is distinct from v_game.forfeiting_seat_index
     or v_match.human_count is distinct from v_start.human_count
     or v_match.reliability_factor is distinct from v_start.reliability_factor
     or (select count(*) from public.rating_match_participants
         where match_id = v_match.id) <> 4 then
    raise exception 'rating_apply_invalid_match';
  end if;
  for v_seat in select * from public.rating_match_participants
    where match_id = v_match.id order by seat_index for update
  loop
    select * into strict v_start_seat from public.rating_start_snapshot_participants
      where source_game_id = p_source_game_id and seat_index = v_seat.seat_index;
    select * into strict v_archive_seat from public.multiplayer_game_players
      where game_id = p_source_game_id and seat_index = v_seat.seat_index;
    if v_seat.kind is distinct from v_start_seat.kind
       or v_seat.kind is distinct from v_archive_seat.kind
       or v_seat.user_id is distinct from v_start_seat.user_id
       or v_seat.user_id is distinct from v_archive_seat.user_id
       or v_seat.bot_profile_id is distinct from v_archive_seat.bot_profile_id
       or v_seat.team_id is distinct from v_archive_seat.team_id
       or v_seat.rating_snapshot is distinct from v_start_seat.rating_snapshot
       or v_seat.k_factor_snapshot is distinct from v_start_seat.k_factor_snapshot
       or v_seat.bot_profile_id is distinct from v_start_seat.bot_profile_id
       or v_seat.bot_version is distinct from v_start_seat.bot_version
       or v_seat.bot_rating_snapshot is distinct from v_start_seat.bot_rating_snapshot
       or v_seat.team_id is distinct from v_start_seat.team_id
       or v_seat.result is distinct from
         (case when v_seat.team_id = v_match.winner_team then 1 else 0 end)
       or v_seat.forfeited is distinct from
         (v_match.end_reason = 'forfeit'
          and v_seat.seat_index = v_match.forfeiting_seat_index) then
      raise exception 'rating_apply_participant_mismatch';
    end if;
    v_strength[v_seat.team_id + 1] :=
      v_strength[v_seat.team_id + 1] + v_seat.rating_snapshot::double precision / 2;
  end loop;
  v_expected[1] := 1.0 / (1.0 + power(10.0::double precision,
    (v_strength[2] - v_strength[1]) / 400.0));
  v_expected[2] := 1.0 - v_expected[1];
  for v_seat in select * from public.rating_match_participants
    where match_id = v_match.id and kind = 'human' order by seat_index
  loop
    v_result := case when v_seat.team_id = v_match.winner_team then 1 else 0 end;
    v_deltas[v_seat.seat_index + 1] := round(
      (v_seat.k_factor_snapshot * v_match.reliability_factor
       * (v_result - v_expected[v_seat.team_id + 1]))::numeric
    )::integer;
  end loop;
  if v_match.end_reason = 'forfeit' then
    v_partner := (v_match.forfeiting_seat_index + 2) % 4;
    if exists (
      select 1 from public.rating_match_participants
      where match_id = v_match.id and seat_index = v_partner and kind = 'human'
    ) then
      v_transfer := round(abs(v_deltas[v_partner + 1])::numeric / 2)::integer;
      v_deltas[v_match.forfeiting_seat_index + 1] :=
        v_deltas[v_match.forfeiting_seat_index + 1] - v_transfer;
      v_deltas[v_partner + 1] := v_deltas[v_partner + 1] + v_transfer;
    end if;
  end if;
  -- Lock all existing human ratings before modifying any of them.
  for v_seat in select * from public.rating_match_participants
    where match_id = v_match.id and kind = 'human' and user_id is not null
    order by user_id
  loop
    perform 1 from public.player_ratings where user_id = v_seat.user_id for update;
    if not found then raise exception 'rating_apply_missing_player_rating'; end if;
  end loop;
  for v_seat in select * from public.rating_match_participants
    where match_id = v_match.id and kind = 'human' order by seat_index
  loop
    if v_seat.user_id is null then continue; end if;
    select * into strict v_rating from public.player_ratings
      where user_id = v_seat.user_id;
    v_before := v_rating.rating;
    v_effective := greatest(v_deltas[v_seat.seat_index + 1], -v_before);
    v_after := v_before + v_effective;
    update public.player_ratings
      set rating = v_after,
          rated_games = rated_games + 1,
          wins = wins + case when v_seat.result = 1 then 1 else 0 end,
          losses = losses + case when v_seat.result = 0 then 1 else 0 end,
          forfeits = forfeits + case when v_seat.forfeited then 1 else 0 end,
          peak_rating = greatest(peak_rating, v_after),
          updated_at = now()
      where user_id = v_seat.user_id;
    update public.rating_match_participants
      set rating_before_apply = v_before, delta = v_effective,
          rating_after_apply = v_after
      where match_id = v_match.id and seat_index = v_seat.seat_index;
  end loop;
  update public.rating_matches
    set status = 'applied', processed_at = now()
    where id = v_match.id and status = 'pending';
  return 'applied';
end;
$$;
revoke all on function public.apply_rating_match(uuid) from public, anon, authenticated;
grant execute on function public.apply_rating_match(uuid) to service_role;
notify pgrst, 'reload schema';
