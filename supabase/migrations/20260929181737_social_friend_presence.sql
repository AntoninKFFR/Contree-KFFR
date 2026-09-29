-- Private, short-lived activity signal. Only the two RPCs expose it to users.
create table public.social_presence (
  user_id uuid primary key references auth.users(id) on delete cascade,
  last_seen_at timestamptz not null
);

alter table public.social_presence enable row level security;
revoke all on public.social_presence from public, anon, authenticated;
grant all on public.social_presence to service_role;

create function private.touch_social_presence() returns boolean
language plpgsql security definer set search_path = '' as $$
declare v_actor uuid := auth.uid();
begin
  if v_actor is null then raise exception 'authentication_required' using errcode = 'P0001'; end if;
  insert into public.social_presence (user_id, last_seen_at) values (v_actor, now())
  on conflict (user_id) do update set last_seen_at = excluded.last_seen_at
    where public.social_presence.last_seen_at < excluded.last_seen_at - interval '10 seconds';
  return true;
end;
$$;

create function private.get_my_friend_presence() returns table(user_id uuid)
language plpgsql security definer set search_path = '' as $$
declare v_actor uuid := auth.uid();
begin
  if v_actor is null then raise exception 'authentication_required' using errcode = 'P0001'; end if;
  return query
    select p.user_id
      from public.friendships f
      join public.social_presence p on p.user_id = case when f.user_low = v_actor then f.user_high else f.user_low end
     where (f.user_low = v_actor or f.user_high = v_actor)
       and p.last_seen_at >= now() - interval '90 seconds';
end;
$$;

create function public.touch_social_presence() returns boolean
language sql security invoker set search_path = '' as $$
  select private.touch_social_presence();
$$;

create function public.get_my_friend_presence() returns table(user_id uuid)
language sql security invoker set search_path = '' as $$
  select * from private.get_my_friend_presence();
$$;

revoke all on function private.touch_social_presence(), private.get_my_friend_presence(),
  public.touch_social_presence(), public.get_my_friend_presence() from public, anon, authenticated;
grant execute on function private.touch_social_presence(), private.get_my_friend_presence(),
  public.touch_social_presence(), public.get_my_friend_presence() to authenticated;
