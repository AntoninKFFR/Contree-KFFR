-- #113: additive owner-only inventory read. Keep the #112 legacy RPC unchanged.
create function public.get_my_unlocked_profile_cosmetics() returns jsonb
language plpgsql stable security invoker set search_path = '' as $$
declare
  actor uuid := auth.uid();
  items jsonb;
  equipped jsonb;
begin
  if actor is null then
    raise exception 'authentication_required' using errcode = '28000';
  end if;
  select pg_catalog.jsonb_build_object(
    'title', pg_catalog.max(e.cosmetic_key) filter (where e.slot = 'title'),
    'badge', pg_catalog.max(e.cosmetic_key) filter (where e.slot = 'badge'),
    'frame', pg_catalog.max(e.cosmetic_key) filter (where e.slot = 'frame')
  ) into equipped
  from public.profile_cosmetic_equipment e where e.user_id = actor;

  select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'key', c.key, 'slot', c.slot, 'name', c.display_name,
    'description', c.description, 'visualVariant', c.visual_variant,
    'unlockType', c.unlock_type, 'unlockLevel', c.unlock_level,
    'unlocked', true, 'unlockedAt', u.unlocked_at,
    'equipped', e.cosmetic_key is not null
  ) order by c.sort_order) into items
  from public.profile_cosmetic_unlocks u
  join public.profile_cosmetics c on c.key = u.cosmetic_key
  left join public.profile_cosmetic_equipment e
    on e.user_id = actor and e.cosmetic_key = c.key
  where u.user_id = actor;

  return pg_catalog.jsonb_build_object(
    'catalogVersion', (select pg_catalog.max(v.version) from public.profile_cosmetic_catalog_versions v),
    'equipped', equipped, 'items', coalesce(items, '[]'::jsonb)
  );
end $$;
revoke all on function public.get_my_unlocked_profile_cosmetics()
  from public, anon, authenticated, service_role;
grant execute on function public.get_my_unlocked_profile_cosmetics() to authenticated;
comment on function public.get_my_unlocked_profile_cosmetics() is
  'Canonical collection read: only owned cosmetics. Legacy get_my_profile_cosmetics remains for #112 compatibility.';
notify pgrst, 'reload schema';
