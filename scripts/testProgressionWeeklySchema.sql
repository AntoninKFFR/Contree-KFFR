begin;
do $$ declare role_name text; tab text; fn text; got text[]; w date;
begin
 if (select active_from_week from public.progression_weekly_catalog_versions where version=1) <> '2026-09-28'::date then raise exception 'wrong activation';end if;
 if (select jsonb_agg(jsonb_build_array(key,target_count,reward_xp,family,objective_type) order by sort_order) from public.progression_weekly_missions where catalog_version=1)
 <> '[ ["regular_games",5,300,"games","completed_game"],["wins",3,300,"wins","won_game"],["solo_games",3,200,"solo","completed_solo"],["multiplayer_games",2,250,"multiplayer","completed_multiplayer"],["training_series",3,200,"training","completed_training"] ]'::jsonb then raise exception 'catalog contract';end if;
 foreach tab in array array['progression_weekly_catalog_versions','progression_weekly_missions','progression_weekly_progress','progression_weekly_events'] loop
  if not(select relrowsecurity from pg_class where oid=('public.'||tab)::regclass) then raise exception 'RLS missing';end if;
  foreach role_name in array array['anon','authenticated','service_role'] loop
   if has_table_privilege(role_name,'public.'||tab,'INSERT,UPDATE,DELETE,TRUNCATE') then raise exception 'write grant';end if;
  end loop;
 end loop;
 foreach fn in array array['private.weekly_week_start(timestamptz)','private.weekly_next_reset(date)','private.get_weekly_selection(date)','private.apply_weekly_progression_event(uuid,text,uuid,timestamptz,text,boolean,timestamptz)'] loop
  foreach role_name in array array['anon','authenticated','service_role'] loop
   if has_function_privilege(role_name,fn,'EXECUTE') then raise exception 'helper exposed';end if;
  end loop;
 end loop;
 if has_function_privilege('anon','public.get_my_weekly_missions()','EXECUTE') or has_function_privilege('service_role','public.get_my_weekly_missions()','EXECUTE')
 or exists(select 1 from pg_proc where proname='get_my_weekly_missions' and pronargs<>0) then raise exception 'read RPC exposure';end if;
 if not exists(select 1 from pg_proc where oid='public.get_my_weekly_missions()'::regprocedure and prosecdef and proconfig @> array['search_path=""'])
 or not exists(select 1 from pg_proc where oid='private.apply_weekly_progression_event(uuid,text,uuid,timestamptz,text,boolean,timestamptz)'::regprocedure and prosecdef and proconfig @> array['search_path=""']) then raise exception 'unsafe definer';end if;
 -- Frozen ranking assertions are ordered by hash, not UI catalog order.
 select array_agg(key) into got from private.get_weekly_selection('2026-09-28');
 if got<>array['wins','training_series','solo_games'] then raise exception 'ranking changed %',got;end if;
 select array_agg(key) into got from private.get_weekly_selection('2026-10-05');
 if got<>array['solo_games','training_series','multiplayer_games'] then raise exception 'ranking changed';end if;
 select array_agg(key) into got from private.get_weekly_selection('2026-11-02');
 if got<>array['wins','regular_games','solo_games'] then raise exception 'ranking changed';end if;
 for w in select generate_series('2026-09-28'::date,'2027-01-04'::date,'7 days'::interval)::date loop
  if (select count(*) from private.get_weekly_selection(w))<>3 or (select count(distinct family) from private.get_weekly_selection(w))<>3
   or (select array_agg(key) from private.get_weekly_selection(w)) is distinct from (select array_agg(key) from private.get_weekly_selection(w)) then raise exception 'selection unstable';end if;
 end loop;
 if exists(select 1 from private.get_weekly_selection('2026-09-21')) then raise exception 'prelaunch selection';end if;
 -- UTC boundaries reflect Paris wall time and DST weeks of 167/169 hours.
 if private.weekly_week_start('2026-10-04 21:59:59+00')<>'2026-09-28'::date or private.weekly_week_start('2026-10-04 22:00:00+00')<>'2026-10-05'::date
 or private.weekly_next_reset('2026-03-23')<>'2026-03-29 22:00:00+00'::timestamptz
 or private.weekly_next_reset('2026-10-19')<>'2026-10-25 23:00:00+00'::timestamptz
 or extract(epoch from (private.weekly_next_reset('2026-03-23')-('2026-03-23'::timestamp at time zone 'Europe/Paris')))/3600<>167
 or extract(epoch from (private.weekly_next_reset('2026-10-19')-('2026-10-19'::timestamp at time zone 'Europe/Paris')))/3600<>169 then raise exception 'Paris DST incorrect';end if;
 -- Future catalogs with multiple candidates per family still choose three families.
 insert into public.progression_weekly_catalog_versions values(2,'2027-01-04');
 insert into public.progression_weekly_missions select 2,key,family,objective_type,target_count,reward_xp,sort_order from public.progression_weekly_missions where catalog_version=1;
 insert into public.progression_weekly_missions values(2,'extra_games','games','completed_game',7,400,6);
 if (select count(distinct family) from private.get_weekly_selection('2027-01-04'))<>3
 or exists(select 1 from private.get_weekly_selection('2027-01-04') where catalog_version<>2)
 or exists(select 1 from private.get_weekly_selection('2026-09-28') where catalog_version<>1) then raise exception 'version/family selection';end if;
end $$;
create function private.test_weekly_failure() returns trigger language plpgsql set search_path='' as $$
begin if new.source_type='weekly_mission' and current_setting('test.weekly_failure',true)='on' then raise exception 'weekly credit unavailable' using errcode='40001';end if;return new;end $$;
create trigger test_weekly_failure before insert on public.progression_xp_events for each row execute function private.test_weekly_failure();
do $$
declare a uuid:=gen_random_uuid(); b uuid:=gen_random_uuid(); src uuid; changed integer; before_xp bigint; counter integer;
begin
 insert into auth.users(id) values(a),(b);
 -- One Solo win advances all three selected game quests, retry advances none.
 src:=gen_random_uuid();changed:=private.apply_weekly_progression_event(a,'solo_game',src,'2026-11-04 12:00+00','solo',true,'2026-11-04 12:00+00');
 if changed<>3 then raise exception 'multi quest event';end if;
 changed:=private.apply_weekly_progression_event(a,'solo_game',src,'2026-11-04 12:00+00','solo',true,'2026-11-04 12:00+00');
 if changed<>0 or (select count(*) from public.progression_weekly_events where user_id=a)<>3 then raise exception 'dedupe';end if;
 -- Reach 4/5 games, 2/3 wins and 2/3 Solo, then complete all three atomically.
 perform private.apply_weekly_progression_event(a,'solo_game',gen_random_uuid(),'2026-11-04 12:00+00','solo',true,'2026-11-04 12:00+00');
 for i in 1..2 loop perform private.apply_weekly_progression_event(a,'multiplayer_game',gen_random_uuid(),'2026-11-04 12:00+00','multiplayer',false,'2026-11-04 12:00+00');end loop;
 src:=gen_random_uuid();perform set_config('test.weekly_failure','on',true);
 begin perform private.apply_weekly_progression_event(a,'solo_game',src,'2026-11-04 12:00+00','solo',true,'2026-11-04 12:00+00');raise exception 'missing injected failure';exception when serialization_failure then null;end;
 if exists(select 1 from public.progression_weekly_events where user_id=a and source_id=src)
 or exists(select 1 from public.progression_weekly_progress where user_id=a and completed_at is not null)
 or (select total_xp from public.player_progression where user_id=a)<>0 then raise exception 'partial multi reward';end if;
 perform set_config('test.weekly_failure','off',true);
 changed:=private.apply_weekly_progression_event(a,'solo_game',src,'2026-11-04 12:00+00','solo',true,'2026-11-04 12:00+00');
 if changed<>3 or (select total_xp from public.player_progression where user_id=a)<>800 or (select count(*) from public.progression_xp_events where user_id=a and source_type='weekly_mission')<>3 then raise exception 'three rewards';end if;
 for i in 1..3 loop perform private.apply_weekly_progression_event(a,'solo_game',gen_random_uuid(),'2026-11-04 12:00+00','solo',true,'2026-11-04 12:00+00');end loop;
 if (select total_xp from public.player_progression where user_id=a)<>800 or exists(select 1 from public.progression_weekly_progress where user_id=a and progress<>target_count) then raise exception 'reward repeated or counter overflow';end if;
 if exists(select 1 from public.progression_xp_events where user_id=a and source_id not in ('v1:2026-11-02:regular_games','v1:2026-11-02:wins','v1:2026-11-02:solo_games')) then raise exception 'reward identity';end if;
 -- Training touches only Training, persists all four distinct audit sources, caps at 3.
 for i in 1..4 loop
  src:=gen_random_uuid();perform private.apply_weekly_progression_event(b,'training_series',src,'2026-10-01 12:00+00',null,null,'2026-10-01 12:00+00');
  perform private.apply_weekly_progression_event(b,'training_series',src,'2026-10-01 12:00+00',null,null,'2026-10-01 12:00+00');
  select progress into counter from public.progression_weekly_progress where user_id=b and mission_key='training_series';
  if counter<>least(i,3) then raise exception 'training steps';end if;
 end loop;
 if (select total_xp from public.player_progression where user_id=b)<>200 or (select count(*) from public.progression_weekly_progress where user_id=b)<>1
 or (select count(*) from public.progression_weekly_events where user_id=b)<>4 then raise exception 'Training credited other objectives';end if;
 -- New week starts fresh; old rows unchanged. Expired events cannot be shifted.
 changed:=private.apply_weekly_progression_event(b,'training_series',gen_random_uuid(),'2026-10-04 21:59:59+00',null,null,'2026-10-04 22:00+00');
 if changed<>0 then raise exception 'expired event';end if;
 changed:=private.apply_weekly_progression_event(b,'training_series',gen_random_uuid(),'2026-10-04 22:00+00',null,null,'2026-10-04 22:00+00');
 if changed<>1 or not exists(select 1 from public.progression_weekly_progress where user_id=b and week_start='2026-10-05' and progress=1)
 or not exists(select 1 from public.progression_weekly_progress where user_id=b and week_start='2026-09-28' and progress=3) then raise exception 'rollover';end if;
 begin perform private.apply_weekly_progression_event(a,'training_series',gen_random_uuid(),now(),'solo',true);raise exception 'forged mode';exception when invalid_parameter_value then null;end;
end $$;
-- Exact rollover contract: keep 4/5 untouched while the new week starts at 0.
do $$ declare u uuid:=gen_random_uuid(); changed integer;
begin
 insert into auth.users(id) values(u);
 for i in 1..4 loop
  perform private.apply_weekly_progression_event(u,'solo_game',gen_random_uuid(),'2026-11-04 12:00+00','solo',false,'2026-11-04 12:00+00');
 end loop;
 if not exists(select 1 from public.progression_weekly_progress where user_id=u and week_start='2026-11-02' and mission_key='regular_games' and progress=4 and completed_at is null) then raise exception 'expected week A 4/5';end if;
 if (select count(*) from private.get_weekly_selection('2026-11-09'))<>3
 or exists(select 1 from private.get_weekly_selection('2026-11-09') m left join public.progression_weekly_progress p on p.user_id=u and p.week_start='2026-11-09' and p.catalog_version=m.catalog_version and p.mission_key=m.key where coalesce(p.progress,0)<>0) then raise exception 'new week not virtual zero';end if;
 changed:=private.apply_weekly_progression_event(u,'solo_game',gen_random_uuid(),'2026-11-08 22:59:59+00','solo',false,'2026-11-08 23:00:00+00');
 if changed<>0 then raise exception 'late event changed 4/5';end if;
 perform private.apply_weekly_progression_event(u,'solo_game',gen_random_uuid(),'2026-11-08 23:00:00+00','solo',false,'2026-11-08 23:00:00+00');
 if not exists(select 1 from public.progression_weekly_progress where user_id=u and week_start='2026-11-02' and mission_key='regular_games' and progress=4 and completed_at is null)
 or not exists(select 1 from public.progression_weekly_progress where user_id=u and week_start='2026-11-09' and mission_key='regular_games' and progress=1) then raise exception 'new event touched old week';end if;
end $$;
-- Authoritative hooks at actual server time, plus normal/forfeit/delayed Multi.
do $$
declare u uuid:=gen_random_uuid(); loser uuid:=gen_random_uuid(); delayed uuid:=gen_random_uuid(); solo_id uuid; game_id uuid; result text; weekly_at timestamptz:=clock_timestamp(); sel public.progression_weekly_missions; expected integer;
 initial jsonb:='{"phase":"bidding","winnerTeam":null,"totalScore":{"0":0,"1":0},"settings":{"scoringMode":"announced-points","targetScore":100},"playerNames":{"0":"H","1":"B","2":"B","3":"B"},"roundHistory":[]}'; final jsonb;
begin
 insert into auth.users(id) values(u),(loser),(delayed);
 solo_id:=(public.create_solo_game_session(u,gen_random_uuid(),initial)->>'id')::uuid;
 final:=initial||'{"phase":"game-over","winnerTeam":1,"totalScore":{"0":50,"1":100}}'::jsonb;
 perform public.commit_solo_game_session(solo_id,u,0,final);perform public.commit_solo_game_session(solo_id,u,0,final);
 for sel in select * from private.get_weekly_selection(private.weekly_week_start(weekly_at)) loop
  expected:=case when sel.objective_type in ('completed_game','completed_solo') then 1 else 0 end;
  if coalesce((select progress from public.progression_weekly_progress where user_id=u and mission_key=sel.key),0)<>expected then raise exception 'Solo loss hook';end if;
 end loop;
 for mode in 1..3 loop
  game_id:=gen_random_uuid();
  insert into public.multiplayer_games(id,started_at,finished_at,scoring_mode,target_score,team_0_score,team_1_score,winner_team,end_reason,forfeiting_team,round_count)
   values(game_id,now(),case when mode=3 then (private.weekly_week_start(weekly_at)::timestamp at time zone 'Europe/Paris')-interval '1 second' else now() end,'announced-points',100,100,50,0,case when mode=2 then 'forfeit' else 'score' end,case when mode=2 then 1 else null end,1);
  insert into public.multiplayer_game_players(game_id,seat_index,kind,user_id,display_name,bot_profile_id,team_id)
   select game_id,seat,case when seat<2 then 'human' else 'bot' end,case when seat=0 then case when mode=3 then delayed else u end when seat=1 then loser else null end,'Fixture',case when seat<2 then null else 'advanced_rules_v4' end,seat%2 from generate_series(0,3) seat;
  result:=public.apply_progression_multiplayer_game(game_id);if result<>'applied' then raise exception 'apply';end if;
  result:=public.apply_progression_multiplayer_game(game_id);if result<>'already_applied' then raise exception 'retry';end if;
  if mode=2 and exists(select 1 from public.progression_weekly_events where user_id=loser and source_id=game_id) then raise exception 'forfeit loser counted';end if;
  if mode=3 and exists(select 1 from public.progression_weekly_events where source_id=game_id) then raise exception 'delayed Multi advanced a week';end if;
 end loop;
 if (select total_xp from public.player_progression where user_id=delayed)<>450 or (select count(*) from public.progression_permanent_mission_completions where user_id=delayed)<>3 then raise exception 'delayed game/permanent rewards lost';end if;
 for sel in select * from private.get_weekly_selection(private.weekly_week_start(weekly_at)) loop
  expected:=case when sel.objective_type='completed_game' then 3 when sel.objective_type in ('won_game','completed_multiplayer') then 2 when sel.objective_type='completed_solo' then 1 else 0 end;
  if coalesce((select progress from public.progression_weekly_progress where user_id=u and mission_key=sel.key),0)<>least(expected,sel.target_count) then raise exception 'Multi winner hook';end if;
  expected:=case when sel.objective_type in ('completed_game','completed_multiplayer') then 1 else 0 end;
  if coalesce((select progress from public.progression_weekly_progress where user_id=loser and mission_key=sel.key),0)<>expected then raise exception 'normal loser hook';end if;
 end loop;
end $$;
-- Force completion through EACH trusted transaction, then inject a reward error.
do $$
declare u uuid; sess uuid; game uuid; selection public.progression_weekly_missions; mode text; expected_xp bigint; before_series bigint;
 initial jsonb:='{"phase":"bidding","winnerTeam":null,"totalScore":{"0":0,"1":0},"settings":{"scoringMode":"announced-points","targetScore":100},"playerNames":{"0":"H","1":"B","2":"B","3":"B"},"roundHistory":[]}';final jsonb; result text;
begin
 foreach mode in array array['solo','multiplayer','training'] loop
  u:=gen_random_uuid();insert into auth.users(id) values(u);expected_xp:=0;
  for selection in select * from private.get_weekly_selection(private.weekly_week_start(clock_timestamp())) loop
   if (mode='solo' and selection.objective_type in ('completed_game','won_game','completed_solo'))
    or (mode='multiplayer' and selection.objective_type in ('completed_game','won_game','completed_multiplayer'))
    or (mode='training' and selection.objective_type='completed_training') then
    insert into public.progression_weekly_progress(user_id,week_start,catalog_version,mission_key,target_count,progress)
     values(u,private.weekly_week_start(clock_timestamp()),selection.catalog_version,selection.key,selection.target_count,selection.target_count-1);
    expected_xp:=expected_xp+selection.reward_xp;
   end if;
  end loop;
  if expected_xp=0 then continue;end if;
  if mode='solo' then
   sess:=(public.create_solo_game_session(u,gen_random_uuid(),initial)->>'id')::uuid;
   final:=initial||'{"phase":"game-over","winnerTeam":0,"totalScore":{"0":100,"1":50}}'::jsonb;
  elsif mode='multiplayer' then
   game:=gen_random_uuid();insert into public.multiplayer_games(id,started_at,finished_at,scoring_mode,target_score,team_0_score,team_1_score,winner_team,end_reason,round_count)
    values(game,now(),now(),'announced-points',100,100,50,0,'score',1);
   insert into public.multiplayer_game_players(game_id,seat_index,kind,user_id,display_name,bot_profile_id,team_id)
    select game,seat,case when seat=0 then 'human' else 'bot' end,case when seat=0 then u else null end,'Fixture',case when seat=0 then null else 'advanced_rules_v4' end,seat%2 from generate_series(0,3) seat;
  end if;
  perform set_config('test.weekly_failure','on',true);
  begin
   if mode='solo' then perform public.commit_solo_game_session(sess,u,0,final);
   elsif mode='multiplayer' then perform public.apply_progression_multiplayer_game(game);
   else perform public.record_verified_training_series(u,'trick-value',1,1,'contree-kffr',1,1,1,'[]',10,0,1000,true);end if;
   raise exception 'expected weekly failure through % hook',mode;
  exception when serialization_failure then null;end;
  if exists(select 1 from public.progression_xp_events where user_id=u) or exists(select 1 from public.progression_permanent_mission_completions where user_id=u)
   or exists(select 1 from public.progression_weekly_events where user_id=u) or exists(select 1 from public.progression_weekly_progress where user_id=u and progress<>target_count-1)
   or exists(select 1 from public.training_series where user_id=u) or exists(select 1 from public.training_records where user_id=u)
   or (mode='solo' and exists(select 1 from public.games where id=sess))
   or (mode='multiplayer' and not exists(select 1 from public.progression_multiplayer_jobs where game_id=game and applied_at is null)) then raise exception 'partial trusted transaction %',mode;end if;
  perform set_config('test.weekly_failure','off',true);
  if mode='solo' then perform public.commit_solo_game_session(sess,u,0,final);expected_xp:=expected_xp+380;
  elsif mode='multiplayer' then result:=public.apply_progression_multiplayer_game(game);expected_xp:=expected_xp+450;
  else perform public.record_verified_training_series(u,'trick-value',1,1,'contree-kffr',1,1,1,'[]',10,0,1000,true);expected_xp:=expected_xp+100;end if;
  if (select total_xp from public.player_progression where user_id=u)<>expected_xp then raise exception 'trusted transaction reward mismatch %',mode;end if;
 end loop;
end $$;
-- All read timestamps derive from the same DB statement, independently of clients.
do $$ declare u uuid:=gen_random_uuid(); snapshot jsonb; server_at timestamptz;
begin
 insert into auth.users(id) values(u);
 perform set_config('request.jwt.claim.sub',u::text,true);
 snapshot:=public.get_my_weekly_missions();server_at:=(snapshot->>'serverNow')::timestamptz;
 if server_at is distinct from statement_timestamp()
 or (snapshot->>'weekStart')::date is distinct from private.weekly_week_start(server_at)
 or (snapshot->>'nextResetAt')::timestamptz is distinct from private.weekly_next_reset(private.weekly_week_start(server_at))
 or server_at >= (snapshot->>'nextResetAt')::timestamptz then raise exception 'incoherent weekly server clock';end if;
 if exists(select 1 from public.progression_weekly_progress where user_id=u) then raise exception 'read created progress';end if;
end $$;
rollback;
