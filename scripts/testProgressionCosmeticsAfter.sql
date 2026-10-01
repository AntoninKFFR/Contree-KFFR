do $$ begin
if (select count(*) from public.profile_cosmetic_unlocks where user_id='99999999-0000-4000-8000-000000001060')<>0 then raise exception 'backfill level 1';end if;
if (select count(*) from public.profile_cosmetic_unlocks where user_id='99999999-0000-4000-8000-000000001061')<>5 then raise exception 'backfill level 5';end if;
if (select count(*) from public.profile_cosmetic_unlocks where user_id='99999999-0000-4000-8000-000000001062')<>16 then raise exception 'backfill level 20';end if;
if (select count(*) from public.profile_cosmetic_unlocks where user_id='99999999-0000-4000-8000-000000001063')<>24 then raise exception 'backfill level 40';end if;
if exists(select 1 from public.profile_cosmetic_equipment) then raise exception 'automatic backfill equip';end if;
end $$;
delete from auth.users where id::text like '99999999-0000-4000-8000-%';
