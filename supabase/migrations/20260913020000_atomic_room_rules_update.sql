-- Keep a lobby rules change and the corresponding readiness reset indivisible.
create or replace function public.update_room_rules(
  p_room_id uuid,
  p_actor_user_id uuid,
  p_expected_version bigint,
  p_ruleset_id text,
  p_ruleset_version integer,
  p_ruleset_snapshot jsonb,
  p_scoring_mode text,
  p_target_score integer,
  p_now timestamptz default now()
) returns boolean
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  current_room public.rooms%rowtype;
begin
  select room.*
    into current_room
    from public.rooms as room
   where room.id = p_room_id
   for update;

  if not found
     or current_room.host_user_id is distinct from p_actor_user_id
     or current_room.status <> 'lobby'
     or current_room.game_phase is not null
     or current_room.state_version <> p_expected_version
     or not exists (
       select 1 from public.room_players as player
        where player.room_id = p_room_id
          and player.kind = 'human'
          and player.user_id = p_actor_user_id
     ) then
    return false;
  end if;

  update public.rooms
     set ruleset_id = p_ruleset_id,
         ruleset_version = p_ruleset_version,
         ruleset_snapshot = p_ruleset_snapshot,
         scoring_mode = p_scoring_mode,
         target_score = p_target_score,
         state_version = state_version + 1,
         updated_at = p_now
   where id = p_room_id;

  update public.room_players
     set is_ready = (kind = 'bot'),
         updated_at = p_now
   where room_id = p_room_id;

  return true;
end;
$$;

revoke all on function public.update_room_rules(uuid,uuid,bigint,text,integer,jsonb,text,integer,timestamptz)
  from public, anon, authenticated;
grant execute on function public.update_room_rules(uuid,uuid,bigint,text,integer,jsonb,text,integer,timestamptz)
  to service_role;

notify pgrst, 'reload schema';
