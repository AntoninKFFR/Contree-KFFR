begin;
do $$
declare v_role text; v_function text; v_result bigint;
begin
  -- Unit tests of the one canonical tuning function, not duplicated TS constants.
  if private.progression_game_xp('solo',false,'score','human') <> 20
    or private.progression_game_xp('solo',true,'score','human') <> 30
    or private.progression_game_xp('multiplayer',false,'score','human') <> 30
    or private.progression_game_xp('multiplayer',true,'score','human') <> 50
    or private.progression_game_xp('multiplayer',true,'forfeit','human') <> 50
    or private.progression_game_xp('multiplayer',false,'forfeit','human') <> 0
    or private.progression_game_xp('multiplayer',true,'score','bot') <> 0
    or private.progression_game_xp('solo',true,'score','bot') <> 0 then
    raise exception 'XP tuning regression';
  end if;
  begin
    v_result := private.progression_game_xp('invalid',true,'score','human');
    raise exception 'invalid result accepted';
  exception when invalid_parameter_value then null; end;
  foreach v_role in array array['anon','authenticated'] loop
    if has_table_privilege(v_role,'public.games','INSERT') then raise exception 'client Solo history insert grant'; end if;
    foreach v_function in array array[
      'public.create_solo_game_session(uuid,uuid,jsonb)',
      'public.commit_solo_game_session(uuid,uuid,bigint,jsonb)',
      'public.apply_progression_multiplayer_game(uuid)',
      'public.credit_progression_xp(uuid,bigint,text,text)'
    ] loop
      if has_function_privilege(v_role,v_function,'EXECUTE') then raise exception 'unsafe client RPC % %',v_role,v_function; end if;
    end loop;
  end loop;
  foreach v_function in array array[
    'public.create_solo_game_session(uuid,uuid,jsonb)',
    'public.commit_solo_game_session(uuid,uuid,bigint,jsonb)',
    'public.apply_progression_multiplayer_game(uuid)',
    'private.enqueue_progression_multiplayer_game()'
  ] loop
    if not exists (select 1 from pg_proc where oid = v_function::regprocedure
      and prosecdef and proconfig @> array['search_path=""']) then raise exception 'unsafe definer %',v_function; end if;
    if not has_function_privilege('service_role',v_function,'EXECUTE') then raise exception 'missing service RPC %',v_function; end if;
  end loop;
  if not (select relrowsecurity from pg_class where oid = 'public.solo_game_sessions'::regclass)
    or not (select relrowsecurity from pg_class where oid = 'public.progression_multiplayer_jobs'::regclass) then
    raise exception 'missing RLS';
  end if;
  if not has_table_privilege('authenticated','public.games','SELECT')
    or not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'games'
      and policyname = 'games_owner_read' and cmd = 'SELECT' and roles = array['authenticated']::name[]) then
    raise exception 'legacy owner history read must remain available';
  end if;
end;
$$;

-- A pre-existing archive has no new outbox marker and cannot be credited by retry.
-- All fixture and trigger changes are rolled back; this script is local-only CI.
alter table public.multiplayer_games disable trigger enqueue_progression_multiplayer_game;
insert into public.multiplayer_games(id,started_at,finished_at,scoring_mode,target_score,
  team_0_score,team_1_score,winner_team,end_reason,round_count)
values ('11111111-0000-4000-8000-000000000102','2026-09-01','2026-09-01',
  'announced-points',1000,1200,700,0,'score',8);
alter table public.multiplayer_games enable trigger enqueue_progression_multiplayer_game;
do $$ begin
  if exists (select 1 from public.progression_multiplayer_jobs
    where game_id = '11111111-0000-4000-8000-000000000102') then raise exception 'legacy outbox'; end if;
  begin
    perform public.apply_progression_multiplayer_game('11111111-0000-4000-8000-000000000102');
    raise exception 'legacy game credited';
  exception when no_data_found then null; end;
end $$;

-- Inject a transient ledger failure to test the actual transaction boundaries.
create function private.test_progression_failure() returns trigger
language plpgsql set search_path = '' as $$ begin
  if current_setting('test.fail_xp',true) = 'on' then
    raise exception 'simulated_xp_failure' using errcode = '40001';
  end if;
  return new;
end $$;
create trigger test_progression_failure before insert on public.progression_xp_events
  for each row execute function private.test_progression_failure();
do $$
declare
  v_user uuid := '22222222-0000-4000-8000-000000000102';
  v_game uuid := '33333333-0000-4000-8000-000000000102';
  v_session uuid;
  v_initial jsonb := '{"phase":"bidding","winnerTeam":null,"totalScore":{"0":0,"1":0},"settings":{"scoringMode":"announced-points","targetScore":100},"playerNames":{"0":"Human","1":"Bot A","2":"Bot B","3":"Bot C"},"roundHistory":[]}';
  v_final jsonb;
  v_first jsonb;
  v_retry jsonb;
  v_status text;
  v_repeat text;
  v_total bigint;
begin
  insert into auth.users(id) values (v_user);
  v_session := (public.create_solo_game_session(v_user,gen_random_uuid(),v_initial)->>'id')::uuid;
  v_final := v_initial || '{"phase":"game-over","winnerTeam":0,"totalScore":{"0":100,"1":50},"endReason":"score"}'::jsonb;
  perform set_config('test.fail_xp','on',true);
  begin
    perform public.commit_solo_game_session(v_session,v_user,0,v_final);
    raise exception 'expected transient Solo failure';
  exception when serialization_failure then null; end;
  if exists (select 1 from public.games where id = v_session)
    or exists (select 1 from public.progression_xp_events where user_id = v_user)
    or exists (select 1 from public.player_progression where user_id = v_user)
    or not exists (select 1 from public.solo_game_sessions where id = v_session and state_version = 0 and completed_at is null) then
    raise exception 'Solo archive/XP/state were not atomic';
  end if;
  perform set_config('test.fail_xp','off',true);
  v_first := public.commit_solo_game_session(v_session,v_user,0,v_final);
  v_retry := public.commit_solo_game_session(v_session,v_user,0,v_final);
  if v_first <> v_retry or (select count(*) from public.games where id = v_session) <> 1
    or (select total_xp from public.player_progression where user_id = v_user) <> 30 then
    raise exception 'Solo retry is not stable';
  end if;

  insert into public.multiplayer_games(id,started_at,finished_at,scoring_mode,target_score,
    team_0_score,team_1_score,winner_team,end_reason,round_count)
  values (v_game,now(),now(),'announced-points',100,100,50,0,'score',1);
  insert into public.multiplayer_game_players(game_id,seat_index,kind,user_id,display_name,bot_profile_id,team_id)
  select v_game,seat,case when seat = 0 then 'human' else 'bot' end,
    case when seat = 0 then v_user else null end,'Fixture',
    case when seat = 0 then null else 'advanced_rules_v4' end,seat % 2
    from generate_series(0,3) seat;
  perform set_config('test.fail_xp','on',true);
  begin
    perform public.apply_progression_multiplayer_game(v_game);
    raise exception 'expected transient Multi failure';
  exception when serialization_failure then null; end;
  if not exists (select 1 from public.multiplayer_games where id = v_game)
    or not exists (select 1 from public.progression_multiplayer_jobs where game_id = v_game and applied_at is null)
    or (select total_xp from public.player_progression where user_id = v_user) <> 30 then
    raise exception 'Multi archive or retry job corrupted';
  end if;
  perform set_config('test.fail_xp','off',true);
  -- Keep mutating calls separate from subquery assertions: an SQL InitPlan may
  -- read the balance before volatile function calls in one boolean expression.
  v_status := public.apply_progression_multiplayer_game(v_game);
  v_repeat := public.apply_progression_multiplayer_game(v_game);
  select total_xp into v_total from public.player_progression where user_id = v_user;
  if v_status <> 'applied' or v_repeat <> 'already_applied' or v_total <> 80 then
    raise exception 'Multi retry failed: %, %, %',v_status,v_repeat,v_total;
  end if;
end $$;
rollback;
