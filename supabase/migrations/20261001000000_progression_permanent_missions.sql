-- #104: only NEW authoritative events; no historical completion backfill.
create table public.progression_permanent_missions (
  key text primary key check (key in ('first_game','first_win','first_solo','first_multiplayer','first_training')),
  reward_xp bigint not null check (reward_xp > 0 and reward_xp <= 9007199254740991),
  sort_order integer not null unique check (sort_order between 1 and 5)
);
insert into public.progression_permanent_missions(key,reward_xp,sort_order) values
  ('first_game',100,1),('first_win',150,2),('first_solo',100,3),
  ('first_multiplayer',150,4),('first_training',100,5);
create table public.progression_permanent_mission_completions (
  user_id uuid not null references auth.users(id) on delete cascade,
  mission_key text not null references public.progression_permanent_missions(key),
  completed_at timestamptz not null default now(),
  source_type text not null check (source_type in ('solo_game','multiplayer_game','training_series')),
  source_id uuid not null,
  primary key (user_id,mission_key)
);
alter table public.progression_permanent_missions enable row level security;
alter table public.progression_permanent_mission_completions enable row level security;
revoke all on public.progression_permanent_missions,public.progression_permanent_mission_completions
  from public,anon,authenticated,service_role;
grant select on public.progression_permanent_missions,public.progression_permanent_mission_completions to authenticated,service_role;
create policy permanent_missions_read on public.progression_permanent_missions for select to authenticated using (true);
create policy permanent_mission_completions_owner_read on public.progression_permanent_mission_completions
  for select to authenticated using (user_id = (select auth.uid()));

-- Lock the player's balance BEFORE inserting the completion, matching the ledger
-- lock order. Completion and reward roll back together if crediting fails.
create function private.complete_permanent_mission(p_user_id uuid,p_mission_key text,p_source_type text,p_source_id uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
declare v_reward bigint; v_inserted text; v_credit jsonb;
begin
  if p_user_id is null or p_source_id is null or p_source_type is null
    or p_source_type not in ('solo_game','multiplayer_game','training_series')
    or (p_mission_key = 'first_training' and p_source_type <> 'training_series')
    or (p_mission_key <> 'first_training' and p_source_type = 'training_series')
    or (p_mission_key = 'first_solo' and p_source_type <> 'solo_game')
    or (p_mission_key = 'first_multiplayer' and p_source_type <> 'multiplayer_game') then
    raise exception 'invalid_permanent_mission_source' using errcode = '22023';
  end if;
  select reward_xp into v_reward from public.progression_permanent_missions where key = p_mission_key;
  if not found then raise exception 'unknown_permanent_mission' using errcode = '22023'; end if;
  insert into public.player_progression(user_id) values (p_user_id) on conflict (user_id) do nothing;
  perform 1 from public.player_progression where user_id = p_user_id for update;
  insert into public.progression_permanent_mission_completions(user_id,mission_key,source_type,source_id)
    values (p_user_id,p_mission_key,p_source_type,p_source_id)
    on conflict (user_id,mission_key) do nothing returning mission_key into v_inserted;
  if v_inserted is null then return false; end if;
  v_credit := public.credit_progression_xp(p_user_id,v_reward,'permanent_mission',p_mission_key);
  if (v_credit->>'credited')::boolean is distinct from true then
    raise exception 'permanent_mission_ledger_inconsistent' using errcode = '23514';
  end if;
  return true;
end;
$$;
revoke all on function private.complete_permanent_mission(uuid,text,text,uuid) from public,anon,authenticated,service_role;

create function public.get_my_permanent_missions()
returns jsonb language plpgsql stable security invoker set search_path = '' as $$
declare v_user uuid := auth.uid(); v_result jsonb;
begin
  if v_user is null then raise exception 'authentication_required' using errcode = '28000'; end if;
  select jsonb_agg(jsonb_build_object('key',m.key,'rewardXp',m.reward_xp,
    'completed',c.user_id is not null,'completedAt',c.completed_at) order by m.sort_order)
    into v_result from public.progression_permanent_missions m
    left join public.progression_permanent_mission_completions c on c.mission_key = m.key and c.user_id = v_user;
  return v_result;
end;
$$;
revoke all on function public.get_my_permanent_missions() from public,anon,authenticated,service_role;
grant execute on function public.get_my_permanent_missions() to authenticated;

create function private.complete_solo_permanent_missions() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  -- Ignore imported legacy history / administrative inserts without a server session.
  if not exists (select 1 from public.solo_game_sessions where id = new.id and user_id = new.user_id) then return new; end if;
  perform private.complete_permanent_mission(new.user_id,'first_game','solo_game',new.id);
  perform private.complete_permanent_mission(new.user_id,'first_solo','solo_game',new.id);
  if new.won then perform private.complete_permanent_mission(new.user_id,'first_win','solo_game',new.id); end if;
  return new;
end;
$$;
revoke all on function private.complete_solo_permanent_missions() from public,anon,authenticated,service_role;
create trigger complete_solo_permanent_missions after insert on public.games
  for each row execute function private.complete_solo_permanent_missions();

-- Existing pending jobs stay false. Only the enqueue of a new archive opts in.
alter table public.progression_multiplayer_jobs add column permanent_missions_eligible boolean not null default false;
create or replace function private.enqueue_progression_multiplayer_game() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.progression_multiplayer_jobs(game_id,permanent_missions_eligible) values (new.id,true);
  return new;
end;
$$;

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
