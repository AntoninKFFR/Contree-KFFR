do $$ declare result text;
begin
 if exists(select 1 from public.progression_weekly_progress) or exists(select 1 from public.progression_weekly_events) then raise exception 'migration backfilled';end if;
 if not exists(select 1 from public.progression_multiplayer_jobs where game_id='88888888-1111-4000-8000-000000000105' and permanent_missions_eligible and not weekly_missions_eligible and applied_at is null) then raise exception 'old job markers changed';end if;
 result:=public.apply_progression_multiplayer_game('88888888-1111-4000-8000-000000000105');
 if result<>'applied' or exists(select 1 from public.progression_weekly_events) or exists(select 1 from public.progression_weekly_progress)
 or (select total_xp from public.player_progression where user_id='88888888-0000-4000-8000-000000000105')<>550 then raise exception 'old pending job weekly or lost permanent/game';end if;
end $$;
delete from public.multiplayer_games where id='88888888-1111-4000-8000-000000000105';
delete from auth.users where id='88888888-0000-4000-8000-000000000105';
