-- Permanent XP foundations only. No game/training/mission hook is installed.
-- Keep values exactly representable by the canonical TypeScript number helper.
create table public.player_progression (
  user_id uuid primary key references auth.users(id) on delete cascade,
  total_xp bigint not null default 0 check (total_xp between 0 and 9007199254740991),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.progression_xp_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  amount bigint not null check (amount between 1 and 9007199254740991),
  source_type text not null check (source_type in (
    'solo_game', 'multiplayer_game', 'permanent_mission', 'weekly_mission', 'training_mission'
  )),
  source_id text not null check (
    length(source_id) between 1 and 200 and source_id = btrim(source_id)
    and source_id !~ '[[:cntrl:]]'
  ),
  created_at timestamptz not null default now(),
  constraint progression_xp_events_source_unique unique (user_id, source_type, source_id)
);
create index progression_xp_events_user_created_idx
  on public.progression_xp_events(user_id, created_at desc, id desc);

alter table public.player_progression enable row level security;
alter table public.progression_xp_events enable row level security;
revoke all on public.player_progression, public.progression_xp_events
  from public, anon, authenticated, service_role;
grant select on public.player_progression, public.progression_xp_events to authenticated, service_role;
create policy player_progression_owner_read on public.player_progression
  for select to authenticated using (user_id = (select auth.uid()));
create policy progression_xp_events_owner_read on public.progression_xp_events
  for select to authenticated using (user_id = (select auth.uid()));

-- An invoker read uses owner RLS. Reading never creates rows or mutates XP.
create function public.get_my_progression() returns jsonb
language plpgsql stable security invoker set search_path = '' as $$
declare
  v_actor uuid := (select auth.uid());
  v_total bigint;
begin
  if v_actor is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;
  select total_xp into v_total from public.player_progression where user_id = v_actor;
  return pg_catalog.jsonb_build_object('total_xp', coalesce(v_total, 0));
end;
$$;
revoke all on function public.get_my_progression() from public, anon, authenticated, service_role;
grant execute on function public.get_my_progression() to authenticated;

-- Only trusted server code may choose the user, amount and stable source.
-- No HTTP endpoint or browser-callable award RPC accompanies this foundation.
-- Table writes are revoked even from service_role: use this atomic path.
create function public.credit_progression_xp(
  p_user_id uuid, p_amount bigint, p_source_type text, p_source_id text
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_total bigint;
  v_event public.progression_xp_events;
  v_credited boolean;
begin
  if p_user_id is null or p_amount is null or p_amount < 1 or p_amount > 9007199254740991
    or p_source_type is null or p_source_type not in (
      'solo_game', 'multiplayer_game', 'permanent_mission', 'weekly_mission', 'training_mission'
    ) or p_source_id is null or length(p_source_id) not between 1 and 200
    or p_source_id <> btrim(p_source_id) or p_source_id ~ '[[:cntrl:]]' then
    raise exception 'invalid_progression_event' using errcode = '22023';
  end if;

  insert into public.player_progression(user_id) values (p_user_id)
    on conflict (user_id) do nothing;
  -- Serialize all sources for this player, including concurrent first credits.
  select total_xp into v_total from public.player_progression
    where user_id = p_user_id for update;

  insert into public.progression_xp_events(user_id, amount, source_type, source_id)
    values (p_user_id, p_amount, p_source_type, p_source_id)
    on conflict (user_id, source_type, source_id) do nothing
    returning * into v_event;
  v_credited := found;
  if v_credited then
    update public.player_progression set total_xp = total_xp + p_amount, updated_at = now()
      where user_id = p_user_id returning total_xp into v_total;
  else
    select * into v_event from public.progression_xp_events
      where user_id = p_user_id and source_type = p_source_type and source_id = p_source_id;
    -- A retry with a changed reward is a caller bug, not another award.
    if v_event.amount <> p_amount then
      raise exception 'progression_source_amount_mismatch' using errcode = '23514';
    end if;
  end if;
  -- total_xp is the current locked balance; event_id/amount are stable on retry.
  return pg_catalog.jsonb_build_object(
    'event_id', v_event.id, 'amount', v_event.amount, 'credited', v_credited, 'total_xp', v_total
  );
end;
$$;
revoke all on function public.credit_progression_xp(uuid, bigint, text, text)
  from public, anon, authenticated, service_role;
grant execute on function public.credit_progression_xp(uuid, bigint, text, text) to service_role;

notify pgrst, 'reload schema';
