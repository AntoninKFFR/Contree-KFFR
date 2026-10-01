-- #105: lazy Paris weeks, deterministic versioned selection; no backfill/cron.
create table public.progression_weekly_catalog_versions (
  version integer primary key check (version > 0),
  active_from_week date not null unique check (isfinite(active_from_week) and extract(isodow from active_from_week) = 1)
);
insert into public.progression_weekly_catalog_versions values (1,'2026-09-28');
create table public.progression_weekly_missions (
  catalog_version integer not null references public.progression_weekly_catalog_versions(version),
  key text not null check (length(key) between 1 and 80 and key ~ '^[a-z][a-z0-9_]*$'),
  family text not null check (length(family) between 1 and 80 and family ~ '^[a-z][a-z0-9_]*$'),
  objective_type text not null check (objective_type in ('completed_game','won_game','completed_solo','completed_multiplayer','completed_training')),
  target_count integer not null check (target_count between 1 and 1000000),
  reward_xp bigint not null check (reward_xp between 1 and 9007199254740991),
  sort_order integer not null check (sort_order > 0),
  primary key (catalog_version,key), unique (catalog_version,sort_order), unique (catalog_version,key,target_count)
);
insert into public.progression_weekly_missions values
  (1,'regular_games','games','completed_game',5,300,1),
  (1,'wins','wins','won_game',3,300,2),
  (1,'solo_games','solo','completed_solo',3,200,3),
  (1,'multiplayer_games','multiplayer','completed_multiplayer',2,250,4),
  (1,'training_series','training','completed_training',3,200,5);
create table public.progression_weekly_progress (
  user_id uuid not null references auth.users(id) on delete cascade,
  week_start date not null check (isfinite(week_start) and extract(isodow from week_start) = 1),
  catalog_version integer not null,
  mission_key text not null,
  -- Catalog-enforced snapshot allows a real CHECK on the capped counter.
  target_count integer not null,
  progress integer not null default 0 check (progress between 0 and target_count),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id,week_start,catalog_version,mission_key),
  foreign key (catalog_version,mission_key,target_count) references public.progression_weekly_missions(catalog_version,key,target_count),
  check ((completed_at is not null) = (progress = target_count))
);
create table public.progression_weekly_events (
  user_id uuid not null references auth.users(id) on delete cascade,
  week_start date not null check (isfinite(week_start) and extract(isodow from week_start) = 1),
  catalog_version integer not null,
  mission_key text not null,
  source_type text not null check (source_type in ('solo_game','multiplayer_game','training_series')),
  source_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (user_id,week_start,catalog_version,mission_key,source_type,source_id),
  foreign key (catalog_version,mission_key) references public.progression_weekly_missions(catalog_version,key)
);
alter table public.progression_weekly_catalog_versions enable row level security;
alter table public.progression_weekly_missions enable row level security;
alter table public.progression_weekly_progress enable row level security;
alter table public.progression_weekly_events enable row level security;
revoke all on public.progression_weekly_catalog_versions,public.progression_weekly_missions,public.progression_weekly_progress,public.progression_weekly_events
  from public,anon,authenticated,service_role;
grant select on public.progression_weekly_catalog_versions,public.progression_weekly_missions,public.progression_weekly_progress,public.progression_weekly_events to authenticated,service_role;
create policy weekly_versions_read on public.progression_weekly_catalog_versions for select to authenticated using (true);
create policy weekly_catalog_read on public.progression_weekly_missions for select to authenticated using (true);
create policy weekly_progress_owner_read on public.progression_weekly_progress for select to authenticated using (user_id = (select auth.uid()));
create policy weekly_events_owner_read on public.progression_weekly_events for select to authenticated using (user_id = (select auth.uid()));

create function private.weekly_week_start(p_at timestamptz) returns date
language sql immutable security invoker set search_path = '' as $$
  select date_trunc('week',p_at at time zone 'Europe/Paris')::date;
$$;
create function private.weekly_next_reset(p_week_start date) returns timestamptz
language sql immutable security invoker set search_path = '' as $$
  select (p_week_start + 7)::timestamp at time zone 'Europe/Paris';
$$;
create function private.get_weekly_selection(p_week_start date)
returns setof public.progression_weekly_missions language plpgsql stable security invoker set search_path = '' as $$
declare v_version integer; v_count integer;
begin
  if p_week_start is null or not isfinite(p_week_start) or extract(isodow from p_week_start) <> 1 then raise exception 'invalid_week_start' using errcode = '22023'; end if;
  select version into v_version from public.progression_weekly_catalog_versions where active_from_week <= p_week_start order by active_from_week desc limit 1;
  if not found then return; end if; -- No weekly catalog existed before launch.
  return query
    select m.* from public.progression_weekly_missions m join (
      select key,rank_hash,row_number() over (partition by family order by rank_hash,key collate "C") as family_rank
      from (select key,family,md5('v'||v_version::text||'|'||to_char(p_week_start,'YYYY-MM-DD')||'|'||key) collate "C" as rank_hash
        from public.progression_weekly_missions where catalog_version = v_version) hashes
    ) ranked on ranked.key = m.key
    where m.catalog_version = v_version and ranked.family_rank = 1 order by ranked.rank_hash,m.key collate "C" limit 3;
  get diagnostics v_count = row_count;
  if v_count <> 3 then raise exception 'weekly_catalog_requires_three_families' using errcode = '23514'; end if;
end;
$$;

create function private.apply_weekly_progression_event(
  p_user_id uuid,p_source_type text,p_source_id uuid,p_event_at timestamptz,
  p_game_mode text default null,p_won boolean default null,p_processing_at timestamptz default null
) returns integer language plpgsql security definer set search_path = '' as $$
declare v_week date; v_now timestamptz; v_mission public.progression_weekly_missions;
  v_before integer; v_progress integer; v_inserted uuid; v_credit jsonb; v_changed integer := 0;
begin
  if p_user_id is null or p_source_id is null or p_event_at is null or not isfinite(p_event_at)
    or (p_processing_at is not null and not isfinite(p_processing_at))
    or p_source_type is null or p_source_type not in ('solo_game','multiplayer_game','training_series')
    or (p_source_type = 'solo_game' and (p_game_mode is distinct from 'solo' or p_won is null))
    or (p_source_type = 'multiplayer_game' and (p_game_mode is distinct from 'multiplayer' or p_won is null))
    or (p_source_type = 'training_series' and (p_game_mode is not null or p_won is not null)) then
    raise exception 'invalid_weekly_source' using errcode = '22023';
  end if;
  v_week := private.weekly_week_start(p_event_at);
  v_now := coalesce(p_processing_at,clock_timestamp());
  if v_week <> private.weekly_week_start(v_now) or p_event_at > v_now then return 0; end if;
  insert into public.player_progression(user_id) values (p_user_id) on conflict (user_id) do nothing;
  perform 1 from public.player_progression where user_id = p_user_id for update;
  -- Recheck after waiting for the global player lock: a reset may have occurred.
  v_now := coalesce(p_processing_at,clock_timestamp());
  if v_week <> private.weekly_week_start(v_now) or p_event_at > v_now then return 0; end if;
  for v_mission in select * from private.get_weekly_selection(v_week) loop
    if not coalesce(((v_mission.objective_type = 'completed_game' and p_game_mode is not null)
      or (v_mission.objective_type = 'won_game' and p_won is true)
      or (v_mission.objective_type = 'completed_solo' and p_game_mode = 'solo')
      or (v_mission.objective_type = 'completed_multiplayer' and p_game_mode = 'multiplayer')
      or (v_mission.objective_type = 'completed_training' and p_source_type = 'training_series')),false) then continue; end if;
    v_inserted := null;
    insert into public.progression_weekly_events(user_id,week_start,catalog_version,mission_key,source_type,source_id)
      values (p_user_id,v_week,v_mission.catalog_version,v_mission.key,p_source_type,p_source_id)
      on conflict do nothing returning source_id into v_inserted;
    if v_inserted is null then continue; end if;
    insert into public.progression_weekly_progress(user_id,week_start,catalog_version,mission_key,target_count)
      values(p_user_id,v_week,v_mission.catalog_version,v_mission.key,v_mission.target_count) on conflict do nothing;
    select progress into v_before from public.progression_weekly_progress
      where user_id=p_user_id and week_start=v_week and catalog_version=v_mission.catalog_version and mission_key=v_mission.key;
    v_progress := least(v_before + 1,v_mission.target_count);
    update public.progression_weekly_progress set progress=v_progress,
      completed_at=case when v_progress=v_mission.target_count then coalesce(completed_at,v_now) else null end,updated_at=v_now
      where user_id=p_user_id and week_start=v_week and catalog_version=v_mission.catalog_version and mission_key=v_mission.key;
    if v_before < v_mission.target_count then v_changed := v_changed + 1; end if;
    if v_before < v_mission.target_count and v_progress=v_mission.target_count then
      v_credit := public.credit_progression_xp(p_user_id,v_mission.reward_xp,'weekly_mission',
        'v'||v_mission.catalog_version::text||':'||to_char(v_week,'YYYY-MM-DD')||':'||v_mission.key);
      if (v_credit->>'credited')::boolean is distinct from true then raise exception 'weekly_ledger_inconsistent' using errcode='23514'; end if;
    end if;
  end loop;
  return v_changed;
end;
$$;
revoke all on function private.weekly_week_start(timestamptz),private.weekly_next_reset(date),private.get_weekly_selection(date),
  private.apply_weekly_progression_event(uuid,text,uuid,timestamptz,text,boolean,timestamptz) from public,anon,authenticated,service_role;

-- Explicit current-user filtering is required because the private selector is not
-- browser-executable. Reading this definer RPC never creates progress rows.
create function public.get_my_weekly_missions() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_user uuid := auth.uid(); v_now timestamptz := statement_timestamp();
  v_week date := private.weekly_week_start(v_now); v_missions jsonb; v_version integer;
begin
  if v_user is null then raise exception 'authentication_required' using errcode='28000'; end if;
  select version into v_version from public.progression_weekly_catalog_versions where active_from_week <= v_week order by active_from_week desc limit 1;
  select jsonb_agg(jsonb_build_object('key',m.key,'target',m.target_count,'progress',coalesce(p.progress,0),
    'rewardXp',m.reward_xp,'completed',p.completed_at is not null,'completedAt',p.completed_at) order by m.sort_order)
    into v_missions from private.get_weekly_selection(v_week) m left join public.progression_weekly_progress p
    on p.user_id=v_user and p.week_start=v_week and p.catalog_version=m.catalog_version and p.mission_key=m.key;
  return jsonb_build_object('catalogVersion',v_version,'weekStart',v_week,'serverNow',v_now,'nextResetAt',private.weekly_next_reset(v_week),'missions',coalesce(v_missions,'[]'::jsonb));
end;
$$;
revoke all on function public.get_my_weekly_missions() from public,anon,authenticated,service_role;
grant execute on function public.get_my_weekly_missions() to authenticated;

alter table public.progression_multiplayer_jobs add column weekly_missions_eligible boolean not null default false;
create or replace function private.enqueue_progression_multiplayer_game() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.progression_multiplayer_jobs(game_id,permanent_missions_eligible,weekly_missions_eligible) values(new.id,true,true);
  return new;
end;
$$;
revoke all on function private.enqueue_progression_multiplayer_game() from public,anon,authenticated;
grant execute on function private.enqueue_progression_multiplayer_game() to service_role;

create or replace function private.complete_solo_permanent_missions() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  -- Ignore imported legacy history / administrative inserts without a server session.
  if not exists (select 1 from public.solo_game_sessions where id = new.id and user_id = new.user_id) then return new; end if;
  perform private.complete_permanent_mission(new.user_id,'first_game','solo_game',new.id);
  perform private.complete_permanent_mission(new.user_id,'first_solo','solo_game',new.id);
  if new.won then perform private.complete_permanent_mission(new.user_id,'first_win','solo_game',new.id); end if;
  perform private.apply_weekly_progression_event(new.user_id,'solo_game',new.id,new.created_at,'solo',new.won);
  return new;
end;
$$;
revoke all on function private.complete_solo_permanent_missions() from public,anon,authenticated,service_role;

create or replace function public.apply_progression_multiplayer_game(p_game_id uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_job public.progression_multiplayer_jobs;
  v_game public.multiplayer_games;
  v_player public.multiplayer_game_players;
  v_amount bigint;
begin
  if p_game_id is null then raise exception 'invalid_progression_game_id' using errcode = '22023'; end if;
  select * into v_job from public.progression_multiplayer_jobs where game_id = p_game_id for update;
  if not found then raise exception 'progression_game_not_eligible' using errcode = 'P0002'; end if;
  if v_job.applied_at is not null then return 'already_applied'; end if;
  select * into strict v_game from public.multiplayer_games where id = p_game_id;
  if v_game.finished_at is null or v_game.winner_team not in (0,1)
    or (select count(*) from public.multiplayer_game_players where game_id = p_game_id) <> 4
    or exists (select user_id from public.multiplayer_game_players
      where game_id = p_game_id and kind = 'human' and user_id is not null
      group by user_id having count(*) > 1) then
    raise exception 'progression_game_incomplete' using errcode = '23514';
  end if;
  -- Same lock order across games prevents multi-player credit deadlocks.
  for v_player in select * from public.multiplayer_game_players
    where game_id = p_game_id and kind = 'human' and user_id is not null order by user_id loop
    v_amount := private.progression_game_xp('multiplayer',v_player.team_id = v_game.winner_team,v_game.end_reason,'human');
    if v_amount > 0 then
      perform public.credit_progression_xp(v_player.user_id,v_amount,'multiplayer_game',p_game_id::text);
      -- All credits for one human precede the next UUID, preserving lock order.
      if v_job.permanent_missions_eligible then
        perform private.complete_permanent_mission(v_player.user_id,'first_game','multiplayer_game',p_game_id);
        perform private.complete_permanent_mission(v_player.user_id,'first_multiplayer','multiplayer_game',p_game_id);
        if v_player.team_id = v_game.winner_team then
          perform private.complete_permanent_mission(v_player.user_id,'first_win','multiplayer_game',p_game_id);
        end if;
      end if;
      if v_job.weekly_missions_eligible then
        perform private.apply_weekly_progression_event(v_player.user_id,'multiplayer_game',p_game_id,v_game.finished_at,'multiplayer',v_player.team_id=v_game.winner_team);
      end if;
    end if;
  end loop;
  update public.progression_multiplayer_jobs set applied_at = now() where game_id = p_game_id;
  return 'applied';
end;
$$;
revoke all on function public.apply_progression_multiplayer_game(uuid) from public, anon, authenticated;
grant execute on function public.apply_progression_multiplayer_game(uuid) to service_role;



create or replace function public.record_verified_training_series(
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

  -- Called only by the trusted route AFTER JWT validation and server replay.
  -- Direct service inserts and other training modes do not complete a mission.
  perform private.complete_permanent_mission(p_user_id,'first_training','training_series',v_series.id);
  perform private.apply_weekly_progression_event(p_user_id,'training_series',v_series.id,v_series.created_at);

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
    series_id = case
      when excluded.best_score > public.training_records.best_score then excluded.series_id
      when excluded.best_score = public.training_records.best_score
        and excluded.best_duration_ms is not null
        and (public.training_records.best_duration_ms is null
          or excluded.best_duration_ms < public.training_records.best_duration_ms)
        then excluded.series_id
      else public.training_records.series_id
    end,
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
