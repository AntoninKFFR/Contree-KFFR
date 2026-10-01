begin;
do $$
declare
  example record;
  actor uuid;
  snapshot jsonb;
  legacy jsonb;
  slot_name text;
begin
  if not has_function_privilege('authenticated', 'public.get_my_unlocked_profile_cosmetics()', 'EXECUTE')
    or has_function_privilege('anon', 'public.get_my_unlocked_profile_cosmetics()', 'EXECUTE')
    or has_function_privilege('service_role', 'public.get_my_unlocked_profile_cosmetics()', 'EXECUTE') then
    raise exception 'surprise RPC privileges';
  end if;
  if not exists (select 1 from pg_catalog.pg_proc
    where oid = 'public.get_my_unlocked_profile_cosmetics()'::regprocedure
    and not prosecdef and provolatile = 's' and pronargs = 0
    and proconfig = array['search_path=""']) then
    raise exception 'surprise RPC must be a stable, invoker, argument-free read';
  end if;
  perform pg_catalog.set_config('request.jwt.claim.sub', '', true);
  begin
    perform public.get_my_unlocked_profile_cosmetics();
    raise exception 'missing identity accepted';
  exception when sqlstate '28000' then null;
  end;
  for example in select * from (values (1,0),(2,1),(5,5),(20,16),(40,24)) v(level,expected) loop
    actor := gen_random_uuid();
    insert into auth.users(id) values(actor);
    if example.level > 1 then
      perform public.credit_progression_xp(actor,
        private.progression_total_xp_for_level(example.level), 'solo_game', 'surprise-proof');
    end if;
    perform pg_catalog.set_config('request.jwt.claim.sub', actor::text, true);
    snapshot := public.get_my_unlocked_profile_cosmetics();
    legacy := public.get_my_profile_cosmetics();
    if jsonb_array_length(snapshot->'items') <> example.expected
      or jsonb_array_length(legacy->'items') <> 24 then
      raise exception 'new inventory count or legacy compatibility at level %', example.level;
    end if;
    if exists (select 1 from jsonb_array_elements(snapshot->'items') i
      where (i->>'unlocked')::boolean is distinct from true
      or (i->>'unlockLevel')::integer > example.level
      or i->>'unlockedAt' is null) then
      raise exception 'locked item leaked';
    end if;
    if example.level = 1 then
      if snapshot->'equipped' <> '{"title":null,"badge":null,"frame":null}'::jsonb
        or exists(select 1 from public.player_progression where user_id=actor)
        or exists(select 1 from public.profile_cosmetic_unlocks where user_id=actor)
        or exists(select 1 from public.profile_cosmetic_equipment where user_id=actor)
        or exists(select 1 from public.progression_xp_events where user_id=actor) then
        raise exception 'fresh inventory read wrote data';
      end if;
    end if;
    if example.level = 2 and snapshot->'items'->0->>'key' <> 'title_taker' then
      raise exception 'level 2 must only discover Preneur';
    end if;
    if example.level = 20 then
      perform public.set_my_profile_cosmetic('title','title_contree_ace');
      perform public.set_my_profile_cosmetic('badge','badge_coinche');
      perform public.set_my_profile_cosmetic('frame','frame_black_gold');
      snapshot := public.get_my_unlocked_profile_cosmetics();
      if snapshot->'equipped' <> '{"title":"title_contree_ace","badge":"badge_coinche","frame":"frame_black_gold"}'::jsonb then
        raise exception 'equipped slots lost';
      end if;
      foreach slot_name in array array['title','badge','frame'] loop
        if not exists (select 1 from jsonb_array_elements(snapshot->'items') i
          where i->>'key' = snapshot->'equipped'->>slot_name and (i->>'equipped')::boolean) then
          raise exception 'equipped item missing from inventory';
        end if;
      end loop;
    end if;
  end loop;
end $$;
rollback;
