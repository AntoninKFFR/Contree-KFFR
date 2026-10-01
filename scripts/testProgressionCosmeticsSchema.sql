begin;
do $$ declare role_name text; tab text; fn text;
begin
 if (select count(*) from public.profile_cosmetics)<>24 or (select max(version) from public.profile_cosmetic_catalog_versions)<>1 then raise exception 'catalog size/version';end if;
 if (select jsonb_agg(jsonb_build_array(key,slot,display_name,unlock_level,visual_variant) order by sort_order) from public.profile_cosmetics) <> '[["title_taker", "title", "Preneur", 2, "standard"], ["title_steady_hand", "title", "Main sûre", 4, "standard"], ["title_strategist", "title", "Stratège", 6, "standard"], ["title_fearless", "title", "Sans trembler", 9, "standard"], ["title_auction_master", "title", "Maître des enchères", 12, "standard"], ["title_fine_blade", "title", "Fine lame", 16, "standard"], ["title_contree_ace", "title", "As de la Contrée", 20, "standard"], ["title_old_hand", "title", "Vieux briscard", 25, "standard"], ["title_table_master", "title", "Maître de la table", 32, "standard"], ["title_kffr_legend", "title", "Légende KFFR", 40, "standard"], ["badge_club", "badge", "Trèfle", 3, "club"], ["badge_diamond", "badge", "Carreau", 5, "diamond"], ["badge_spade", "badge", "Pique", 8, "spade"], ["badge_heart", "badge", "Cœur", 11, "heart"], ["badge_crown", "badge", "Couronne", 15, "crown"], ["badge_coinche", "badge", "Coinche", 20, "coinche"], ["badge_surcoinche", "badge", "Surcoinche", 28, "surcoinche"], ["badge_kffr", "badge", "KFFR", 40, "kffr"], ["frame_gold_fine", "frame", "Or fin", 5, "gold_fine"], ["frame_ivory", "frame", "Ivoire", 10, "ivory"], ["frame_black_gold", "frame", "Noir & Or", 15, "black_gold"], ["frame_contree", "frame", "Contrée", 22, "contree"], ["frame_prestige", "frame", "Prestige", 30, "prestige"], ["frame_kffr_signature", "frame", "KFFR Signature", 40, "kffr_signature"]]'::jsonb then raise exception 'catalog content';end if;
 foreach tab in array array['profile_cosmetic_catalog_versions','profile_cosmetics','profile_cosmetic_unlocks','profile_cosmetic_equipment'] loop
  if not(select relrowsecurity from pg_class where oid=('public.'||tab)::regclass) then raise exception 'no RLS';end if;
  foreach role_name in array array['anon','authenticated','service_role'] loop
   if has_table_privilege(role_name,'public.'||tab,'INSERT,UPDATE,DELETE,TRUNCATE') then raise exception 'direct write';end if;
  end loop;
 end loop;
 foreach fn in array array['private.progression_total_xp_for_level(integer)','private.sync_level_cosmetic_unlocks(uuid,bigint)','private.unlock_profile_cosmetics_on_xp()'] loop
  foreach role_name in array array['anon','authenticated','service_role'] loop
   if has_function_privilege(role_name,fn,'EXECUTE') then raise exception 'private helper exposed';end if;
  end loop;
 end loop;
 foreach fn in array array['public.get_my_profile_cosmetics()','public.set_my_profile_cosmetic(text,text)'] loop
  if has_function_privilege('anon',fn,'EXECUTE') or has_function_privilege('service_role',fn,'EXECUTE') then raise exception 'public RPC grant';end if;
 end loop;
 if exists(select 1 from pg_proc where proname in ('set_my_profile_cosmetic','get_my_profile_cosmetics','sync_level_cosmetic_unlocks','unlock_profile_cosmetics_on_xp') and proconfig is distinct from array['search_path=""']) then raise exception 'search path';end if;
 begin perform private.progression_total_xp_for_level(0);raise exception 'invalid level accepted';exception when invalid_parameter_value then null;end;
 begin perform private.progression_total_xp_for_level(2147483647);raise exception 'overflow accepted';exception when numeric_value_out_of_range then null;end;
end $$;
do $$ declare u uuid; item public.profile_cosmetics; threshold bigint; first_unlock timestamptz; actor uuid:=gen_random_uuid(); fresh uuid:=gen_random_uuid(); snapshot jsonb;
begin
 -- Every item's own exact boundary is exercised through the real XP credit.
 for item in select * from public.profile_cosmetics order by sort_order loop
  u:=gen_random_uuid();insert into auth.users(id) values(u);
  threshold:=private.progression_total_xp_for_level(item.unlock_level);
  perform public.credit_progression_xp(u,threshold-1,'solo_game','before');
  if exists(select 1 from public.profile_cosmetic_unlocks where user_id=u and cosmetic_key=item.key) then raise exception 'early unlock';end if;
  perform public.credit_progression_xp(u,1,'solo_game','boundary');
  select unlocked_at into first_unlock from public.profile_cosmetic_unlocks where user_id=u and cosmetic_key=item.key;
  if first_unlock is null then raise exception 'missing boundary unlock';end if;
  perform public.credit_progression_xp(u,1,'solo_game','boundary');
  if (select unlocked_at from public.profile_cosmetic_unlocks where user_id=u and cosmetic_key=item.key) is distinct from first_unlock then raise exception 'retry history changed';end if;
 end loop;
 insert into auth.users(id) values(actor),(fresh);
 perform public.credit_progression_xp(actor,private.progression_total_xp_for_level(6),'solo_game','jump');
 if (select count(*) from public.profile_cosmetic_unlocks where user_id=actor)<>6 or exists(select 1 from public.profile_cosmetic_equipment where user_id=actor) then raise exception 'multi threshold or auto equip';end if;
 perform set_config('request.jwt.claim.sub',actor::text,true);
 perform public.set_my_profile_cosmetic('title','title_taker');
 perform public.set_my_profile_cosmetic('title','title_steady_hand');
 if not exists(select 1 from public.profile_cosmetic_equipment where user_id=actor and slot='title' and cosmetic_key='title_steady_hand') then raise exception 'replace';end if;
 perform public.set_my_profile_cosmetic('title',null);
 if exists(select 1 from public.profile_cosmetic_equipment where user_id=actor) then raise exception 'unequip';end if;
 begin perform public.set_my_profile_cosmetic('title','badge_club');raise exception 'slot mismatch accepted';exception when invalid_parameter_value then null;end;
 begin perform public.set_my_profile_cosmetic('title','title_kffr_legend');raise exception 'locked accepted';exception when insufficient_privilege then null;end;
 perform set_config('request.jwt.claim.sub',fresh::text,true);
 snapshot:=public.get_my_profile_cosmetics();
 if jsonb_array_length(snapshot->'items')<>24 or exists(select 1 from jsonb_array_elements(snapshot->'items') i where (i->>'unlocked')::boolean or (i->>'equipped')::boolean)
 or exists(select 1 from public.player_progression where user_id=fresh) then raise exception 'new account read writes';end if;
 begin perform public.set_my_profile_cosmetic('title','title_taker');raise exception 'other inventory accepted';exception when insufficient_privilege then null;end;
end $$;
-- Trigger unlocks must roll back with the surrounding XP transaction.
do $$ declare u uuid:=gen_random_uuid();
begin
 insert into auth.users(id) values(u);
 begin
  perform public.credit_progression_xp(u,22425,'weekly_mission','rollback');
  if (select count(*) from public.profile_cosmetic_unlocks where user_id=u)<>24 then raise exception 'jump did not unlock all';end if;
  raise exception 'injected failure' using errcode='40001';
 exception when serialization_failure then null;end;
 if exists(select 1 from public.profile_cosmetic_unlocks where user_id=u) or exists(select 1 from public.progression_xp_events where user_id=u) or exists(select 1 from public.player_progression where user_id=u) then raise exception 'partial XP rollback';end if;
end $$;
rollback;
