-- Absolute, public deadline for the next server-authoritative human decision.
alter table public.rooms
  add column if not exists turn_deadline_at timestamptz;

alter table public.rooms
  drop constraint if exists rooms_turn_deadline_playing_only;
alter table public.rooms
  add constraint rooms_turn_deadline_playing_only
  check (turn_deadline_at is null or status = 'playing');

update public.rooms as room
   set turn_deadline_at = now() + interval '45 seconds'
  from public.room_game_states as game
 where game.room_id = room.id
   and room.status = 'playing'
   and room.turn_deadline_at is null
   and exists (
     select 1
       from public.room_players as player
      where player.room_id = room.id
        and player.seat_index = case
          when game.state ->> 'currentPlayerId' in ('0', '1', '2', '3')
            then (game.state ->> 'currentPlayerId')::smallint
          else -1
        end
        and player.kind = 'human'
        and player.bot_takeover = false
   );

drop function if exists public.commit_room_state(uuid,bigint,jsonb,text,text,jsonb);
create function public.commit_room_state(
  p_room_id uuid,
  p_expected_version bigint,
  p_state jsonb,
  p_status text,
  p_game_phase text,
  p_players jsonb default null,
  p_turn_deadline_at timestamptz default null
) returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  update public.rooms as target
     set state_version = target.state_version + 1,
         status = source.status,
         game_phase = source.game_phase,
         turn_deadline_at = p_turn_deadline_at,
         started_at = case when p_status = 'playing' then coalesce(target.started_at, now()) when p_status = 'lobby' then null else target.started_at end,
         finished_at = case when p_status = 'finished' then now() when p_status = 'lobby' then null else target.finished_at end,
         updated_at = now()
    from jsonb_populate_record(
      null::public.rooms,
      jsonb_build_object('status', p_status, 'game_phase', p_game_phase)
    ) as source
   where target.id = p_room_id and target.state_version = p_expected_version;
  if not found then return false; end if;

  if p_players is not null then
    update public.room_players as target
       set kind = source.kind,
           user_id = source.user_id,
           bot_profile_id = source.bot_profile_id,
           display_name = source.display_name,
           is_ready = source.is_ready,
           is_connected = source.is_connected,
           bot_takeover = source.bot_takeover,
           last_seen_at = source.last_seen_at,
           joined_at = source.joined_at,
           left_at = source.left_at,
           updated_at = now()
      from jsonb_populate_recordset(null::public.room_players, p_players) as source
     where target.id = source.id and target.room_id = p_room_id;
  end if;

  if p_state is null then
    delete from public.room_game_states where room_id = p_room_id;
  else
    insert into public.room_game_states(room_id, state, updated_at) values (p_room_id, p_state, now())
    on conflict (room_id) do update set state = excluded.state, updated_at = excluded.updated_at;
  end if;
  return true;
end;
$$;

drop function if exists public.enable_bot_takeover(uuid,uuid,smallint,bigint,timestamptz,jsonb,text,text);
create function public.enable_bot_takeover(
  p_room_id uuid,
  p_actor_user_id uuid,
  p_seat_index smallint,
  p_expected_version bigint,
  p_offline_before timestamptz,
  p_state jsonb,
  p_status text,
  p_game_phase text,
  p_turn_deadline_at timestamptz default null
) returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform 1
    from public.rooms as room
    join public.room_players as player on player.room_id = room.id
   where room.id = p_room_id
     and room.host_user_id = p_actor_user_id
     and room.status = 'playing'
     and room.state_version = p_expected_version
     and player.seat_index = p_seat_index
     and player.kind = 'human'
     and player.bot_takeover = false
     and (player.last_seen_at is null or player.last_seen_at < p_offline_before)
   for update of room, player;
  if not found then return false; end if;

  update public.rooms
     set state_version = state_version + 1,
         status = p_status,
         game_phase = p_game_phase,
         turn_deadline_at = p_turn_deadline_at,
         finished_at = case when p_status = 'finished' then now() else finished_at end,
         updated_at = now()
   where id = p_room_id and state_version = p_expected_version;
  if not found then return false; end if;

  update public.room_players
     set bot_takeover = true,
         updated_at = now()
   where room_id = p_room_id and seat_index = p_seat_index;

  insert into public.room_game_states(room_id, state, updated_at)
  values (p_room_id, p_state, now())
  on conflict (room_id) do update set state = excluded.state, updated_at = excluded.updated_at;

  return true;
end;
$$;

create or replace function public.commit_timed_out_turn(
  p_room_id uuid,
  p_expected_version bigint,
  p_state jsonb,
  p_status text,
  p_game_phase text,
  p_turn_deadline_at timestamptz
) returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if p_state is null then return false; end if;

  update public.rooms
     set state_version = state_version + 1,
         status = p_status,
         game_phase = p_game_phase,
         turn_deadline_at = p_turn_deadline_at,
         finished_at = case when p_status = 'finished' then now() else finished_at end,
         updated_at = now()
   where id = p_room_id
     and status = 'playing'
     and state_version = p_expected_version
     and turn_deadline_at is not null
     and turn_deadline_at <= now();
  if not found then return false; end if;

  insert into public.room_game_states(room_id, state, updated_at)
  values (p_room_id, p_state, now())
  on conflict (room_id) do update set state = excluded.state, updated_at = excluded.updated_at;

  return true;
end;
$$;

revoke all on function public.commit_room_state(uuid,bigint,jsonb,text,text,jsonb,timestamptz) from public, anon, authenticated;
grant execute on function public.commit_room_state(uuid,bigint,jsonb,text,text,jsonb,timestamptz) to service_role;
revoke all on function public.enable_bot_takeover(uuid,uuid,smallint,bigint,timestamptz,jsonb,text,text,timestamptz) from public, anon, authenticated;
grant execute on function public.enable_bot_takeover(uuid,uuid,smallint,bigint,timestamptz,jsonb,text,text,timestamptz) to service_role;
revoke all on function public.commit_timed_out_turn(uuid,bigint,jsonb,text,text,timestamptz) from public, anon, authenticated;
grant execute on function public.commit_timed_out_turn(uuid,bigint,jsonb,text,text,timestamptz) to service_role;

notify pgrst, 'reload schema';
