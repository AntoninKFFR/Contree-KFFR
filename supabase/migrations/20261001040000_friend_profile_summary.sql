-- #114: friend-only minimal projection; all existing table grants/policies remain intact.
create function private.progression_level_from_total_xp(p_total_xp bigint) returns integer
language plpgsql immutable security invoker set search_path = '' as $$
declare low integer := 1; high integer := 2; middle integer;
begin
  if p_total_xp is null or p_total_xp not between 0 and 9007199254740991 then
    raise exception 'invalid_progression_xp' using errcode = '22023';
  end if;
  -- Exact logarithmic search using the canonical integer threshold, never floats.
  while private.progression_total_xp_for_level(high) <= p_total_xp loop
    low := high; high := high * 2;
  end loop;
  while high - low > 1 loop
    middle := low + (high - low) / 2;
    if private.progression_total_xp_for_level(middle) <= p_total_xp then
      low := middle;
    else high := middle;
    end if;
  end loop;
  return low;
end;
$$;
revoke all on function private.progression_level_from_total_xp(bigint) from public, anon, authenticated, service_role;

create or replace function private.get_my_social_snapshot() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_actor uuid := private.social_actor(); v_snapshot jsonb;
begin
  v_snapshot := pg_catalog.jsonb_build_object(
    'friends', coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'user_id', p.id, 'username', p.username, 'created_at', f.created_at,
        'level', private.progression_level_from_total_xp(coalesce(pp.total_xp, 0))
      ) order by pg_catalog.lower(p.username), p.id)
      from public.friendships f join public.profiles p
        on p.id = case when f.user_low = v_actor then f.user_high else f.user_low end
      left join public.player_progression pp on pp.user_id = p.id
      where f.user_low = v_actor or f.user_high = v_actor
    ), '[]'::jsonb),
    'received', coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'id', r.id, 'user_id', r.requester_id, 'username', p.username, 'created_at', r.created_at
      ) order by r.created_at desc, r.id)
      from public.friend_requests r join public.profiles p on p.id = r.requester_id
      where r.recipient_id = v_actor and r.status = 'pending'
    ), '[]'::jsonb),
    'sent', coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'id', r.id, 'user_id', r.recipient_id, 'username', p.username, 'created_at', r.created_at
      ) order by r.created_at desc, r.id)
      from public.friend_requests r join public.profiles p on p.id = r.recipient_id
      where r.requester_id = v_actor and r.status = 'pending'
    ), '[]'::jsonb)
  );
  return v_snapshot || pg_catalog.jsonb_build_object('counts', pg_catalog.jsonb_build_object(
    'friends', pg_catalog.jsonb_array_length(v_snapshot -> 'friends'),
    'received', pg_catalog.jsonb_array_length(v_snapshot -> 'received'),
    'sent', pg_catalog.jsonb_array_length(v_snapshot -> 'sent')
  ));
end;
$$;

create function private.get_friend_profile(p_friend_id uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  actor uuid := private.social_actor(); friend_name text; friend_level integer;
  equipped jsonb; solo jsonb; multiplayer jsonb; rating jsonb;
begin
  -- Same response for null, self, unknown, pending and removed, before any friend data.
  if p_friend_id is null or p_friend_id = actor
     or not private.social_are_friends(actor, p_friend_id) then
    raise exception 'friend_profile_unavailable' using errcode = 'P0001';
  end if;
  select p.username, private.progression_level_from_total_xp(coalesce(pp.total_xp, 0))
    into friend_name, friend_level from public.profiles p
    left join public.player_progression pp on pp.user_id = p.id where p.id = p_friend_id;
  if friend_name is null then
    raise exception 'friend_profile_unavailable' using errcode = 'P0001';
  end if;
  select jsonb_build_object('title', null, 'badge', null, 'frame', null) ||
    coalesce(jsonb_object_agg(e.slot, jsonb_build_object(
      'key', c.key, 'slot', c.slot, 'name', c.display_name, 'visualVariant', c.visual_variant)), '{}'::jsonb)
    into equipped from public.profile_cosmetic_equipment e
    join public.profile_cosmetics c on c.key = e.cosmetic_key and c.slot = e.slot
    where e.user_id = p_friend_id;
  select jsonb_build_object('games', n, 'wins', w, 'losses', n-w,
    'winrate', case when n=0 then 0 else round(100::numeric*w/n) end) into solo
    from (select count(*) n, count(*) filter(where won) w
          from public.games where user_id = p_friend_id) s;
  select jsonb_build_object('games', n, 'wins', w, 'losses', n-w,
    'winrate', case when n=0 then 0 else round(100::numeric*w/n) end) into multiplayer
    from (select count(*) n, count(*) filter(where team_id=winner_team) w
      from (select distinct on (g.id) g.id, g.winner_team, p.team_id
        from public.multiplayer_game_players p join public.multiplayer_games g on g.id=p.game_id
        where p.kind='human' and p.user_id=p_friend_id order by g.id, p.seat_index) games) s;
  -- Identical public ranking eligibility and DENSE_RANK semantics to the rating read API.
  select jsonb_build_object('rating', r.rating, 'rank', private.rating_rank(r.rating), 'position', r.position)
    into rating from (select pr.user_id, pr.rating, dense_rank() over(order by pr.rating desc) position
      from public.player_ratings pr join public.profiles p on p.id=pr.user_id
      where pr.rated_games>=5 and p.username is not null) r where r.user_id=p_friend_id;
  return jsonb_build_object('userId', p_friend_id, 'username', friend_name, 'level', friend_level,
    'equipped', equipped, 'solo', solo, 'multiplayer', multiplayer, 'rating', rating);
end;
$$;
create function public.get_friend_profile(p_friend_id uuid) returns jsonb
language sql stable security invoker set search_path = '' as $$
  select private.get_friend_profile(p_friend_id);
$$;
revoke all on function private.get_friend_profile(uuid), public.get_friend_profile(uuid) from public, anon, authenticated, service_role;
grant execute on function private.get_friend_profile(uuid), public.get_friend_profile(uuid) to authenticated;
notify pgrst, 'reload schema';
