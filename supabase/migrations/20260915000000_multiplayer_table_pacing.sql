alter table public.rooms
  add column if not exists presentation_settings jsonb not null
  default '{"gameSpeed":"normal","autoCollectTricks":true,"trickDisplayMs":1200}'::jsonb;

create or replace function public.update_room_presentation(
  p_room_id uuid,
  p_actor_user_id uuid,
  p_expected_version bigint,
  p_settings jsonb
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if jsonb_typeof(p_settings) <> 'object'
    or (select count(*) from jsonb_object_keys(p_settings)) <> 3
    or not (p_settings ?& array['gameSpeed', 'autoCollectTricks', 'trickDisplayMs'])
  then
    raise exception 'Invalid room presentation settings';
  end if;

  if jsonb_typeof(p_settings->'gameSpeed') <> 'string'
    or jsonb_typeof(p_settings->'autoCollectTricks') <> 'boolean'
    or jsonb_typeof(p_settings->'trickDisplayMs') <> 'number'
  then
    raise exception 'Invalid room presentation settings';
  end if;

  if p_settings->>'gameSpeed' not in ('slow', 'normal', 'fast', 'instant', 'custom')
    or (p_settings->>'trickDisplayMs')::numeric % 1 <> 0
    or (p_settings->>'trickDisplayMs')::numeric not between 0 and 3000
  then
    raise exception 'Invalid room presentation settings';
  end if;

  update public.rooms
  set presentation_settings = p_settings,
      state_version = state_version + 1,
      updated_at = timezone('utc', now())
  where id = p_room_id
    and host_user_id = p_actor_user_id
    and state_version = p_expected_version
    and status <> 'cancelled'
    and exists (
      select 1 from public.room_players as player
      where player.room_id = p_room_id
        and player.kind = 'human'
        and player.user_id = p_actor_user_id
    );

  return found;
end;
$$;

revoke all on function public.update_room_presentation(uuid, uuid, bigint, jsonb) from public;
grant execute on function public.update_room_presentation(uuid, uuid, bigint, jsonb) to service_role;
