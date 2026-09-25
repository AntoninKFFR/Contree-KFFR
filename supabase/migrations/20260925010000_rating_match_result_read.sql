-- Read only the authenticated human participant's result for one archived game.
-- The Elo ledger remains inaccessible through direct client table grants.
create function private.get_my_rating_match_result(p_source_game_id uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_actor uuid := (select auth.uid());
  v_status text;
  v_before integer;
  v_delta integer;
  v_after integer;
  v_forfeited boolean;
begin
  if v_actor is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;
  if p_source_game_id is null then
    raise exception 'invalid_source_game_id' using errcode = '22023';
  end if;

  select match.status, participant.rating_before_apply, participant.delta,
    participant.rating_after_apply, participant.forfeited
    into v_status, v_before, v_delta, v_after, v_forfeited
  from public.rating_matches match
  join public.rating_match_participants participant on participant.match_id = match.id
  where match.source_game_id = p_source_game_id
    and participant.kind = 'human'
    and participant.user_id = v_actor;

  if not found then return null; end if;

  return pg_catalog.jsonb_build_object(
    'status', v_status,
    'rating_before', case when v_status = 'applied' then v_before else null end,
    'delta', case when v_status = 'applied' then v_delta else null end,
    'rating_after', case when v_status = 'applied' then v_after else null end,
    'forfeited', v_forfeited
  );
end;
$$;

create function public.get_my_rating_match_result(p_source_game_id uuid) returns jsonb
language sql stable security invoker set search_path = '' as $$
  select private.get_my_rating_match_result(p_source_game_id);
$$;

revoke all on function private.get_my_rating_match_result(uuid) from public, anon, authenticated;
grant execute on function private.get_my_rating_match_result(uuid) to authenticated;
revoke all on function public.get_my_rating_match_result(uuid) from public, anon;
grant execute on function public.get_my_rating_match_result(uuid) to authenticated;

notify pgrst, 'reload schema';
