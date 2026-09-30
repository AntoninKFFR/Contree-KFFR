-- Disposable database only; every fixture and injected failure is rolled back.
begin;
do $$
declare v_role text; v_table text; v_fn text;
begin
  if (select jsonb_agg(jsonb_build_array(key,reward_xp,sort_order) order by sort_order) from public.progression_permanent_missions)
    <> '[ ["first_game",100,1],["first_win",150,2],["first_solo",100,3],["first_multiplayer",150,4],["first_training",100,5] ]'::jsonb then
    raise exception 'catalog mismatch';
  end if;
  foreach v_table in array array['progression_permanent_missions','progression_permanent_mission_completions'] loop
    if not (select relrowsecurity from pg_class where oid = ('public.'||v_table)::regclass) then raise exception 'missing RLS'; end if;
    foreach v_role in array array['anon','authenticated','service_role'] loop
      if has_table_privilege(v_role,'public.'||v_table,'INSERT,UPDATE,DELETE,TRUNCATE') then raise exception 'unsafe write grant % %',v_role,v_table; end if;
    end loop;
    if not has_table_privilege('authenticated','public.'||v_table,'SELECT') then raise exception 'missing read'; end if;
  end loop;
  foreach v_fn in array array['private.complete_permanent_mission(uuid,text,text,uuid)','private.complete_solo_permanent_missions()'] loop
    foreach v_role in array array['anon','authenticated','service_role'] loop
      if has_function_privilege(v_role,v_fn,'EXECUTE') then raise exception 'private helper exposed'; end if;
    end loop;
    if not exists (select 1 from pg_proc where oid = v_fn::regprocedure and prosecdef and proconfig @> array['search_path=""']) then raise exception 'unsafe definer'; end if;
  end loop;
  if exists (select 1 from pg_proc join pg_namespace n on n.oid = pronamespace where n.nspname = 'public' and proname = 'get_my_permanent_missions' and pronargs <> 0)
    or has_function_privilege('anon','public.get_my_permanent_missions()','EXECUTE') then raise exception 'unsafe read RPC'; end if;
end $$;

create function private.test_mission_credit_failure() returns trigger language plpgsql set search_path = '' as $$
begin
  if new.source_type = 'permanent_mission' and current_setting('test.fail_mission',true) = 'on' then
    raise exception 'simulated_mission_credit_failure' using errcode = '40001';
  end if;
  return new;
end $$;
create trigger test_mission_credit_failure before insert on public.progression_xp_events
  for each row execute function private.test_mission_credit_failure();

do $$
declare
  a uuid := '11111111-0000-4000-8000-000000000104';
  b uuid := '22222222-0000-4000-8000-000000000104';
  c uuid := '33333333-0000-4000-8000-000000000104';
  d uuid := '44444444-0000-4000-8000-000000000104';
  source uuid := gen_random_uuid(); sess uuid; game uuid; oldgame uuid;
  initial jsonb := '{"phase":"bidding","winnerTeam":null,"totalScore":{"0":0,"1":0},"settings":{"scoringMode":"announced-points","targetScore":100},"playerNames":{"0":"Human","1":"Bot","2":"Bot","3":"Bot"},"roundHistory":[]}';
  final jsonb; inserted boolean; repeat boolean; result text; series jsonb;
begin
  insert into auth.users(id) values (a),(b),(c),(d);
  -- No history scans: old rows/imports outside authoritative sessions do nothing.
  insert into public.games(user_id,won,scoring_mode,player_score,bot_score,target_score,created_at)
    values (d,true,'announced-points',100,0,100,'2026-09-01');
  insert into public.training_series(user_id,mode,axis_id,axis_version,level,ruleset_id,ruleset_version,generator_version,seed,answers,question_count,score,duration_ms,timed)
    values (d,'puzzle','trick-value',1,1,'contree-kffr',1,1,1,'[]',10,0,1000,true);
  if exists(select 1 from public.progression_permanent_mission_completions where user_id = d) then raise exception 'history completed mission'; end if;

  inserted := private.complete_permanent_mission(a,'first_training','training_series',source);
  repeat := private.complete_permanent_mission(a,'first_training','training_series',source);
  if not inserted or repeat then raise exception 'retry mismatch'; end if;
  repeat := private.complete_permanent_mission(a,'first_training','training_series',gen_random_uuid());
  if repeat or (select total_xp from public.player_progression where user_id = a) <> 100
    or (select count(*) from public.progression_xp_events where user_id = a) <> 1
    or not exists (select 1 from public.progression_permanent_mission_completions where user_id = a and source_id = source) then raise exception 'duplicate credit or changed audit'; end if;
  begin
    perform private.complete_permanent_mission(a,'unknown','solo_game',source); raise exception 'unknown mission accepted';
  exception when invalid_parameter_value then null; end;
  begin
    perform private.complete_permanent_mission(a,'first_solo','training_series',source); raise exception 'wrong source accepted';
  exception when invalid_parameter_value then null; end;

  -- First Solo loss, terminal retry, then two wins: only missing first_win pays.
  sess := (public.create_solo_game_session(b,gen_random_uuid(),initial)->>'id')::uuid;
  final := initial || '{"phase":"game-over","winnerTeam":1,"totalScore":{"0":50,"1":100}}'::jsonb;
  perform set_config('test.fail_mission','on',true);
  begin
    perform public.commit_solo_game_session(sess,b,0,final); raise exception 'expected Solo failure';
  exception when serialization_failure then null; end;
  if exists (select 1 from public.games where id = sess) or exists (select 1 from public.progression_permanent_mission_completions where user_id = b)
    or exists(select 1 from public.progression_xp_events where user_id = b) then raise exception 'Solo partial mission'; end if;
  perform set_config('test.fail_mission','off',true);
  perform public.commit_solo_game_session(sess,b,0,final);
  perform public.commit_solo_game_session(sess,b,0,final);
  if (select total_xp from public.player_progression where user_id = b) <> 220
    or (select count(*) from public.progression_permanent_mission_completions where user_id = b) <> 2
    or exists(select 1 from public.progression_permanent_mission_completions where user_id = b and mission_key = 'first_win') then raise exception 'first loss mismatch'; end if;
  for i in 1..2 loop
    sess := (public.create_solo_game_session(b,gen_random_uuid(),initial)->>'id')::uuid;
    final := initial || '{"phase":"game-over","winnerTeam":0,"totalScore":{"0":100,"1":50}}'::jsonb;
    perform public.commit_solo_game_session(sess,b,0,final);
  end loop;
  if (select total_xp from public.player_progression where user_id = b) <> 430 then raise exception 'second win repeated mission'; end if;
  sess := (public.create_solo_game_session(c,gen_random_uuid(),initial)->>'id')::uuid;
  perform public.commit_solo_game_session(sess,c,0,final);
  if (select total_xp from public.player_progression where user_id = c) <> 380 then raise exception 'first Solo win'; end if;

  -- Old pending #102 job still gets game XP, never missions after #104.
  oldgame := gen_random_uuid();
  insert into public.multiplayer_games(id,started_at,finished_at,scoring_mode,target_score,team_0_score,team_1_score,winner_team,end_reason,round_count)
    values(oldgame,now(),now(),'announced-points',100,100,50,0,'score',1);
  update public.progression_multiplayer_jobs set permanent_missions_eligible = false where game_id = oldgame;
  insert into public.multiplayer_game_players(game_id,seat_index,kind,user_id,display_name,bot_profile_id,team_id)
    select oldgame,seat,case when seat=0 then 'human' else 'bot' end,case when seat=0 then d else null end,'Fixture',case when seat=0 then null else 'advanced_rules_v4' end,seat%2 from generate_series(0,3) seat;
  result := public.apply_progression_multiplayer_game(oldgame);
  if (select total_xp from public.player_progression where user_id = d) <> 50 or exists(select 1 from public.progression_permanent_mission_completions where user_id = d) then raise exception 'old job awarded missions'; end if;

  -- Forfeit winner a receives 450 on top of Training; d receives nothing.
  game := gen_random_uuid();
  insert into public.multiplayer_games(id,started_at,finished_at,scoring_mode,target_score,team_0_score,team_1_score,winner_team,end_reason,forfeiting_team,round_count)
    values(game,now(),now(),'announced-points',100,100,50,0,'forfeit',1,1);
  insert into public.multiplayer_game_players(game_id,seat_index,kind,user_id,display_name,bot_profile_id,team_id)
    select game,seat,case when seat<2 then 'human' else 'bot' end,case when seat=0 then a when seat=1 then d else null end,'Fixture',case when seat<2 then null else 'advanced_rules_v4' end,seat%2 from generate_series(0,3) seat;
  perform set_config('test.fail_mission','on',true);
  begin
    perform public.apply_progression_multiplayer_game(game); raise exception 'expected Multi failure';
  exception when serialization_failure then null; end;
  if (select total_xp from public.player_progression where user_id = a) <> 100
    or exists(select 1 from public.progression_xp_events where source_id = game::text)
    or not exists(select 1 from public.progression_multiplayer_jobs where game_id = game and applied_at is null) then raise exception 'Multi partial mission or lost job'; end if;
  perform set_config('test.fail_mission','off',true);
  result := public.apply_progression_multiplayer_game(game);
  if result <> 'applied' then raise exception 'Multi retry failed'; end if;
  result := public.apply_progression_multiplayer_game(game);
  if result <> 'already_applied' or (select total_xp from public.player_progression where user_id = a) <> 550
    or (select total_xp from public.player_progression where user_id = d) <> 50
    or exists(select 1 from public.progression_permanent_mission_completions where user_id = d) then raise exception 'forfeit missions mismatch'; end if;

  -- Training insert, record and mission are one transaction; no direct Training XP.
  perform set_config('test.fail_mission','on',true);
  begin
    perform public.record_verified_training_series(d,'trick-value',1,1,'contree-kffr',1,1,1,'[]',10,0,1000,true);
    raise exception 'expected training failure';
  exception when serialization_failure then null; end;
  if (select count(*) from public.training_series where user_id = d) <> 1
    or exists(select 1 from public.training_records where user_id = d)
    or exists(select 1 from public.progression_permanent_mission_completions where user_id = d) then raise exception 'training partial mission'; end if;
  perform set_config('test.fail_mission','off',true);
  for i in 1..2 loop
    series := public.record_verified_training_series(d,'trick-value',1,1,'contree-kffr',1,1,1,'[]',10,0,1000,true);
  end loop;
  if (select total_xp from public.player_progression where user_id = d) <> 150
    or (select count(*) from public.progression_xp_events where user_id = d and source_type = 'permanent_mission' and source_id = 'first_training') <> 1 then raise exception 'training repeated mission'; end if;
  if exists(select 1 from public.progression_permanent_mission_completions c left join public.progression_xp_events e
    on e.user_id=c.user_id and e.source_type='permanent_mission' and e.source_id=c.mission_key where e.id is null) then raise exception 'completion without XP'; end if;
end $$;
rollback;
