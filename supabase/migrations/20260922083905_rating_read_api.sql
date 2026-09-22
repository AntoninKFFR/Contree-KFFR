-- Authenticated, read-only Elo projections. The private definer functions keep
-- the underlying rating ledger and profiles table outside direct client access.

create function private.rating_rank(p_rating integer) returns text
language sql immutable strict security invoker set search_path = '' as $$
  select case
    when p_rating >= 1750 then 'Capot de Capi I'
    when p_rating >= 1700 then 'Capot de Capi II'
    when p_rating >= 1650 then 'Capot de Capi III'
    when p_rating >= 1600 then 'Capot de Capi IV'
    when p_rating >= 1550 then 'Capot de Capi V'
    when p_rating >= 1500 then 'Sait jouer I'
    when p_rating >= 1450 then 'Sait jouer II'
    when p_rating >= 1400 then 'Sait jouer III'
    when p_rating >= 1350 then 'Sait jouer IV'
    when p_rating >= 1300 then 'Sait jouer V'
    when p_rating >= 1250 then 'Pas mauvais I'
    when p_rating >= 1200 then 'Pas mauvais II'
    when p_rating >= 1150 then 'Pas mauvais III'
    when p_rating >= 1100 then 'Pas mauvais IV'
    when p_rating >= 1050 then 'Pas mauvais V'
    when p_rating >= 1000 then 'Débutant I'
    when p_rating >= 950 then 'Débutant II'
    when p_rating >= 900 then 'Débutant III'
    when p_rating >= 850 then 'Débutant IV'
    else 'Débutant V'
  end;
$$;

create function private.get_my_rating_summary() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_actor uuid := (select auth.uid());
  v_rating public.player_ratings;
  v_position bigint;
  v_pending_matches bigint;
begin
  if v_actor is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;

  select * into v_rating
  from public.player_ratings
  where user_id = v_actor;

  if found and v_rating.rated_games >= 5 then
    select ranked.position into v_position
    from (
      select user_id, pg_catalog.dense_rank() over (order by rating desc) as position
      from public.player_ratings
      where rated_games >= 5
    ) ranked
    where ranked.user_id = v_actor;
  end if;

  select pg_catalog.count(*) into v_pending_matches
  from public.rating_match_participants participant
  join public.rating_matches match on match.id = participant.match_id
  where participant.kind = 'human'
    and participant.user_id = v_actor
    and match.status = 'pending';

  if v_rating.user_id is null then
    return pg_catalog.jsonb_build_object(
      'rating', 1000,
      'rated_games', 0,
      'wins', 0,
      'losses', 0,
      'forfeits', 0,
      'peak_rating', 1000,
      'rank', null,
      'position', null,
      'placement_games', 0,
      'is_ranked', false,
      'pending_matches', v_pending_matches
    );
  end if;

  return pg_catalog.jsonb_build_object(
    'rating', v_rating.rating,
    'rated_games', v_rating.rated_games,
    'wins', v_rating.wins,
    'losses', v_rating.losses,
    'forfeits', v_rating.forfeits,
    'peak_rating', v_rating.peak_rating,
    'rank', case when v_rating.rated_games >= 5 then private.rating_rank(v_rating.rating) else null end,
    'position', v_position,
    'placement_games', pg_catalog.least(v_rating.rated_games, 5),
    'is_ranked', v_rating.rated_games >= 5,
    'pending_matches', v_pending_matches
  );
end;
$$;

create function private.get_rating_leaderboard(p_limit integer, p_offset integer)
returns table(username text, rating integer, rank text, position bigint)
language plpgsql stable security definer set search_path = '' as $$
begin
  if (select auth.uid()) is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;
  if p_limit is null or p_limit < 1 or p_limit > 100 or p_offset is null or p_offset < 0 then
    raise exception 'invalid_pagination' using errcode = '22023';
  end if;

  return query
  with ranked as materialized (
    select
      player.user_id,
      player.rating,
      pg_catalog.dense_rank() over (order by player.rating desc) as position
    from public.player_ratings player
    where player.rated_games >= 5
  )
  select
    profile.username::text,
    ranked.rating,
    private.rating_rank(ranked.rating),
    ranked.position
  from ranked
  join public.profiles profile on profile.id = ranked.user_id
  where profile.username is not null
  order by ranked.rating desc, ranked.user_id
  limit p_limit offset p_offset;
end;
$$;

-- PostgREST exposes only SECURITY INVOKER wrappers. The definer functions above
-- authenticate the caller and return bounded projections.
create function public.get_my_rating_summary() returns jsonb
language sql stable security invoker set search_path = '' as $$
  select private.get_my_rating_summary();
$$;

create function public.get_rating_leaderboard(
  p_limit integer default 50,
  p_offset integer default 0
)
returns table(username text, rating integer, rank text, position bigint)
language sql stable security invoker set search_path = '' as $$
  select * from private.get_rating_leaderboard(p_limit, p_offset);
$$;

revoke all on function private.rating_rank(integer) from public, anon, authenticated;
revoke all on function private.get_my_rating_summary() from public, anon, authenticated;
revoke all on function private.get_rating_leaderboard(integer, integer) from public, anon, authenticated;
grant execute on function private.get_my_rating_summary() to authenticated;
grant execute on function private.get_rating_leaderboard(integer, integer) to authenticated;

revoke all on function public.get_my_rating_summary() from public, anon;
revoke all on function public.get_rating_leaderboard(integer, integer) from public, anon;
grant execute on function public.get_my_rating_summary() to authenticated;
grant execute on function public.get_rating_leaderboard(integer, integer) to authenticated;

notify pgrst, 'reload schema';
