-- Safe lobby Realtime events and atomic host transitions.
drop policy if exists room_players_member_realtime on public.room_players;
create policy room_players_member_realtime on public.room_players for select to authenticated
  using (public.is_room_member(room_id));

grant select (
  id, room_id, seat_index, kind, display_name, is_ready,
  is_connected, bot_takeover, updated_at
) on public.room_players to authenticated;

do $$ begin
  alter publication supabase_realtime add table public.room_players (
    id, room_id, seat_index, kind, display_name, is_ready,
    is_connected, bot_takeover, updated_at
  );
exception when duplicate_object then null; when undefined_object then null;
end $$;

create or replace function public.transfer_room_host(
  p_room_id uuid,
  p_actor_user_id uuid,
  p_target_user_id uuid,
  p_expected_version bigint,
  p_online_after timestamptz
) returns boolean
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  current_room public.rooms%rowtype;
begin
  select room.* into current_room
    from public.rooms as room
   where room.id = p_room_id
   for update;

  if not found
     or current_room.status = 'cancelled'
     or current_room.state_version <> p_expected_version
     or current_room.host_user_id is distinct from p_actor_user_id
     or p_target_user_id = p_actor_user_id then
    return false;
  end if;

  perform player.id
    from public.room_players as player
   where player.room_id = p_room_id
     and player.kind = 'human'
     and player.user_id = p_target_user_id
     and player.last_seen_at is not null
     and player.last_seen_at >= p_online_after
   for update;
  if not found then return false; end if;

  update public.rooms
     set host_user_id = p_target_user_id,
         state_version = state_version + 1,
         updated_at = now()
   where id = p_room_id and state_version = p_expected_version;
  return found;
end;
$$;

create or replace function public.claim_room_host(
  p_room_id uuid,
  p_claimant_user_id uuid,
  p_offline_before timestamptz
) returns boolean
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  current_host_user_id uuid;
begin
  select host_user_id into current_host_user_id
    from public.rooms
   where id = p_room_id and status <> 'cancelled'
   for update;
  if not found or current_host_user_id = p_claimant_user_id then return false; end if;

  perform 1 from public.room_players
   where room_id = p_room_id
     and user_id in (p_claimant_user_id, current_host_user_id)
   for update;

  if not exists (
    select 1 from public.room_players
     where room_id = p_room_id and kind = 'human'
       and user_id = p_claimant_user_id
       and last_seen_at is not null and last_seen_at >= p_offline_before
  ) then return false; end if;

  if current_host_user_id is not null and exists (
    select 1 from public.room_players
     where room_id = p_room_id and kind = 'human'
       and user_id = current_host_user_id
       and last_seen_at is not null and last_seen_at >= p_offline_before
  ) then return false; end if;

  update public.rooms
     set host_user_id = p_claimant_user_id,
         state_version = state_version + 1,
         updated_at = now()
   where id = p_room_id and host_user_id is not distinct from current_host_user_id;
  return found;
end;
$$;

revoke all on function public.transfer_room_host(uuid,uuid,uuid,bigint,timestamptz)
  from public, anon, authenticated;
grant execute on function public.transfer_room_host(uuid,uuid,uuid,bigint,timestamptz)
  to service_role;
revoke all on function public.claim_room_host(uuid,uuid,timestamptz)
  from public, anon, authenticated;
grant execute on function public.claim_room_host(uuid,uuid,timestamptz)
  to service_role;

notify pgrst, 'reload schema';
