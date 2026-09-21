-- Elo V1 foundations only. No gameplay hook or client-facing rating RPC is installed here.
-- The start snapshot is private data; PR B will write it with lobby -> playing.
create table public.player_ratings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  rating integer not null default 1000,
  rated_games integer not null default 0,
  wins integer not null default 0,
  losses integer not null default 0,
  forfeits integer not null default 0,
  peak_rating integer not null default 1000,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint player_ratings_rating_nonnegative check (rating >= 0),
  constraint player_ratings_games_nonnegative check (rated_games >= 0 and wins >= 0 and losses >= 0 and forfeits >= 0),
  constraint player_ratings_games_balance check (rated_games = wins + losses),
  constraint player_ratings_forfeits_bound check (forfeits <= losses),
  constraint player_ratings_peak_bound check (peak_rating >= rating)
);
create index player_ratings_leaderboard_idx on public.player_ratings(rating desc, user_id)
  where rated_games >= 5;

-- active_game_id exists before multiplayer_games.id, so this parent cannot FK to
-- the finished archive. A distinct row is kept for each game, including rematches.
create table public.rating_start_snapshots (
  source_game_id uuid primary key,
  source_room_id uuid references public.rooms(id) on delete set null,
  formula_version smallint not null default 1 check (formula_version = 1),
  ruleset_id text not null check (ruleset_id = 'contree-kffr'),
  ruleset_version integer not null check (ruleset_version = 1),
  ruleset_snapshot jsonb not null check (jsonb_typeof(ruleset_snapshot) = 'object'),
  human_count smallint not null check (human_count between 1 and 4),
  reliability_factor numeric(4,2) not null,
  started_at timestamptz not null,
  created_at timestamptz not null default now(),
  constraint rating_start_reliability check (
    (human_count = 4 and reliability_factor = 1.00)
    or (human_count = 3 and reliability_factor = 0.95)
    or (human_count = 2 and reliability_factor in (0.85, 0.60))
    or (human_count = 1 and reliability_factor = 0.20)
  )
);

create table public.rating_start_snapshot_participants (
  source_game_id uuid not null references public.rating_start_snapshots(source_game_id) on delete cascade,
  seat_index smallint not null check (seat_index between 0 and 3),
  team_id smallint not null check (team_id = (seat_index % 2)),
  kind text not null check (kind in ('human', 'bot')),
  user_id uuid references auth.users(id) on delete set null,
  rating_snapshot integer not null check (rating_snapshot >= 0),
  k_factor_snapshot smallint,
  bot_profile_id text,
  bot_version text,
  bot_rating_snapshot integer,
  primary key (source_game_id, seat_index),
  constraint rating_start_participant_kind check (
    (kind = 'human' and k_factor_snapshot is not null and k_factor_snapshot in (32, 36, 40)
      and bot_profile_id is null and bot_version is null and bot_rating_snapshot is null)
    or (kind = 'bot' and user_id is null and k_factor_snapshot is null
      and bot_profile_id is not null and length(bot_profile_id) > 0
      and bot_version is not null and length(bot_version) > 0
      and bot_rating_snapshot is not null and bot_rating_snapshot >= 0
      and rating_snapshot = bot_rating_snapshot)
  )
);
create unique index rating_start_one_seat_per_human_idx
  on public.rating_start_snapshot_participants(source_game_id, user_id)
  where kind = 'human' and user_id is not null;

-- Created only with the authoritative finished archive in PR B. No match is
-- applied by this migration; pending -> applied belongs to a later worker PR.
create table public.rating_matches (
  id uuid primary key default gen_random_uuid(),
  source_game_id uuid not null unique,
  source_room_id uuid references public.rooms(id) on delete set null,
  ruleset_id text not null check (ruleset_id = 'contree-kffr'),
  ruleset_version integer not null check (ruleset_version = 1),
  ruleset_snapshot jsonb not null check (jsonb_typeof(ruleset_snapshot) = 'object'),
  formula_version smallint not null default 1 check (formula_version = 1),
  human_count smallint not null check (human_count between 1 and 4),
  reliability_factor numeric(4,2) not null,
  winner_team smallint check (winner_team in (0, 1)),
  end_reason text check (end_reason in ('score', 'forfeit')),
  forfeiting_seat_index smallint check (forfeiting_seat_index between 0 and 3),
  status text not null default 'pending' check (status in ('pending', 'applied', 'void')),
  started_at timestamptz not null,
  completed_at timestamptz not null,
  processed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint rating_matches_start_fk foreign key (source_game_id)
    references public.rating_start_snapshots(source_game_id) on delete restrict,
  constraint rating_matches_archive_fk foreign key (source_game_id)
    references public.multiplayer_games(id) on delete restrict,
  constraint rating_matches_time_order check (completed_at >= started_at),
  constraint rating_matches_processing check ((status = 'applied') = (processed_at is not null)),
  constraint rating_matches_result check (
    status = 'void' or (winner_team is not null and end_reason is not null)
  ),
  constraint rating_matches_forfeit check (
    (end_reason = 'score' and forfeiting_seat_index is null)
    or (end_reason = 'forfeit' and forfeiting_seat_index is not null
      and winner_team is not null and (forfeiting_seat_index % 2) <> winner_team)
    or (status = 'void' and end_reason is null and forfeiting_seat_index is null)
  ),
  constraint rating_matches_reliability check (
    (human_count = 4 and reliability_factor = 1.00)
    or (human_count = 3 and reliability_factor = 0.95)
    or (human_count = 2 and reliability_factor in (0.85, 0.60))
    or (human_count = 1 and reliability_factor = 0.20)
  )
);
create index rating_matches_pending_idx on public.rating_matches(created_at, id) where status = 'pending';

create table public.rating_match_participants (
  match_id uuid not null references public.rating_matches(id) on delete cascade,
  seat_index smallint not null check (seat_index between 0 and 3),
  team_id smallint not null check (team_id = (seat_index % 2)),
  kind text not null check (kind in ('human', 'bot')),
  user_id uuid references auth.users(id) on delete set null,
  rating_snapshot integer not null check (rating_snapshot >= 0),
  k_factor_snapshot smallint,
  bot_profile_id text,
  bot_version text,
  bot_rating_snapshot integer,
  result smallint check (result in (0, 1)),
  forfeited boolean not null default false,
  rating_before_apply integer,
  delta integer,
  rating_after_apply integer,
  primary key (match_id, seat_index),
  constraint rating_match_participant_kind check (
    (kind = 'human' and k_factor_snapshot is not null and k_factor_snapshot in (32, 36, 40)
      and bot_profile_id is null and bot_version is null and bot_rating_snapshot is null)
    or (kind = 'bot' and user_id is null and k_factor_snapshot is null
      and bot_profile_id is not null and length(bot_profile_id) > 0
      and bot_version is not null and length(bot_version) > 0
      and bot_rating_snapshot is not null and bot_rating_snapshot >= 0
      and rating_snapshot = bot_rating_snapshot)
  ),
  constraint rating_match_participant_forfeit check (not forfeited or kind = 'human'),
  constraint rating_match_participant_apply check (
    (num_nonnulls(rating_before_apply, delta, rating_after_apply) = 0)
    or (num_nonnulls(rating_before_apply, delta, rating_after_apply) = 3
      and kind = 'human' and rating_before_apply >= 0
      and rating_after_apply >= 0 and rating_after_apply = rating_before_apply + delta)
  )
);
create unique index rating_match_one_seat_per_human_idx
  on public.rating_match_participants(match_id, user_id)
  where kind = 'human' and user_id is not null;
create index rating_match_participants_user_idx
  on public.rating_match_participants(user_id, match_id) where user_id is not null;

-- A worker may only mark a complete four-seat match applied. Pending rows are
-- assembled with the finished archive in PR B; this guard catches partial work.
create function private.rating_require_complete_applied_match() returns trigger
language plpgsql set search_path = '' as $$
declare
  v_count integer;
  v_humans integer;
begin
  if new.status <> 'applied' then return new; end if;
  select count(*), count(*) filter (where kind = 'human')
    into v_count, v_humans
    from public.rating_match_participants
   where match_id = new.id;
  if v_count <> 4 or v_humans <> new.human_count then
    raise exception 'rating_match_incomplete' using errcode = '23514';
  end if;
  return new;
end;
$$;
revoke all on function private.rating_require_complete_applied_match() from public, anon, authenticated;
grant execute on function private.rating_require_complete_applied_match() to service_role;
create trigger rating_require_complete_applied_match
before insert or update of status on public.rating_matches
for each row execute function private.rating_require_complete_applied_match();

-- No client SELECT or write on the Elo ledger. Future read RPCs may project
-- only the minimum public fields without broadening profiles RLS.
alter table public.player_ratings enable row level security;
alter table public.rating_start_snapshots enable row level security;
alter table public.rating_start_snapshot_participants enable row level security;
alter table public.rating_matches enable row level security;
alter table public.rating_match_participants enable row level security;
revoke all on public.player_ratings, public.rating_start_snapshots,
  public.rating_start_snapshot_participants, public.rating_matches,
  public.rating_match_participants from public, anon, authenticated;
grant all on public.player_ratings, public.rating_start_snapshots,
  public.rating_start_snapshot_participants, public.rating_matches,
  public.rating_match_participants to service_role;

notify pgrst, 'reload schema';
