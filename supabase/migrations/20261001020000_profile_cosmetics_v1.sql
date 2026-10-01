-- #106: additive level-only profile collection. Backfill XP balances, never game history.
create table public.profile_cosmetic_catalog_versions (
 version integer primary key check(version > 0), created_at timestamptz not null default now()
);
insert into public.profile_cosmetic_catalog_versions(version) values(1);
create table public.profile_cosmetics (
 key text primary key check(length(key) between 1 and 80 and key ~ '^[a-z][a-z0-9_]*$'),
 introduced_version integer not null references public.profile_cosmetic_catalog_versions(version),
 slot text not null check(slot in ('title','badge','frame')),
 display_name text not null check(length(btrim(display_name)) between 1 and 80),
 description text check(length(description) <= 300),
 visual_variant text not null check(length(visual_variant) between 1 and 80 and visual_variant ~ '^[a-z][a-z0-9_]*$'),
 -- Future migrations may introduce another condition without replacing stable keys.
 unlock_type text not null check(length(unlock_type) between 1 and 80 and unlock_type ~ '^[a-z][a-z0-9_]*$'),
 unlock_level integer, sort_order integer not null unique check(sort_order > 0),
 check((unlock_type = 'level' and unlock_level >= 1 and unlock_level is not null) or (unlock_type <> 'level' and unlock_level is null)),
 unique(key,slot)
);
insert into public.profile_cosmetics(key,introduced_version,slot,display_name,visual_variant,unlock_type,unlock_level,sort_order) values
('title_taker',1,'title','Preneur','standard','level',2,1),
('title_steady_hand',1,'title','Main sûre','standard','level',4,2),
('title_strategist',1,'title','Stratège','standard','level',6,3),
('title_fearless',1,'title','Sans trembler','standard','level',9,4),
('title_auction_master',1,'title','Maître des enchères','standard','level',12,5),
('title_fine_blade',1,'title','Fine lame','standard','level',16,6),
('title_contree_ace',1,'title','As de la Contrée','standard','level',20,7),
('title_old_hand',1,'title','Vieux briscard','standard','level',25,8),
('title_table_master',1,'title','Maître de la table','standard','level',32,9),
('title_kffr_legend',1,'title','Légende KFFR','standard','level',40,10),
('badge_club',1,'badge','Trèfle','club','level',3,11),
('badge_diamond',1,'badge','Carreau','diamond','level',5,12),
('badge_spade',1,'badge','Pique','spade','level',8,13),
('badge_heart',1,'badge','Cœur','heart','level',11,14),
('badge_crown',1,'badge','Couronne','crown','level',15,15),
('badge_coinche',1,'badge','Coinche','coinche','level',20,16),
('badge_surcoinche',1,'badge','Surcoinche','surcoinche','level',28,17),
('badge_kffr',1,'badge','KFFR','kffr','level',40,18),
('frame_gold_fine',1,'frame','Or fin','gold_fine','level',5,19),
('frame_ivory',1,'frame','Ivoire','ivory','level',10,20),
('frame_black_gold',1,'frame','Noir & Or','black_gold','level',15,21),
('frame_contree',1,'frame','Contrée','contree','level',22,22),
('frame_prestige',1,'frame','Prestige','prestige','level',30,23),
('frame_kffr_signature',1,'frame','KFFR Signature','kffr_signature','level',40,24);
create table public.profile_cosmetic_unlocks (
 user_id uuid not null references auth.users(id) on delete cascade,
 cosmetic_key text not null references public.profile_cosmetics(key),
 unlocked_at timestamptz not null default now(), unlock_type text not null,
 unlock_level integer, total_xp_at_unlock bigint not null check(total_xp_at_unlock between 0 and 9007199254740991),
 primary key(user_id,cosmetic_key)
);
create table public.profile_cosmetic_equipment (
 user_id uuid not null references auth.users(id) on delete cascade,
 slot text not null check(slot in ('title','badge','frame')),
 cosmetic_key text not null, equipped_at timestamptz not null default now(),
 primary key(user_id,slot),
 foreign key(cosmetic_key,slot) references public.profile_cosmetics(key,slot),
 foreign key(user_id,cosmetic_key) references public.profile_cosmetic_unlocks(user_id,cosmetic_key)
);
alter table public.profile_cosmetic_catalog_versions enable row level security;
alter table public.profile_cosmetics enable row level security;
alter table public.profile_cosmetic_unlocks enable row level security;
alter table public.profile_cosmetic_equipment enable row level security;
revoke all on public.profile_cosmetic_catalog_versions,public.profile_cosmetics,public.profile_cosmetic_unlocks,public.profile_cosmetic_equipment from public,anon,authenticated,service_role;
grant select on public.profile_cosmetic_catalog_versions,public.profile_cosmetics,public.profile_cosmetic_unlocks,public.profile_cosmetic_equipment to authenticated,service_role;
create policy cosmetic_versions_read on public.profile_cosmetic_catalog_versions for select to authenticated using(true);
create policy cosmetics_read on public.profile_cosmetics for select to authenticated using(true);
create policy cosmetic_unlocks_owner_read on public.profile_cosmetic_unlocks for select to authenticated using(user_id=(select auth.uid()));
create policy cosmetic_equipment_owner_read on public.profile_cosmetic_equipment for select to authenticated using(user_id=(select auth.uid()));

create function private.progression_total_xp_for_level(p_level integer) returns bigint
language plpgsql immutable security invoker set search_path='' as $$
declare result numeric;
begin
 if p_level is null or p_level < 1 then raise exception 'invalid_progression_level' using errcode='22023';end if;
 result := 25::numeric * (p_level::numeric-1) * (p_level::numeric+6) / 2;
 if result > 9223372036854775807 then raise exception 'progression_threshold_overflow' using errcode='22003';end if;
 return result::bigint;
end $$;
create function private.sync_level_cosmetic_unlocks(p_user_id uuid,p_total_xp bigint) returns integer
language plpgsql security definer set search_path='' as $$
declare inserted integer;
begin
 if p_user_id is null or p_total_xp is null or p_total_xp not between 0 and 9007199254740991 then raise exception 'invalid_cosmetic_balance' using errcode='22023';end if;
 insert into public.profile_cosmetic_unlocks(user_id,cosmetic_key,unlock_type,unlock_level,total_xp_at_unlock)
 select p_user_id,key,unlock_type,unlock_level,p_total_xp from public.profile_cosmetics
 where unlock_type='level' and private.progression_total_xp_for_level(unlock_level) <= p_total_xp
 order by sort_order on conflict(user_id,cosmetic_key) do nothing;
 get diagnostics inserted = row_count;return inserted;
end $$;
create function private.unlock_profile_cosmetics_on_xp() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if TG_OP='INSERT' or new.total_xp > old.total_xp then
  perform private.sync_level_cosmetic_unlocks(new.user_id,new.total_xp);
 end if;
 return new;
end $$;
revoke all on function private.progression_total_xp_for_level(integer),private.sync_level_cosmetic_unlocks(uuid,bigint),private.unlock_profile_cosmetics_on_xp() from public,anon,authenticated,service_role;
create trigger unlock_profile_cosmetics_on_xp after insert or update of total_xp on public.player_progression for each row execute function private.unlock_profile_cosmetics_on_xp();
-- XP is the only source used to backfill. No auto-equipment.
do $$ declare player record;
begin
 for player in select user_id,total_xp from public.player_progression order by user_id loop
  perform private.sync_level_cosmetic_unlocks(player.user_id,player.total_xp);
 end loop;
end $$;

create function public.get_my_profile_cosmetics() returns jsonb
language plpgsql stable security invoker set search_path='' as $$
declare actor uuid:=auth.uid(); items jsonb; equipped jsonb;
begin
 if actor is null then raise exception 'authentication_required' using errcode='28000';end if;
 select jsonb_build_object('title',max(cosmetic_key) filter(where slot='title'),
 'badge',max(cosmetic_key) filter(where slot='badge'),'frame',max(cosmetic_key) filter(where slot='frame')) into equipped
 from public.profile_cosmetic_equipment where user_id=actor;
 select jsonb_agg(jsonb_build_object('key',c.key,'slot',c.slot,'name',c.display_name,'description',c.description,
 'visualVariant',c.visual_variant,'unlockType',c.unlock_type,'unlockLevel',c.unlock_level,
 'unlocked',u.user_id is not null,'unlockedAt',u.unlocked_at,'equipped',e.cosmetic_key is not null) order by c.sort_order)
 into items from public.profile_cosmetics c
 left join public.profile_cosmetic_unlocks u on u.cosmetic_key=c.key and u.user_id=actor
 left join public.profile_cosmetic_equipment e on e.cosmetic_key=c.key and e.user_id=actor;
 return jsonb_build_object('catalogVersion',(select max(version) from public.profile_cosmetic_catalog_versions),'equipped',equipped,'items',coalesce(items,'[]'::jsonb));
end $$;
create function public.set_my_profile_cosmetic(p_slot text,p_cosmetic_key text) returns void
language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); cosmetic public.profile_cosmetics;
begin
 if actor is null then raise exception 'authentication_required' using errcode='28000';end if;
 if p_slot is null or p_slot not in ('title','badge','frame') then raise exception 'invalid_cosmetic_slot' using errcode='22023';end if;
 -- Serializes replacement/removal for this identity without introducing any XP lock.
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(actor::text,106106));
 if p_cosmetic_key is null then delete from public.profile_cosmetic_equipment where user_id=actor and slot=p_slot;return;end if;
 select * into cosmetic from public.profile_cosmetics where key=p_cosmetic_key;
 if not found then raise exception 'unknown_cosmetic' using errcode='22023';end if;
 if cosmetic.slot <> p_slot then raise exception 'cosmetic_slot_mismatch' using errcode='22023';end if;
 if not exists(select 1 from public.profile_cosmetic_unlocks where user_id=actor and cosmetic_key=p_cosmetic_key) then raise exception 'cosmetic_locked' using errcode='42501';end if;
 insert into public.profile_cosmetic_equipment(user_id,slot,cosmetic_key) values(actor,p_slot,p_cosmetic_key)
 on conflict(user_id,slot) do update set cosmetic_key=excluded.cosmetic_key,equipped_at=now()
 where public.profile_cosmetic_equipment.cosmetic_key is distinct from excluded.cosmetic_key;
end $$;
revoke all on function public.get_my_profile_cosmetics(),public.set_my_profile_cosmetic(text,text) from public,anon,authenticated,service_role;
grant execute on function public.get_my_profile_cosmetics(),public.set_my_profile_cosmetic(text,text) to authenticated;
notify pgrst,'reload schema';
