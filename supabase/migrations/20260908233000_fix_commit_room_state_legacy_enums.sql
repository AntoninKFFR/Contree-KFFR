-- Keep the RPC compatible with both legacy enum-backed columns and fresh text-backed schemas.
create or replace function public.commit_room_state(
  p_room_id uuid,
  p_expected_version bigint,
  p_state jsonb,
  p_status text,
  p_game_phase text,
  p_players jsonb default null
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

revoke all on function public.commit_room_state(uuid,bigint,jsonb,text,text,jsonb) from public, anon, authenticated;
grant execute on function public.commit_room_state(uuid,bigint,jsonb,text,text,jsonb) to service_role;

notify pgrst, 'reload schema';
