-- Only self and direct friends with a record for the requested puzzle level.
-- Existing indexes cover both sides of friendships and the record lookup.
create function private.get_friends_training_leaderboard(p_axis_id text, p_level integer)
returns table(username text, best_score numeric, best_duration_ms integer)
language plpgsql security definer set search_path = '' as $$
declare v_actor uuid := private.social_actor();
begin
  if p_axis_id is null or pg_catalog.btrim(p_axis_id) = ''
    or pg_catalog.char_length(p_axis_id) > 64
    or p_level is null or p_level < 1 or p_level > 20 then
    raise exception 'invalid_training_leaderboard_query' using errcode = 'P0001';
  end if;

  return query
    with allowed_users as (
      select v_actor as user_id
      union
      select case when f.user_low = v_actor then f.user_high else f.user_low end
      from public.friendships f
      where f.user_low = v_actor or f.user_high = v_actor
    )
    select p.username, r.best_score, r.best_duration_ms
    from allowed_users allowed
    join public.training_records r on r.user_id = allowed.user_id
      and r.axis_id = p_axis_id and r.level = p_level
    join public.profiles p on p.id = allowed.user_id
    where p.username is not null
    order by r.best_score desc, r.best_duration_ms asc nulls last,
      pg_catalog.lower(p.username), p.username
    limit 50;
end;
$$;

-- PostgREST exposes only this authenticated, invoker-rights wrapper.
create function public.get_friends_training_leaderboard(p_axis_id text, p_level integer)
returns table(username text, best_score numeric, best_duration_ms integer)
language sql security invoker set search_path = '' as $$
  select * from private.get_friends_training_leaderboard(p_axis_id, p_level);
$$;

revoke all on function private.get_friends_training_leaderboard(text, integer) from public, anon, authenticated;
grant execute on function private.get_friends_training_leaderboard(text, integer) to authenticated;
revoke all on function public.get_friends_training_leaderboard(text, integer) from public, anon;
grant execute on function public.get_friends_training_leaderboard(text, integer) to authenticated;

notify pgrst, 'reload schema';
