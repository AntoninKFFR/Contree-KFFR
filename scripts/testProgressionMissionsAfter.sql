-- Verify the REAL #104 migration left old rows and pending jobs unrewarded.
do $$ declare result text;
begin
  if exists(select 1 from public.progression_permanent_mission_completions) or exists(select 1 from public.progression_xp_events) then raise exception 'migration backfilled history'; end if;
  if not exists(select 1 from public.progression_multiplayer_jobs where game_id='99999999-1111-4000-8000-000000000104' and not permanent_missions_eligible and applied_at is null) then raise exception 'old pending job eligibility changed'; end if;
  result := public.apply_progression_multiplayer_game('99999999-1111-4000-8000-000000000104');
  if result <> 'applied' or exists(select 1 from public.progression_permanent_mission_completions)
    or (select total_xp from public.player_progression where user_id='99999999-0000-4000-8000-000000000104') <> 50 then raise exception 'old pending job awarded missions'; end if;
end $$;
delete from public.multiplayer_games where id='99999999-1111-4000-8000-000000000104';
delete from auth.users where id='99999999-0000-4000-8000-000000000104';
