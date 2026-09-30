-- Used ONLY between local reset at #102 and local migration up to #104.
insert into auth.users(id) values ('99999999-0000-4000-8000-000000000104');
insert into public.games(user_id,won,scoring_mode,player_score,bot_score,target_score)
  values ('99999999-0000-4000-8000-000000000104',true,'announced-points',100,50,100);
select public.record_verified_training_series('99999999-0000-4000-8000-000000000104','trick-value',1,1,'contree-kffr',1,1,1,'[]',10,0,1000,true);
insert into public.multiplayer_games(id,started_at,finished_at,scoring_mode,target_score,team_0_score,team_1_score,winner_team,end_reason,round_count)
  values ('99999999-1111-4000-8000-000000000104',now(),now(),'announced-points',100,100,50,0,'score',1);
insert into public.multiplayer_game_players(game_id,seat_index,kind,user_id,display_name,bot_profile_id,team_id)
  select '99999999-1111-4000-8000-000000000104',seat,case when seat=0 then 'human' else 'bot' end,
    case when seat=0 then '99999999-0000-4000-8000-000000000104'::uuid else null end,'Fixture',
    case when seat=0 then null else 'advanced_rules_v4' end,seat%2 from generate_series(0,3) seat;
