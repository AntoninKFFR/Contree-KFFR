-- Atomic host transfer for versioned room commits and metadata-only host claims.
drop function if exists public.commit_room_state(uuid,bigint,jsonb,text,text,jsonb,timestamptz);
create function public.commit_room_state(
  p_room_id uuid,
  p_expected_version bigint,
  p_state jsonb,
  p_status text,
  p_game_phase text,
  p_players jsonb default null,
  p_turn_deadline_at timestamptz default null,
  p_host_user_id uuid default null,
  p_update_host boolean default false
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
         host_user_id = case when p_update_host then p_host_user_id else target.host_user_id end,
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

create or replace function public.claim_room_host(
  p_room_id uuid,
  p_claimant_user_id uuid,
  p_offline_before timestamptz
) returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  current_host_user_id uuid;
begin
  select host_user_id
    into current_host_user_id
    from public.rooms
   where id = p_room_id and status <> 'cancelled'
   for update;
  if not found or current_host_user_id = p_claimant_user_id then return false; end if;

  perform 1
    from public.room_players
   where room_id = p_room_id
     and user_id in (p_claimant_user_id, current_host_user_id)
   for update;

  if not exists (
    select 1
      from public.room_players
     where room_id = p_room_id
       and kind = 'human'
       and user_id = p_claimant_user_id
       and last_seen_at is not null
       and last_seen_at >= p_offline_before
  ) then return false; end if;

  if current_host_user_id is not null and exists (
    select 1
      from public.room_players
     where room_id = p_room_id
       and kind = 'human'
       and user_id = current_host_user_id
       and last_seen_at is not null
       and last_seen_at >= p_offline_before
  ) then return false; end if;

  update public.rooms
     set host_user_id = p_claimant_user_id,
         updated_at = now()
   where id = p_room_id;
  return true;
end;
$$;

revoke all on function public.commit_room_state(uuid,bigint,jsonb,text,text,jsonb,timestamptz,uuid,boolean) from public, anon, authenticated;
grant execute on function public.commit_room_state(uuid,bigint,jsonb,text,text,jsonb,timestamptz,uuid,boolean) to service_role;
revoke all on function public.claim_room_host(uuid,uuid,timestamptz) from public, anon, authenticated;
grant execute on function public.claim_room_host(uuid,uuid,timestamptz) to service_role;

notify pgrst, 'reload schema';
