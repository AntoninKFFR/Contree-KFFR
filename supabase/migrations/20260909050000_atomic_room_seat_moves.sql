-- Move a lobby member between seats without violating the partial unique user index.
-- The room row serializes competing moves; clearing the old seat and filling the new
-- seat happen inside one transaction and are never externally visible in between.
create or replace function public.move_room_seat(
  p_room_id uuid,
  p_actor_user_id uuid,
  p_seat_index smallint,
  p_display_name text,
  p_expected_version bigint,
  p_now timestamptz default now()
) returns boolean
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  current_room_status text;
  current_room_version bigint;
  target_player public.room_players%rowtype;
begin
  if p_seat_index < 0 or p_seat_index > 3 then return false; end if;

  select room.status, room.state_version
    into current_room_status, current_room_version
    from public.rooms as room
   where room.id = p_room_id
   for update;

  if not found
     or current_room_status <> 'lobby'
     or current_room_version <> p_expected_version then
    return false;
  end if;

  perform player.id
    from public.room_players as player
   where player.room_id = p_room_id
   order by player.seat_index
   for update;

  select player.*
    into target_player
    from public.room_players as player
   where player.room_id = p_room_id and player.seat_index = p_seat_index;

  if not found then return false; end if;
  if target_player.kind = 'human' and target_player.user_id = p_actor_user_id then
    return true;
  end if;
  if target_player.kind <> 'empty' or target_player.user_id is not null then
    return false;
  end if;

  update public.room_players
     set kind = 'empty', user_id = null, bot_profile_id = null,
         display_name = null, is_ready = false, is_connected = false,
         bot_takeover = false, last_seen_at = null, joined_at = null,
         left_at = p_now, updated_at = p_now
   where room_id = p_room_id and kind = 'human' and user_id = p_actor_user_id;

  update public.room_players
     set kind = 'human', user_id = p_actor_user_id, bot_profile_id = null,
         display_name = p_display_name, is_ready = false, is_connected = true,
         bot_takeover = false, last_seen_at = p_now, joined_at = p_now,
         left_at = null, updated_at = p_now
   where id = target_player.id and room_id = p_room_id and kind = 'empty';
  if not found then raise exception 'seat changed while locked'; end if;

  update public.rooms
     set state_version = state_version + 1, updated_at = p_now
   where id = p_room_id and state_version = p_expected_version;
  if not found then raise exception 'room version changed while locked'; end if;

  return true;
end;
$$;

revoke all on function public.move_room_seat(uuid,uuid,smallint,text,bigint,timestamptz)
  from public, anon, authenticated;
grant execute on function public.move_room_seat(uuid,uuid,smallint,text,bigint,timestamptz)
  to service_role;
