-- L1: server-authoritative training duo. No multiplayer game or training record is written here.
create extension if not exists pgcrypto;

create table public.training_duo_sessions (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{10}$'),
  host_user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'lobby' check (status in ('lobby', 'active', 'completed', 'cancelled')),
  question_phase text check (question_phase in ('answering', 'revealed')),
  level integer not null check (level between 1 and 4),
  axis_id text not null default 'bid-reading' check (axis_id = 'bid-reading'),
  axis_version integer not null default 1 check (axis_version = 1),
  doctrine_id text not null default 'advanced_rules_v4' check (doctrine_id = 'advanced_rules_v4'),
  doctrine_revision text not null default '4.1' check (doctrine_revision = '4.1'),
  generator_version integer not null default 1 check (generator_version = 1),
  ruleset_id text not null default 'contree-kffr' check (ruleset_id = 'contree-kffr'),
  ruleset_version integer not null default 1 check (ruleset_version = 1),
  series_length integer not null default 10 check (series_length = 10),
  current_index integer not null default 0 check (current_index between 0 and 9),
  state_version bigint not null default 0 check (state_version >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz,
  cancel_reason text,
  constraint training_duo_phase_consistency check (
    (status = 'lobby' and question_phase is null and started_at is null and finished_at is null)
    or (status = 'active' and question_phase in ('answering', 'revealed') and started_at is not null and finished_at is null)
    or (status = 'completed' and question_phase is null and started_at is not null and finished_at is not null)
    or (status = 'cancelled' and question_phase is null and finished_at is not null)
  )
);

create table public.training_duo_session_secrets (
  session_id uuid primary key references public.training_duo_sessions(id) on delete cascade,
  seed bigint not null check (seed between 0 and 9007199254731991)
);

create table public.training_duo_participants (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.training_duo_sessions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  slot smallint not null check (slot in (0, 1)),
  display_name text not null check (char_length(display_name) between 1 and 40),
  is_ready boolean not null default false,
  last_seen_at timestamptz,
  ready_for_next boolean not null default false,
  joined_at timestamptz not null default now(),
  left_at timestamptz,
  unique (session_id, user_id)
);
create unique index training_duo_active_slot on public.training_duo_participants(session_id, slot)
  where left_at is null;
create index training_duo_participants_session on public.training_duo_participants(session_id);

create table public.training_duo_answers (
  session_id uuid not null references public.training_duo_sessions(id) on delete cascade,
  question_index integer not null check (question_index between 0 and 9),
  user_id uuid not null,
  answer jsonb not null,
  score smallint not null check (score in (0, 1)),
  submitted_at timestamptz not null default now(),
  primary key (session_id, question_index, user_id),
  foreign key (session_id, user_id)
    references public.training_duo_participants(session_id, user_id) on delete cascade
);

-- Account deletion of either participant removes the entire ephemeral session.
-- Lobby leave only sets left_at and never fires this trigger.
create function public.training_duo_delete_session_after_participant() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if old.left_at is null then
    delete from public.training_duo_sessions where id = old.session_id;
  end if;
  return old;
end;
$$;
create trigger training_duo_participant_deleted
  after delete on public.training_duo_participants
  for each row execute function public.training_duo_delete_session_after_participant();
revoke all on function public.training_duo_delete_session_after_participant() from public, anon, authenticated;

alter table public.training_duo_sessions enable row level security;
alter table public.training_duo_session_secrets enable row level security;
alter table public.training_duo_participants enable row level security;
alter table public.training_duo_answers enable row level security;
revoke all on public.training_duo_sessions, public.training_duo_session_secrets,
  public.training_duo_participants, public.training_duo_answers from public, anon, authenticated;
grant all on public.training_duo_sessions, public.training_duo_session_secrets,
  public.training_duo_participants, public.training_duo_answers to service_role;

create function public.is_training_duo_member(p_session_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.training_duo_participants
    where session_id = p_session_id and user_id = (select auth.uid()) and left_at is null
  );
$$;
revoke all on function public.is_training_duo_member(uuid) from public, anon;
grant execute on function public.is_training_duo_member(uuid) to authenticated, service_role;

create policy training_duo_sessions_member_read on public.training_duo_sessions
  for select to authenticated using (public.is_training_duo_member(id));
create policy training_duo_participants_member_read on public.training_duo_participants
  for select to authenticated using (public.is_training_duo_member(session_id));

grant select (id, status, question_phase, current_index, state_version, updated_at)
  on public.training_duo_sessions to authenticated;
grant select (id, session_id, slot, is_ready, ready_for_next, last_seen_at)
  on public.training_duo_participants to authenticated;

alter publication supabase_realtime add table public.training_duo_sessions (
  id, status, question_phase, current_index, state_version, updated_at
);
alter publication supabase_realtime add table public.training_duo_participants (
  id, session_id, slot, is_ready, ready_for_next, last_seen_at
);

-- Service-role-only RPCs provide one SQL transaction and a session row lock.
create function public.training_duo_create(
  p_actor uuid, p_display_name text, p_code text, p_level integer
) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  if p_level not between 1 and 4 or char_length(p_display_name) not between 1 and 40 then
    raise exception 'duo_invalid_request' using errcode = 'P0001';
  end if;
  insert into public.training_duo_sessions(code, host_user_id, level)
    values (p_code, p_actor, p_level) returning id into v_id;
  insert into public.training_duo_participants(session_id, user_id, slot, display_name, last_seen_at)
    values (v_id, p_actor, 0, p_display_name, clock_timestamp());
  return v_id;
end;
$$;

create function public.training_duo_join(
  p_actor uuid, p_display_name text, p_code text
) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_session public.training_duo_sessions%rowtype;
declare v_existing public.training_duo_participants%rowtype;
begin
  select * into v_session from public.training_duo_sessions where code = p_code for update;
  if not found then raise exception 'duo_session_not_found' using errcode = 'P0001'; end if;
  if v_session.status = 'lobby' and v_session.updated_at <= clock_timestamp() - interval '30 minutes' then
    update public.training_duo_sessions set status = 'cancelled', question_phase = null,
      finished_at = clock_timestamp(), updated_at = clock_timestamp(),
      cancel_reason = 'expired', state_version = state_version + 1 where id = v_session.id;
    return null;
  end if;
  if v_session.status <> 'lobby' then raise exception 'duo_session_not_found' using errcode = 'P0001'; end if;
  select * into v_existing from public.training_duo_participants
    where session_id = v_session.id and user_id = p_actor;
  if found and v_existing.left_at is null then return v_session.id; end if;
  if exists (select 1 from public.training_duo_participants
    where session_id = v_session.id and slot = 1 and left_at is null)
    or p_actor = v_session.host_user_id then
    raise exception 'duo_session_not_found' using errcode = 'P0001';
  end if;
  if v_existing.id is not null then
    update public.training_duo_participants set left_at = null, is_ready = false,
      ready_for_next = false, last_seen_at = clock_timestamp(), joined_at = clock_timestamp(),
      display_name = p_display_name where id = v_existing.id;
  else
    insert into public.training_duo_participants(session_id, user_id, slot, display_name, last_seen_at)
      values (v_session.id, p_actor, 1, p_display_name, clock_timestamp());
  end if;
  update public.training_duo_sessions set state_version = state_version + 1,
    updated_at = clock_timestamp() where id = v_session.id;
  return v_session.id;
end;
$$;

create function public.training_duo_expire(p_session_id uuid, p_actor uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_session public.training_duo_sessions%rowtype;
begin
  select * into v_session from public.training_duo_sessions where id = p_session_id for update;
  if not found or not exists (select 1 from public.training_duo_participants
      where session_id = p_session_id and user_id = p_actor and left_at is null) then
    raise exception 'duo_session_not_found' using errcode = 'P0001';
  end if;
  if (v_session.status = 'lobby' and v_session.updated_at <= clock_timestamp() - interval '30 minutes')
    or (v_session.status = 'active' and v_session.started_at <= clock_timestamp() - interval '2 hours') then
    update public.training_duo_sessions set status = 'cancelled', question_phase = null,
      finished_at = clock_timestamp(), updated_at = clock_timestamp(),
      cancel_reason = 'expired', state_version = state_version + 1 where id = p_session_id;
  end if;
end;
$$;

create function public.training_duo_heartbeat(p_session_id uuid, p_actor uuid) returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  update public.training_duo_participants as p set last_seen_at = clock_timestamp()
    where p.session_id = p_session_id and p.user_id = p_actor and p.left_at is null
      and exists (select 1 from public.training_duo_sessions as s
        where s.id = p_session_id and s.status in ('lobby', 'active'));
  return found;
end;
$$;

create function public.training_duo_mutate(
  p_session_id uuid, p_actor uuid, p_expected_version bigint, p_type text,
  p_ready boolean default null, p_seed bigint default null, p_base_seed bigint default null,
  p_question_index integer default null, p_answer jsonb default null, p_score smallint default null
) returns void language plpgsql security definer set search_path = '' as $$
declare v_session public.training_duo_sessions%rowtype;
declare v_me public.training_duo_participants%rowtype;
declare v_old_answer jsonb;
declare v_count integer;
begin
  select * into v_session from public.training_duo_sessions where id = p_session_id for update;
  if not found then raise exception 'duo_session_not_found' using errcode = 'P0001'; end if;
  select * into v_me from public.training_duo_participants
    where session_id = p_session_id and user_id = p_actor and left_at is null;
  if not found then raise exception 'duo_session_not_found' using errcode = 'P0001'; end if;
  if (v_session.status = 'lobby' and v_session.updated_at <= clock_timestamp() - interval '30 minutes')
    or (v_session.status = 'active' and v_session.started_at <= clock_timestamp() - interval '2 hours') then
    update public.training_duo_sessions set status = 'cancelled', question_phase = null,
      finished_at = clock_timestamp(), updated_at = clock_timestamp(),
      cancel_reason = 'expired', state_version = state_version + 1 where id = p_session_id;
    return;
  end if;

  -- Idempotent cases precede CAS, but only for the same member and question.
  if p_type = 'submit-answer' and p_question_index is not null then
    select answer into v_old_answer from public.training_duo_answers
      where session_id = p_session_id and question_index = p_question_index and user_id = p_actor;
    if found then
      if v_old_answer = p_answer then return; end if;
      raise exception 'duo_already_answered' using errcode = 'P0001';
    end if;
  elsif p_type = 'set-ready' and v_session.status = 'lobby' and v_me.is_ready = p_ready then
    return;
  elsif p_type = 'ready-next' and v_session.status = 'active'
    and v_session.question_phase = 'revealed' and v_me.ready_for_next then
    return;
  end if;
  if v_session.state_version <> p_expected_version then
    raise exception 'duo_version_conflict' using errcode = 'P0001';
  end if;

  if p_type = 'set-ready' then
    if v_session.status <> 'lobby' or p_ready is null then
      raise exception 'duo_wrong_status' using errcode = 'P0001'; end if;
    update public.training_duo_participants set is_ready = p_ready where id = v_me.id;
  elsif p_type = 'start' then
    if v_me.slot <> 0 then raise exception 'duo_host_required' using errcode = 'P0001'; end if;
    if v_session.status <> 'lobby' then raise exception 'duo_wrong_status' using errcode = 'P0001'; end if;
    select count(*) into v_count from public.training_duo_participants
      where session_id = p_session_id and left_at is null;
    if v_count <> 2 then raise exception 'duo_waiting_for_partner' using errcode = 'P0001'; end if;
    select count(*) into v_count from public.training_duo_participants
      where session_id = p_session_id and left_at is null and is_ready;
    if v_count <> 2 then raise exception 'duo_waiting_for_partner' using errcode = 'P0001'; end if;
    select count(*) into v_count from public.training_duo_participants
      where session_id = p_session_id and left_at is null
        and last_seen_at >= clock_timestamp() - interval '60 seconds';
    if v_count <> 2 then raise exception 'duo_partner_offline' using errcode = 'P0001'; end if;
    if p_seed is null or p_seed < 0 or p_seed > 9007199254731991 then
      raise exception 'duo_invalid_request' using errcode = 'P0001'; end if;
    insert into public.training_duo_session_secrets(session_id, seed) values (p_session_id, p_seed);
    update public.training_duo_sessions set status = 'active', question_phase = 'answering',
      started_at = clock_timestamp() where id = p_session_id;
  elsif p_type = 'submit-answer' then
    if v_session.status <> 'active' or v_session.question_phase <> 'answering'
      or p_question_index is distinct from v_session.current_index then
      raise exception 'duo_wrong_status' using errcode = 'P0001'; end if;
    if p_score is null or p_score not in (0, 1) or p_answer is null or not exists
      (select 1 from public.training_duo_session_secrets
        where session_id = p_session_id and seed = p_base_seed) then
      raise exception 'duo_invalid_answer' using errcode = 'P0001'; end if;
    insert into public.training_duo_answers(session_id, question_index, user_id, answer, score)
      values (p_session_id, p_question_index, p_actor, p_answer, p_score);
    select count(*) into v_count from public.training_duo_answers
      where session_id = p_session_id and question_index = p_question_index;
    if v_count = 2 then
      update public.training_duo_sessions set question_phase = 'revealed' where id = p_session_id;
    end if;
  elsif p_type = 'ready-next' then
    if v_session.status <> 'active' or v_session.question_phase <> 'revealed' then
      raise exception 'duo_wrong_status' using errcode = 'P0001'; end if;
    update public.training_duo_participants set ready_for_next = true where id = v_me.id;
    select count(*) into v_count from public.training_duo_participants
      where session_id = p_session_id and left_at is null and ready_for_next;
    if v_count = 2 then
      if v_session.current_index = 9 then
        update public.training_duo_sessions set status = 'completed', question_phase = null,
          finished_at = clock_timestamp() where id = p_session_id;
      else
        update public.training_duo_sessions set current_index = current_index + 1,
          question_phase = 'answering' where id = p_session_id;
        update public.training_duo_participants set ready_for_next = false
          where session_id = p_session_id and left_at is null;
      end if;
    end if;
  elsif p_type = 'leave' then
    if v_session.status = 'lobby' and v_me.slot = 1 then
      update public.training_duo_participants set left_at = clock_timestamp(),
        is_ready = false, ready_for_next = false, last_seen_at = null where id = v_me.id;
      update public.training_duo_participants set is_ready = false
        where session_id = p_session_id and left_at is null;
    elsif v_session.status in ('lobby', 'active') then
      update public.training_duo_sessions set status = 'cancelled', question_phase = null,
        finished_at = clock_timestamp(), cancel_reason = 'left' where id = p_session_id;
    else raise exception 'duo_wrong_status' using errcode = 'P0001'; end if;
  elsif p_type = 'cancel' then
    if v_me.slot <> 0 then raise exception 'duo_host_required' using errcode = 'P0001'; end if;
    if v_session.status <> 'lobby' then raise exception 'duo_wrong_status' using errcode = 'P0001'; end if;
    update public.training_duo_sessions set status = 'cancelled', question_phase = null,
      finished_at = clock_timestamp(), cancel_reason = 'cancelled' where id = p_session_id;
  else raise exception 'duo_invalid_request' using errcode = 'P0001';
  end if;
  update public.training_duo_sessions set state_version = state_version + 1,
    updated_at = clock_timestamp() where id = p_session_id;
end;
$$;

revoke all on function public.training_duo_create(uuid,text,text,integer),
  public.training_duo_join(uuid,text,text), public.training_duo_expire(uuid,uuid),
  public.training_duo_heartbeat(uuid,uuid),
  public.training_duo_mutate(uuid,uuid,bigint,text,boolean,bigint,bigint,integer,jsonb,smallint)
  from public, anon, authenticated;
grant execute on function public.training_duo_create(uuid,text,text,integer),
  public.training_duo_join(uuid,text,text), public.training_duo_expire(uuid,uuid),
  public.training_duo_heartbeat(uuid,uuid),
  public.training_duo_mutate(uuid,uuid,bigint,text,boolean,bigint,bigint,integer,jsonb,smallint)
  to service_role;
