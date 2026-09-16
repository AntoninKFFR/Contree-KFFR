-- A single, private profile username is the account and multiplayer identity.
-- Existing profile rows are preserved; only missing rows are created at sign-up.
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text
);

alter table public.profiles add column if not exists username text;
create unique index if not exists profiles_username_unique_idx
  on public.profiles (username) where username is not null;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_username_valid' and conrelid = 'public.profiles'::regclass) then
    alter table public.profiles add constraint profiles_username_valid
      check (username is null or (
        length(btrim(username)) between 1 and 40
        and username = btrim(username)
        and username !~ '[[:cntrl:]]'
      )) not valid;
  end if;
end $$;

alter table public.profiles enable row level security;

-- Replace unknown legacy profile policies so no client can update another user.
do $$
declare policy_name text;
begin
  for policy_name in select policyname from pg_policies where schemaname = 'public' and tablename = 'profiles' loop
    execute format('drop policy %I on public.profiles', policy_name);
  end loop;
end $$;

create policy profiles_select_own on public.profiles for select to authenticated
  using (id = auth.uid());
create policy profiles_insert_own on public.profiles for insert to authenticated
  with check (id = auth.uid());
create policy profiles_update_own on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

revoke all on public.profiles from anon;
grant select on public.profiles to authenticated;
grant insert (id, username) on public.profiles to authenticated;
grant update (username) on public.profiles to authenticated;

create or replace function public.is_username_taken(p_username text)
returns boolean language sql security definer set search_path = '' as $$
  select exists (
    select 1 from public.profiles where username = btrim(p_username)
  );
$$;
revoke all on function public.is_username_taken(text) from public;
grant execute on function public.is_username_taken(text) to anon, authenticated, service_role;

create or replace function public.create_profile_for_auth_user()
returns trigger language plpgsql security definer set search_path = '' as $$
declare requested_username text;
begin
  requested_username := regexp_replace(btrim(new.raw_user_meta_data ->> 'username'), '[[:space:]]+', ' ', 'g');
  if requested_username is not null
     and length(requested_username) between 1 and 40
     and requested_username !~ '[[:cntrl:]]' then
    insert into public.profiles (id, username)
    values (new.id, requested_username)
    on conflict (id) do nothing;
  end if;
  return new;
end;
$$;
revoke all on function public.create_profile_for_auth_user() from public, anon, authenticated;

drop trigger if exists on_auth_user_created_profile on auth.users;
create trigger on_auth_user_created_profile
  after insert on auth.users for each row execute function public.create_profile_for_auth_user();
