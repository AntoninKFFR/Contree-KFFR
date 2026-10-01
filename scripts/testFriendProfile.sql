-- Disposable local DB only, rollback all fixtures.
begin;
do $$
declare a uuid:=gen_random_uuid(); b uuid:=gen_random_uuid(); c uuid:=gen_random_uuid(); d uuid:=gen_random_uuid();
  result jsonb; denied uuid; game uuid; i integer; item text; before_count bigint;
begin
  insert into auth.users(id) values(a),(b),(c),(d);
  insert into public.profiles(id,username) values(a,'FriendActor114'),(b,'FriendTarget114'),(c,'FriendPending114'),(d,'FriendFresh114')
    on conflict(id) do update set username=excluded.username;
  insert into public.friendships(user_low,user_high) values(least(a,b),greatest(a,b)),(least(a,d),greatest(a,d));
  insert into public.friend_requests(requester_id,recipient_id) values(a,c);
  perform set_config('request.jwt.claim.sub',a::text,true);
  result:=public.get_friend_profile(b);
  if (result->>'level')::integer<>1 or result->'rating'<>'null'::jsonb
     or result->'solo'<>'{"games":0,"wins":0,"losses":0,"winrate":0}'::jsonb
     or result->'multiplayer'<>result->'solo'
     or result->'equipped'<>'{"title":null,"badge":null,"frame":null}'::jsonb then raise exception 'fresh profile'; end if;
  if exists(select from public.player_progression where user_id in (b,d)) then raise exception 'read wrote progression'; end if;
  foreach denied in array array[a,c,gen_random_uuid(),null::uuid] loop
    begin perform public.get_friend_profile(denied); raise exception 'unauthorized profile returned';
    exception when sqlstate 'P0001' then if sqlerrm<>'friend_profile_unavailable' then raise; end if; end;
  end loop;
  -- Incoming pending is equally unavailable.
  perform set_config('request.jwt.claim.sub',c::text,true);
  begin perform public.get_friend_profile(a); raise exception 'incoming pending returned';
  exception when sqlstate 'P0001' then if sqlerrm<>'friend_profile_unavailable' then raise;end if;end;
  perform set_config('request.jwt.claim.sub',a::text,true);
  insert into public.games(user_id,won,scoring_mode,player_score,bot_score,target_score)
    select b,i<=6,'announced-points',1000,500,1000 from generate_series(1,10) i;
  for i in 1..5 loop
    game:=gen_random_uuid();
    insert into public.multiplayer_games(id,started_at,finished_at,scoring_mode,target_score,team_0_score,team_1_score,winner_team,end_reason,forfeiting_team,round_count)
      values(game,now()-interval '1 hour',now(),'announced-points',1000,1000,500,(i%2)::smallint,
        case when i in (3,4) then 'forfeit' else 'score' end,case when i in (3,4) then (1-i%2)::smallint else null end,0);
    if i<5 then
      insert into public.multiplayer_game_players(game_id,seat_index,kind,user_id,display_name,team_id)
        values(game,0,'human',b,'FriendTarget114',0),(game,2,'human',b,'FriendTarget114',0);
    else
      insert into public.multiplayer_game_players(game_id,seat_index,kind,display_name,bot_profile_id,team_id)
        values(game,0,'bot','FriendTarget114','standard',0);
    end if;
  end loop;
  -- Trusted credit is the only unlock path; never grant browser writes to fixtures.
  perform public.credit_progression_xp(b,private.progression_total_xp_for_level(40),'permanent_mission','friend-profile-114');
  perform set_config('request.jwt.claim.sub',b::text,true);
  perform public.set_my_profile_cosmetic('title','title_auction_master');
  perform public.set_my_profile_cosmetic('badge','badge_crown');
  perform public.set_my_profile_cosmetic('frame','frame_black_gold');
  insert into public.player_ratings(user_id,rating,rated_games,wins,losses,peak_rating)
    values(b,1147,5,3,2,1200);
  perform set_config('request.jwt.claim.sub',a::text,true);
  select count(*) into before_count from public.profile_cosmetic_unlocks where user_id=b;
  result:=public.get_friend_profile(b);
  if result->'solo'<>'{"games":10,"wins":6,"losses":4,"winrate":60}'::jsonb then raise exception 'solo aggregation %',result;end if;
  if result->'multiplayer'<>'{"games":4,"wins":2,"losses":2,"winrate":50}'::jsonb then raise exception 'multi dedup/forfeit/bots %',result;end if;
  if (result->>'level')::integer<>40 or result#>>'{rating,rank}'<>private.rating_rank(1147) then raise exception 'level/rating';end if;
  if result#>>'{equipped,title,key}'<>'title_auction_master' or result#>>'{equipped,badge,key}'<>'badge_crown' or result#>>'{equipped,frame,key}'<>'frame_black_gold' then raise exception 'equipment';end if;
  if (select count(*) from jsonb_object_keys(result))<>7 or result ?| array['items','unlocks','totalXp','history','missions'] then raise exception 'private projection leak';end if;
  if before_count<>(select count(*) from public.profile_cosmetic_unlocks where user_id=b) then raise exception 'read mutated unlocks';end if;
  result:=public.get_my_social_snapshot();
  if not exists(select from jsonb_array_elements(result->'friends') f where f->>'user_id'=b::text and (f->>'level')::integer=40)
     or not exists(select from jsonb_array_elements(result->'friends') f where f->>'user_id'=d::text and (f->>'level')::integer=1)
     or jsonb_array_length(result->'sent')<>1 then raise exception 'additive snapshot';end if;
  delete from public.friendships where user_low=least(a,b) and user_high=greatest(a,b);
  begin perform public.get_friend_profile(b);raise exception 'removed profile returned';
  exception when sqlstate 'P0001' then if sqlerrm<>'friend_profile_unavailable' then raise;end if;end;
  if has_function_privilege('anon','public.get_friend_profile(uuid)','execute') or has_function_privilege('authenticated','private.progression_level_from_total_xp(bigint)','execute') then raise exception 'helper/RPC grants';end if;
end $$;
rollback;
