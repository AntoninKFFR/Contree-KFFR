-- Verified puzzle series are written only by the server with service_role.
create table public.training_series (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  mode text not null check (mode in ('puzzle', 'in-game')),
  axis_id text not null,
  axis_version integer not null check (axis_version > 0),
  level integer not null check (level > 0),
  ruleset_id text not null,
  ruleset_version integer not null check (ruleset_version > 0),
  generator_version integer not null check (generator_version > 0),
  seed bigint not null,
  answers jsonb not null check (pg_catalog.jsonb_typeof(answers) = 'array'),
  question_count integer not null check (question_count > 0),
  score numeric not null check (score >= 0 and score <= question_count),
  duration_ms integer not null check (duration_ms >= 0),
  timed boolean not null,
  created_at timestamptz not null default now()
);
create index training_series_user_axis_level_created on public.training_series(user_id, axis_id, level, created_at desc);
create index training_series_user_axis_recent on public.training_series(user_id, axis_id, created_at desc, id desc);

create table public.training_records (
  user_id uuid not null references auth.users(id) on delete cascade,
  axis_id text not null,
  level integer not null check (level > 0),
  best_score numeric not null check (best_score >= 0),
  best_duration_ms integer null check (best_duration_ms >= 0),
  best_speed integer null check (best_speed >= 0),
  series_id uuid null references public.training_series(id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (user_id, axis_id, level)
);

alter table public.training_series enable row level security;
alter table public.training_records enable row level security;
revoke all on public.training_series, public.training_records from public, anon, authenticated;
grant select on public.training_series, public.training_records to authenticated;
grant all on public.training_series, public.training_records to service_role;

create policy training_series_owner_read on public.training_series for select to authenticated
  using (user_id = (select auth.uid()));
create policy training_records_owner_read on public.training_records for select to authenticated
  using (user_id = (select auth.uid()));

-- The caller is the trusted server, after replaying and grading the entire series.
-- One transaction covers insertion, record update and quota; a per-user-axis lock
-- also serializes concurrent submissions for the same account and axis.
create function public.record_verified_training_series(
  p_user_id uuid, p_axis_id text, p_axis_version integer, p_level integer,
  p_ruleset_id text, p_ruleset_version integer, p_generator_version integer,
  p_seed bigint, p_answers jsonb, p_question_count integer, p_score numeric,
  p_duration_ms integer, p_timed boolean
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_series public.training_series;
  v_record public.training_records;
  v_perfect_time integer;
begin
  if p_user_id is null or p_axis_id is null or p_axis_id = '' or p_score is null
    or p_question_count is null or p_score < 0 or p_score > p_question_count then
    raise exception 'invalid_verified_series' using errcode = 'P0001';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_user_id::text || ':' || p_axis_id, 441044));
  v_perfect_time := case when p_timed and p_score = p_question_count then p_duration_ms else null end;

  insert into public.training_series (
    user_id, mode, axis_id, axis_version, level, ruleset_id, ruleset_version,
    generator_version, seed, answers, question_count, score, duration_ms, timed
  ) values (
    p_user_id, 'puzzle', p_axis_id, p_axis_version, p_level, p_ruleset_id, p_ruleset_version,
    p_generator_version, p_seed, p_answers, p_question_count, p_score, p_duration_ms, p_timed
  ) returning * into v_series;

  insert into public.training_records (
    user_id, axis_id, level, best_score, best_duration_ms, best_speed, series_id
  ) values (p_user_id, p_axis_id, p_level, p_score, v_perfect_time, null, v_series.id)
  on conflict (user_id, axis_id, level) do update set
    best_score = greatest(public.training_records.best_score, excluded.best_score),
    best_duration_ms = case
      when excluded.best_duration_ms is null then public.training_records.best_duration_ms
      when public.training_records.best_duration_ms is null then excluded.best_duration_ms
      else least(public.training_records.best_duration_ms, excluded.best_duration_ms)
    end,
    series_id = case when excluded.best_score > public.training_records.best_score
      then excluded.series_id else public.training_records.series_id end,
    updated_at = now()
  returning * into v_record;

  delete from public.training_series as old
  using (
    select id from (
      select id, pg_catalog.row_number() over (order by created_at desc, id desc) as position
      from public.training_series where user_id = p_user_id and axis_id = p_axis_id
    ) ranked where position > 50
  ) expired
  where old.id = expired.id;

  return pg_catalog.jsonb_build_object('series', pg_catalog.to_jsonb(v_series), 'record', pg_catalog.to_jsonb(v_record));
end;
$$;
revoke all on function public.record_verified_training_series(
  uuid, text, integer, integer, text, integer, integer, bigint, jsonb, integer, numeric, integer, boolean
) from public, anon, authenticated;
grant execute on function public.record_verified_training_series(
  uuid, text, integer, integer, text, integer, integer, bigint, jsonb, integer, numeric, integer, boolean
) to service_role;

notify pgrst, 'reload schema';
