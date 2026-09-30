insert into auth.users(id) values('88888888-0000-4000-8000-000000000105');
select public.record_verified_training_series('88888888-0000-4000-8000-000000000105','trick-value',1,1,'contree-kffr',1,1,1,'[]',10,0,1000,true);
insert into public.multiplayer_games(id,started_at,finished_at,scoring_mode,target_score,team_0_score,team_1_score,winner_team,end_reason,round_count)
 values('88888888-1111-4000-8000-000000000105',now(),now(),'announced-points',100,100,50,0,'score',1);
insert into public.multiplayer_game_players(game_id,seat_index,kind,user_id,display_name,bot_profile_id,team_id)
 select '88888888-1111-4000-8000-000000000105',seat,case when seat=0 then 'human' else 'bot' end,case when seat=0 then '88888888-0000-4000-8000-000000000105'::uuid else null end,'Fixture',case when seat=0 then null else 'advanced_rules_v4' end,seat%2 from generate_series(0,3) seat;
