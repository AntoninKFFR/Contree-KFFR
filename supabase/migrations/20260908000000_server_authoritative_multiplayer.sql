-- Server-authoritative multiplayer boundary. Apply with the Supabase CLI before deployment.
create extension if not exists pgcrypto;

create table if not exists public.rooms (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  status text not null default 'lobby' check (status in ('lobby','playing','finished','cancelled')),
  host_user_id uuid references auth.users(id) on delete set null,
  scoring_mode text not null check (scoring_mode in ('announced-points','made-points')),
  target_score integer not null check (target_score > 0),
  game_phase text check (game_phase in ('bidding','playing','finished','game-over')),
  state_version bigint not null default 0 check (state_version >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz
);

create table if not exists public.room_players (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  seat_index smallint not null check (seat_index between 0 and 3),
  kind text not null check (kind in ('human','bot','empty')),
  user_id uuid references auth.users(id) on delete set null,
  bot_profile_id text,
  display_name text check (char_length(display_name) <= 40),
  is_ready boolean not null default false,
  is_connected boolean not null default false,
  last_seen_at timestamptz,
  joined_at timestamptz,
  left_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (room_id, seat_index)
);

create unique index if not exists room_players_one_active_seat_per_user
  on public.room_players(room_id, user_id) where user_id is not null and kind = 'human';
create index if not exists room_players_room_id_idx on public.room_players(room_id);
create index if not exists rooms_code_idx on public.rooms(code);

-- Never exposed through browser queries or Realtime. Only service_role may access it.
create table if not exists public.room_game_states (
  room_id uuid primary key references public.rooms(id) on delete cascade,
  state jsonb not null,
  updated_at timestamptz not null default now()
);

do $$
begin
  if exists (select 1 from information_schema.columns where table_schema='public' and table_name='rooms' and column_name='server_state') then
    insert into public.room_game_states(room_id, state)
      select id, server_state from public.rooms where server_state is not null
      on conflict (room_id) do update set state = excluded.state, updated_at = now();
    alter table public.rooms drop column server_state;
  end if;
end $$;

alter table public.rooms enable row level security;
alter table public.room_players enable row level security;
alter table public.room_game_states enable row level security;

revoke all on public.rooms, public.room_players, public.room_game_states from anon, authenticated;
grant select on public.rooms to authenticated;
grant all on public.rooms, public.room_players, public.room_game_states to service_role;

create or replace function public.is_room_member(p_room_id uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.room_players
     where room_id = p_room_id and kind = 'human' and user_id = auth.uid()
  );
$$;
revoke all on function public.is_room_member(uuid) from public, anon;
grant execute on function public.is_room_member(uuid) to authenticated, service_role;

drop policy if exists rooms_authenticated_read on public.rooms;
create policy rooms_authenticated_read on public.rooms for select to authenticated
  using (host_user_id = auth.uid() or public.is_room_member(id));
drop policy if exists room_players_authenticated_read on public.room_players;
-- Deliberately no anon/authenticated policies for room_players or room_game_states.

do $$ begin
  alter publication supabase_realtime drop table public.room_game_states;
exception when undefined_object then null; when object_not_in_prerequisite_state then null;
end $$;
do $$ begin
  alter publication supabase_realtime add table public.rooms;
exception when duplicate_object then null; when undefined_object then null;
end $$;

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
  update public.rooms
     set state_version = state_version + 1,
         status = p_status,
         game_phase = p_game_phase,
         started_at = case when p_status = 'playing' then coalesce(started_at, now()) when p_status = 'lobby' then null else started_at end,
         finished_at = case when p_status = 'finished' then now() when p_status = 'lobby' then null else finished_at end,
         updated_at = now()
   where id = p_room_id and state_version = p_expected_version;
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
      from jsonb_to_recordset(p_players) as source(
        id uuid,
        kind text,
        user_id uuid,
        bot_profile_id text,
        display_name text,
        is_ready boolean,
        is_connected boolean,
        last_seen_at timestamptz,
        joined_at timestamptz,
        left_at timestamptz
      )
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
