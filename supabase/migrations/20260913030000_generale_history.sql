alter table public.games
  add column if not exists round_history jsonb not null default '[]'::jsonb,
  add column if not exists player_names jsonb;

alter table public.multiplayer_games
  add column if not exists round_history jsonb not null default '[]'::jsonb,
  add column if not exists player_names jsonb;

create or replace function public.persist_multiplayer_archive(p_room_id uuid, p_game jsonb, p_players jsonb) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare source_game public.multiplayer_games%rowtype;
begin
  if p_game is null or p_players is null then return; end if;
  source_game := jsonb_populate_record(null::public.multiplayer_games, p_game);
  if source_game.id is null or source_game.room_id is distinct from p_room_id
     or not exists (select 1 from public.rooms where id = p_room_id and active_game_id = source_game.id)
  then raise exception 'Invalid multiplayer archive identity'; end if;
  insert into public.multiplayer_games(
    id,room_id,started_at,finished_at,scoring_mode,target_score,team_0_score,team_1_score,
    winner_team,end_reason,forfeiting_team,round_count,ruleset_id,ruleset_version,ruleset_snapshot,
    round_history,player_names
  ) values (
    source_game.id,source_game.room_id,source_game.started_at,source_game.finished_at,
    source_game.scoring_mode,source_game.target_score,source_game.team_0_score,source_game.team_1_score,
    source_game.winner_team,source_game.end_reason,source_game.forfeiting_team,source_game.round_count,
    source_game.ruleset_id,source_game.ruleset_version,source_game.ruleset_snapshot,
    coalesce(source_game.round_history,'[]'::jsonb),source_game.player_names
  ) on conflict (id) do nothing;
  insert into public.multiplayer_game_players(game_id,seat_index,kind,user_id,display_name,bot_profile_id,team_id)
  select source.game_id,source.seat_index,source.kind,source.user_id,source.display_name,source.bot_profile_id,source.team_id
  from jsonb_populate_recordset(null::public.multiplayer_game_players,p_players) source
  on conflict (game_id,seat_index) do nothing;
end; $$;

create or replace function public.get_my_multiplayer_history() returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
select coalesce(jsonb_agg(jsonb_build_object(
  'id',game.id,'started_at',game.started_at,'finished_at',game.finished_at,
  'scoring_mode',game.scoring_mode,'target_score',game.target_score,
  'ruleset_id',game.ruleset_id,'ruleset_version',game.ruleset_version,'ruleset_snapshot',game.ruleset_snapshot,
  'round_history',game.round_history,'player_names',game.player_names,
  'team_0_score',game.team_0_score,'team_1_score',game.team_1_score,'winner_team',game.winner_team,
  'end_reason',game.end_reason,'forfeiting_team',game.forfeiting_team,'round_count',game.round_count,
  'viewer_seat_index',viewer.seat_index,'players',(select coalesce(jsonb_agg(jsonb_build_object(
    'seat_index',player.seat_index,'kind',player.kind,'display_name',player.display_name,
    'bot_profile_id',player.bot_profile_id,'team_id',player.team_id) order by player.seat_index),'[]'::jsonb)
    from public.multiplayer_game_players player where player.game_id=game.id)
) order by game.finished_at desc),'[]'::jsonb)
from public.multiplayer_games game join public.multiplayer_game_players viewer
on viewer.game_id=game.id and viewer.kind='human' and viewer.user_id=auth.uid(); $$;

revoke all on function public.get_my_multiplayer_history() from public, anon;
grant execute on function public.get_my_multiplayer_history() to authenticated, service_role;
notify pgrst, 'reload schema';
