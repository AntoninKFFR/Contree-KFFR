-- #102: new authoritative games only. Do not backfill historical archives.
-- One canonical reward function, shared by both SQL finalization paths.
create function private.progression_game_xp(p_mode text, p_won boolean, p_end_reason text, p_kind text)
returns bigint language plpgsql immutable security invoker set search_path = '' as $$
begin
  if p_mode is null or p_mode not in ('solo', 'multiplayer') or p_won is null
    or p_end_reason is null or p_end_reason not in ('score', 'forfeit')
    or p_kind is null or p_kind not in ('human', 'bot')
    or (p_mode = 'solo' and p_end_reason <> 'score') then
    raise exception 'invalid_progression_game_result' using errcode = '22023';
  end if;
  if p_kind = 'bot' or (p_end_reason = 'forfeit' and not p_won) then return 0; end if;
  if p_mode = 'solo' then return 20 + case when p_won then 10 else 0 end; end if;
  return 30 + case when p_won then 20 else 0 end;
end;
$$;
revoke all on function private.progression_game_xp(text,boolean,text,text) from public, anon, authenticated;
grant execute on function private.progression_game_xp(text,boolean,text,text) to service_role;

create table public.solo_game_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  start_key uuid not null,
  engine_version integer not null default 1 check (engine_version = 1),
  state jsonb not null check (jsonb_typeof(state) = 'object'),
  state_version bigint not null default 0 check (state_version >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (user_id, start_key)
);
alter table public.solo_game_sessions enable row level security;
revoke all on public.solo_game_sessions from public, anon, authenticated, service_role;
grant select on public.solo_game_sessions to service_role;

-- Remove legacy client result creation, preserving all existing history rows.
do $$ declare v_policy text;
begin
  for v_policy in select policyname from pg_policies where schemaname = 'public'
    and tablename = 'games' and cmd in ('INSERT', 'UPDATE', 'DELETE', 'ALL') loop
    execute format('drop policy %I on public.games', v_policy);
  end loop;
end $$;
revoke insert, update, delete, truncate, references, trigger on public.games from public, anon, authenticated;

create function public.create_solo_game_session(p_user_id uuid, p_start_key uuid, p_state jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_session public.solo_game_sessions;
begin
  if p_user_id is null or p_start_key is null or p_state is null
    or p_state->>'phase' is distinct from 'bidding'
    or p_state->'totalScore' is distinct from '{"0":0,"1":0}'::jsonb
    or p_state->'winnerTeam' is distinct from 'null'::jsonb then
    raise exception 'invalid_solo_start' using errcode = '22023';
  end if;
  insert into public.solo_game_sessions(user_id,start_key,state) values (p_user_id,p_start_key,p_state)
    on conflict (user_id,start_key) do nothing returning * into v_session;
  if not found then
    select * into v_session from public.solo_game_sessions where user_id = p_user_id and start_key = p_start_key;
    if v_session.state->'settings' is distinct from p_state->'settings' then
      raise exception 'solo_start_key_mismatch' using errcode = '23514';
    end if;
  end if;
  return to_jsonb(v_session);
end;
$$;
revoke all on function public.create_solo_game_session(uuid,uuid,jsonb) from public, anon, authenticated;
grant execute on function public.create_solo_game_session(uuid,uuid,jsonb) to service_role;

-- p_state is computed by the authenticated server action handler, never read from
-- the browser body. CAS commits transitions once; terminal archive + XP is atomic.
create function public.commit_solo_game_session(p_session_id uuid,p_user_id uuid,p_expected_version bigint,p_state jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_session public.solo_game_sessions;
  v_winner integer;
  v_amount bigint;
begin
  if p_session_id is null or p_user_id is null or p_expected_version is null or p_expected_version < 0 then
    raise exception 'invalid_solo_commit' using errcode = '22023';
  end if;
  select * into v_session from public.solo_game_sessions where id = p_session_id and user_id = p_user_id for update;
  if not found then raise exception 'solo_session_not_found' using errcode = 'P0002'; end if;
  if v_session.completed_at is not null or v_session.state_version <> p_expected_version then
    return to_jsonb(v_session);
  end if;
  if p_state is null or jsonb_typeof(p_state) <> 'object'
    or p_state->>'phase' is null or p_state->>'phase' not in ('bidding','playing','finished','game-over')
    or p_state->'settings' is distinct from v_session.state->'settings'
    or p_state->'playerNames' is distinct from v_session.state->'playerNames' then
    raise exception 'invalid_solo_transition' using errcode = '22023';
  end if;
  if p_state->>'phase' = 'game-over' then
    v_winner := (p_state->>'winnerTeam')::integer;
    if v_winner is null or v_winner not in (0,1) or coalesce(p_state->>'endReason','score') <> 'score' then
      raise exception 'invalid_solo_finish' using errcode = '22023';
    end if;
    insert into public.games(id,user_id,won,scoring_mode,player_score,bot_score,target_score,
      bot_summary,ruleset_id,ruleset_version,ruleset_snapshot,round_history,player_names)
    values (v_session.id,v_session.user_id,v_winner = 0,p_state->'settings'->>'scoringMode',
      (p_state->'totalScore'->>'0')::integer,(p_state->'totalScore'->>'1')::integer,
      (p_state->'settings'->>'targetScore')::integer,
      concat_ws(', ',p_state->'playerNames'->>'1',p_state->'playerNames'->>'2',p_state->'playerNames'->>'3'),
      p_state->'settings'->'ruleset'->>'id',(p_state->'settings'->'ruleset'->>'version')::integer,
      p_state->'settings'->'ruleset',p_state->'roundHistory',p_state->'playerNames');
    v_amount := private.progression_game_xp('solo',v_winner = 0,'score','human');
    perform public.credit_progression_xp(v_session.user_id,v_amount,'solo_game',v_session.id::text);
  end if;
  update public.solo_game_sessions set state = p_state,state_version = state_version + 1,updated_at = now(),
    completed_at = case when p_state->>'phase' = 'game-over' then now() else null end
    where id = v_session.id returning * into v_session;
  return to_jsonb(v_session);
end;
$$;
revoke all on function public.commit_solo_game_session(uuid,uuid,bigint,jsonb) from public, anon, authenticated;
grant execute on function public.commit_solo_game_session(uuid,uuid,bigint,jsonb) to service_role;

-- A durable outbox records only archives INSERTed after this migration. Its
-- enqueue transaction is the existing archive transaction on every finish path.
create table public.progression_multiplayer_jobs (
  game_id uuid primary key references public.multiplayer_games(id) on delete cascade,
  created_at timestamptz not null default now(),
  applied_at timestamptz
);
create index progression_multiplayer_jobs_pending_idx on public.progression_multiplayer_jobs(created_at,game_id)
  where applied_at is null;
alter table public.progression_multiplayer_jobs enable row level security;
revoke all on public.progression_multiplayer_jobs from public, anon, authenticated, service_role;
grant select on public.progression_multiplayer_jobs to service_role;

create function private.enqueue_progression_multiplayer_game() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.progression_multiplayer_jobs(game_id) values (new.id);
  return new;
end;
$$;
revoke all on function private.enqueue_progression_multiplayer_game() from public, anon, authenticated;
grant execute on function private.enqueue_progression_multiplayer_game() to service_role;
create trigger enqueue_progression_multiplayer_game after insert on public.multiplayer_games
  for each row execute function private.enqueue_progression_multiplayer_game();

create function public.apply_progression_multiplayer_game(p_game_id uuid) returns text
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
    end if;
  end loop;
  update public.progression_multiplayer_jobs set applied_at = now() where game_id = p_game_id;
  return 'applied';
end;
$$;
revoke all on function public.apply_progression_multiplayer_game(uuid) from public, anon, authenticated;
grant execute on function public.apply_progression_multiplayer_game(uuid) to service_role;

notify pgrst, 'reload schema';
