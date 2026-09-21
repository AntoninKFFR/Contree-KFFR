-- Social data stays private to the participants. All writes go through RPCs.
create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated, service_role;

create table public.friend_requests (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references auth.users(id) on delete cascade,
  recipient_id uuid not null references auth.users(id) on delete cascade,
  user_low uuid generated always as (least(requester_id, recipient_id)) stored,
  user_high uuid generated always as (greatest(requester_id, recipient_id)) stored,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined', 'cancelled')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  constraint friend_requests_distinct_users check (requester_id <> recipient_id),
  constraint friend_requests_resolution check ((status = 'pending') = (resolved_at is null))
);
create unique index friend_requests_one_pending_pair on public.friend_requests(user_low, user_high) where status = 'pending';
create index friend_requests_recipient_status_created on public.friend_requests(recipient_id, status, created_at desc);
create index friend_requests_requester_status_created on public.friend_requests(requester_id, status, created_at desc);
create index friend_requests_pair_resolved on public.friend_requests(user_low, user_high, resolved_at desc);

create table public.friendships (
  user_low uuid not null references auth.users(id) on delete cascade,
  user_high uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_low, user_high),
  constraint friendships_canonical_pair check (user_low < user_high)
);
create index friendships_high_low on public.friendships(user_high, user_low);

create table public.game_invitations (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  inviter_id uuid not null references auth.users(id) on delete cascade,
  invitee_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined', 'expired', 'cancelled')),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '30 minutes'),
  resolved_at timestamptz,
  constraint game_invitations_distinct_users check (inviter_id <> invitee_id),
  constraint game_invitations_resolution check ((status = 'pending') = (resolved_at is null)),
  constraint game_invitations_positive_expiration check (expires_at > created_at)
);
create unique index game_invitations_one_pending_room_invitee on public.game_invitations(room_id, invitee_id) where status = 'pending';
create index game_invitations_invitee_status_created on public.game_invitations(invitee_id, status, created_at desc);
create index game_invitations_inviter_status_created on public.game_invitations(inviter_id, status, created_at desc);
create index game_invitations_pending_expiry on public.game_invitations(expires_at) where status = 'pending';

create table public.social_rate_limits (
  actor_id uuid not null references auth.users(id) on delete cascade,
  action text not null,
  scope text not null default '',
  window_start timestamptz not null,
  count integer not null default 0 check (count > 0),
  primary key (actor_id, action, scope, window_start)
);
create index social_rate_limits_window on public.social_rate_limits(window_start);

alter table public.friend_requests enable row level security;
alter table public.friendships enable row level security;
alter table public.game_invitations enable row level security;
alter table public.social_rate_limits enable row level security;
revoke all on public.friend_requests, public.friendships, public.game_invitations, public.social_rate_limits from public, anon, authenticated;
grant select on public.friend_requests, public.friendships, public.game_invitations to authenticated;
grant all on public.friend_requests, public.friendships, public.game_invitations, public.social_rate_limits to service_role;

create policy friend_requests_participants_read on public.friend_requests for select to authenticated
  using (requester_id = (select auth.uid()) or recipient_id = (select auth.uid()));
create policy friendships_participants_read on public.friendships for select to authenticated
  using (user_low = (select auth.uid()) or user_high = (select auth.uid()));
create policy game_invitations_participants_read on public.game_invitations for select to authenticated
  using (inviter_id = (select auth.uid()) or invitee_id = (select auth.uid()));

-- Helpers have no client EXECUTE. The calling RPC transaction rolls back quota
-- increments whenever a later validation or insert fails.
create function private.social_actor() returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_actor uuid := auth.uid();
begin
  if v_actor is null then raise exception 'authentication_required' using errcode = 'P0001'; end if;
  if not exists (select 1 from public.profiles where id = v_actor and username is not null) then
    raise exception 'username_required' using errcode = 'P0001';
  end if;
  return v_actor;
end;
$$;

create function private.social_charge(p_actor uuid, p_action text, p_scope text, p_window timestamptz, p_limit integer)
returns void language plpgsql security definer set search_path = '' as $$
begin
  insert into public.social_rate_limits(actor_id, action, scope, window_start, count)
  values (p_actor, p_action, p_scope, p_window, 1)
  on conflict (actor_id, action, scope, window_start)
  do update set count = public.social_rate_limits.count + 1
    where public.social_rate_limits.count < p_limit;
  if not found then raise sqlstate 'PT429' using message = 'rate_limited'; end if;
end;
$$;

create function private.social_pair_lock(p_first uuid, p_second uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    least(p_first, p_second)::text || ':' || greatest(p_first, p_second)::text, 413601
  ));
end;
$$;

create function private.social_room_lock(p_room_id uuid) returns public.rooms
language plpgsql security definer set search_path = '' as $$
declare v_room public.rooms;
begin
  select * into v_room from public.rooms where id = p_room_id for update;
  if not found then raise exception 'room_unavailable' using errcode = 'P0001'; end if;
  return v_room;
end;
$$;

create function private.social_room_has_empty_seat(p_room_id uuid) returns boolean
language sql security definer set search_path = '' as $$
  select exists (select 1 from public.room_players where room_id = p_room_id and kind = 'empty');
$$;

create function private.social_human_seated(p_room_id uuid, p_user_id uuid) returns boolean
language sql security definer set search_path = '' as $$
  select exists (select 1 from public.room_players where room_id = p_room_id and user_id = p_user_id and kind = 'human');
$$;

create function private.social_are_friends(p_first uuid, p_second uuid) returns boolean
language sql security definer set search_path = '' as $$
  select exists (select 1 from public.friendships
    where user_low = least(p_first, p_second) and user_high = greatest(p_first, p_second));
$$;

-- Caller holds the room lock where room state matters. Time expiry is safe
-- without that lock, while seated invitees retain their acceptance path.
create function private.social_expire_room_invitations(p_room_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  update public.game_invitations as i
     set status = 'expired', resolved_at = now()
   where i.room_id = p_room_id and i.status = 'pending'
     and (i.expires_at <= now() or not private.social_are_friends(i.inviter_id, i.invitee_id)
       or (not private.social_human_seated(i.room_id, i.invitee_id)
         and (not exists (select 1 from public.rooms r where r.id = i.room_id and r.status = 'lobby')
           or not private.social_room_has_empty_seat(i.room_id))));
end;
$$;

create function private.search_players_by_username(p_prefix text)
returns table(user_id uuid, username text)
language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := private.social_actor();
  v_prefix text := pg_catalog.btrim(p_prefix);
  v_pattern text;
begin
  if v_prefix is null or pg_catalog.char_length(v_prefix) not between 3 and 40 then
    raise exception 'invalid_prefix' using errcode = 'P0001';
  end if;
  v_pattern := pg_catalog.replace(pg_catalog.replace(pg_catalog.replace(pg_catalog.lower(v_prefix), '\', '\\'), '%', '\%'), '_', '\_') || '%';
  perform private.social_charge(v_actor, 'search_minute', '', pg_catalog.date_trunc('minute', now()), 10);
  perform private.social_charge(v_actor, 'search_day', '', pg_catalog.date_trunc('day', now() at time zone 'utc') at time zone 'utc', 100);
  return query
    select p.id, p.username from public.profiles p
     where p.id <> v_actor and pg_catalog.lower(p.username) like v_pattern escape '\'
     order by pg_catalog.lower(p.username), p.id limit 10;
end;
$$;
create index profiles_username_prefix_lower on public.profiles (lower(username) text_pattern_ops)
  where username is not null;

create function private.get_my_social_snapshot() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_actor uuid := private.social_actor(); v_snapshot jsonb;
begin
  v_snapshot := pg_catalog.jsonb_build_object(
    'friends', coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'user_id', p.id, 'username', p.username, 'created_at', f.created_at
      ) order by pg_catalog.lower(p.username), p.id)
      from public.friendships f join public.profiles p
        on p.id = case when f.user_low = v_actor then f.user_high else f.user_low end
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

create function private.send_friend_request(p_recipient_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := private.social_actor();
  v_existing public.friend_requests;
  v_id uuid;
begin
  if p_recipient_id is null or p_recipient_id = v_actor then
    raise exception 'invalid_recipient' using errcode = 'P0001';
  end if;
  perform private.social_pair_lock(v_actor, p_recipient_id);
  if not exists (select 1 from public.profiles where id = p_recipient_id and username is not null) then
    raise exception 'recipient_unavailable' using errcode = 'P0001';
  end if;
  if private.social_are_friends(v_actor, p_recipient_id) then
    return pg_catalog.jsonb_build_object('status', 'already_friends');
  end if;
  select * into v_existing from public.friend_requests
    where user_low = least(v_actor, p_recipient_id) and user_high = greatest(v_actor, p_recipient_id)
      and status = 'pending';
  if found then
    if v_existing.requester_id = v_actor then
      return pg_catalog.jsonb_build_object('status', 'pending', 'id', v_existing.id);
    end if;
    return pg_catalog.jsonb_build_object('status', 'request_received');
  end if;
  if exists (select 1 from public.friend_requests
      where requester_id = v_actor and recipient_id = p_recipient_id
        and status in ('declined', 'cancelled') and resolved_at > now() - interval '24 hours') then
    raise exception 'request_cooldown' using errcode = 'P0001';
  end if;
  perform private.social_charge(v_actor, 'friend_request_day', '', pg_catalog.date_trunc('day', now() at time zone 'utc') at time zone 'utc', 20);
  insert into public.friend_requests(requester_id, recipient_id) values (v_actor, p_recipient_id)
    returning id into v_id;
  return pg_catalog.jsonb_build_object('status', 'pending', 'id', v_id);
end;
$$;

create function private.accept_friend_request(p_request_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_actor uuid := private.social_actor(); v_request public.friend_requests;
begin
  select * into v_request from public.friend_requests where id = p_request_id and recipient_id = v_actor;
  if not found then raise exception 'request_not_found' using errcode = 'P0001'; end if;
  perform private.social_pair_lock(v_request.requester_id, v_actor);
  select * into v_request from public.friend_requests where id = p_request_id and recipient_id = v_actor for update;
  if v_request.status = 'accepted' and private.social_are_friends(v_request.requester_id, v_actor) then
    return pg_catalog.jsonb_build_object('status', 'accepted');
  end if;
  if v_request.status <> 'pending' then raise exception 'request_conflict' using errcode = 'P0001'; end if;
  insert into public.friendships(user_low, user_high)
    values (least(v_request.requester_id, v_actor), greatest(v_request.requester_id, v_actor))
    on conflict do nothing;
  update public.friend_requests set status = 'accepted', resolved_at = now() where id = p_request_id;
  return pg_catalog.jsonb_build_object('status', 'accepted');
end;
$$;

create function private.decide_friend_request(p_request_id uuid, p_decision text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_actor uuid := private.social_actor(); v_request public.friend_requests;
begin
  if p_decision not in ('declined', 'cancelled') then raise exception 'invalid_decision' using errcode = 'P0001'; end if;
  select * into v_request from public.friend_requests where id = p_request_id
    and (case when p_decision = 'declined' then recipient_id else requester_id end) = v_actor;
  if not found then raise exception 'request_not_found' using errcode = 'P0001'; end if;
  perform private.social_pair_lock(v_request.requester_id, v_request.recipient_id);
  select * into v_request from public.friend_requests where id = p_request_id for update;
  if v_request.status = p_decision then return pg_catalog.jsonb_build_object('status', p_decision); end if;
  if v_request.status <> 'pending' then raise exception 'request_conflict' using errcode = 'P0001'; end if;
  update public.friend_requests set status = p_decision, resolved_at = now() where id = p_request_id;
  return pg_catalog.jsonb_build_object('status', p_decision);
end;
$$;

create function private.remove_friend(p_other_user_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_actor uuid := private.social_actor();
begin
  if p_other_user_id is null or p_other_user_id = v_actor then
    raise exception 'invalid_friend' using errcode = 'P0001';
  end if;
  perform private.social_pair_lock(v_actor, p_other_user_id);
  delete from public.friendships where user_low = least(v_actor, p_other_user_id)
    and user_high = greatest(v_actor, p_other_user_id);
  update public.game_invitations set status = 'cancelled', resolved_at = now()
    where status = 'pending' and ((inviter_id = v_actor and invitee_id = p_other_user_id)
      or (inviter_id = p_other_user_id and invitee_id = v_actor));
  return pg_catalog.jsonb_build_object('status', 'removed');
end;
$$;

create function private.get_my_game_invitations() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_actor uuid := private.social_actor(); v_room_id uuid; v_items jsonb;
begin
  for v_room_id in select distinct room_id from public.game_invitations
    where inviter_id = v_actor or invitee_id = v_actor order by room_id loop
    perform private.social_room_lock(v_room_id);
    perform private.social_expire_room_invitations(v_room_id);
  end loop;
  v_items := coalesce((
    select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'id', i.id, 'room_id', i.room_id, 'room_code', r.code,
      'inviter_id', i.inviter_id, 'invitee_id', i.invitee_id,
      'other_username', p.username, 'status', i.status,
      'created_at', i.created_at, 'expires_at', i.expires_at, 'resolved_at', i.resolved_at
    ) order by i.created_at desc, i.id)
    from public.game_invitations i
    join public.rooms r on r.id = i.room_id
    left join public.profiles p on p.id = case when i.inviter_id = v_actor then i.invitee_id else i.inviter_id end
    where (i.inviter_id = v_actor or i.invitee_id = v_actor)
      and (i.status = 'pending' or i.created_at > now() - interval '30 days')
  ), '[]'::jsonb);
  return pg_catalog.jsonb_build_object(
    'invitations', v_items,
    'counts', pg_catalog.jsonb_build_object(
      'received_pending', (select count(*) from pg_catalog.jsonb_array_elements(v_items) item
        where item ->> 'invitee_id' = v_actor::text and item ->> 'status' = 'pending'),
      'sent_pending', (select count(*) from pg_catalog.jsonb_array_elements(v_items) item
        where item ->> 'inviter_id' = v_actor::text and item ->> 'status' = 'pending')
    )
  );
end;
$$;

create function private.list_invitable_friends(p_room_id uuid)
returns table(user_id uuid, username text)
language plpgsql security definer set search_path = '' as $$
declare v_actor uuid := private.social_actor(); v_room public.rooms;
begin
  v_room := private.social_room_lock(p_room_id);
  if v_room.status <> 'lobby' or not private.social_human_seated(p_room_id, v_actor)
     or not private.social_room_has_empty_seat(p_room_id) then
    raise exception 'room_unavailable' using errcode = 'P0001';
  end if;
  return query
    select p.id, p.username from public.friendships f
    join public.profiles p on p.id = case when f.user_low = v_actor then f.user_high else f.user_low end
    where (f.user_low = v_actor or f.user_high = v_actor) and p.username is not null
      and not private.social_human_seated(p_room_id, p.id)
    order by pg_catalog.lower(p.username), p.id;
end;
$$;

create function private.send_game_invitation(p_room_id uuid, p_invitee_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_actor uuid := private.social_actor(); v_room public.rooms; v_existing public.game_invitations; v_id uuid;
begin
  if p_invitee_id is null or p_invitee_id = v_actor then
    raise exception 'invalid_invitee' using errcode = 'P0001';
  end if;
  v_room := private.social_room_lock(p_room_id);
  if v_room.status <> 'lobby' or not private.social_human_seated(p_room_id, v_actor)
     or not private.social_room_has_empty_seat(p_room_id)
     or private.social_human_seated(p_room_id, p_invitee_id) then
    raise exception 'room_unavailable' using errcode = 'P0001';
  end if;
  perform private.social_pair_lock(v_actor, p_invitee_id);
  if not private.social_are_friends(v_actor, p_invitee_id) then
    raise exception 'not_friends' using errcode = 'P0001';
  end if;
  perform private.social_expire_room_invitations(p_room_id);
  select * into v_existing from public.game_invitations
    where room_id = p_room_id and invitee_id = p_invitee_id and status = 'pending';
  if found then
    if v_existing.inviter_id = v_actor then
      return pg_catalog.jsonb_build_object('status', 'pending', 'id', v_existing.id);
    end if;
    return pg_catalog.jsonb_build_object('status', 'already_invited');
  end if;
  if exists (select 1 from public.game_invitations where room_id = p_room_id
      and inviter_id = v_actor and invitee_id = p_invitee_id
      and created_at > now() - interval '5 minutes') then
    raise sqlstate 'PT429' using message = 'rate_limited';
  end if;
  perform private.social_charge(v_actor, 'invitation_day', '', pg_catalog.date_trunc('day', now() at time zone 'utc') at time zone 'utc', 20);
  insert into public.game_invitations(room_id, inviter_id, invitee_id)
    values (p_room_id, v_actor, p_invitee_id) returning id into v_id;
  return pg_catalog.jsonb_build_object('status', 'pending', 'id', v_id);
end;
$$;

create function private.resolve_game_invitation(p_invitation_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_actor uuid := private.social_actor(); v_invitation public.game_invitations;
begin
  select * into v_invitation from public.game_invitations
    where id = p_invitation_id and invitee_id = v_actor;
  if not found then raise exception 'invitation_not_found' using errcode = 'P0001'; end if;
  perform private.social_room_lock(v_invitation.room_id);
  perform private.social_expire_room_invitations(v_invitation.room_id);
  select * into v_invitation from public.game_invitations
    where id = p_invitation_id and invitee_id = v_actor for update;
  if not found then raise exception 'invitation_not_found' using errcode = 'P0001'; end if;
  if v_invitation.status <> 'pending' then
    return pg_catalog.jsonb_build_object('state', v_invitation.status);
  end if;
  return pg_catalog.jsonb_build_object('state', 'joinable', 'room_id', v_invitation.room_id);
end;
$$;

create function private.accept_game_invitation(p_invitation_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_actor uuid := private.social_actor(); v_invitation public.game_invitations;
begin
  select * into v_invitation from public.game_invitations
    where id = p_invitation_id and invitee_id = v_actor;
  if not found then raise exception 'invitation_not_found' using errcode = 'P0001'; end if;
  perform private.social_room_lock(v_invitation.room_id);
  perform private.social_expire_room_invitations(v_invitation.room_id);
  select * into v_invitation from public.game_invitations
    where id = p_invitation_id and invitee_id = v_actor for update;
  if not found then raise exception 'invitation_not_found' using errcode = 'P0001'; end if;
  if v_invitation.status = 'accepted' then return pg_catalog.jsonb_build_object('status', 'accepted'); end if;
  if v_invitation.status <> 'pending' then raise exception 'invitation_conflict' using errcode = 'P0001'; end if;
  if not private.social_human_seated(v_invitation.room_id, v_actor) then
    raise exception 'seat_required' using errcode = 'P0001';
  end if;
  update public.game_invitations set status = 'accepted', resolved_at = now() where id = p_invitation_id;
  return pg_catalog.jsonb_build_object('status', 'accepted');
end;
$$;

create function private.decide_game_invitation(p_invitation_id uuid, p_decision text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_actor uuid := private.social_actor(); v_invitation public.game_invitations;
begin
  if p_decision not in ('declined', 'cancelled') then raise exception 'invalid_decision' using errcode = 'P0001'; end if;
  select * into v_invitation from public.game_invitations where id = p_invitation_id
    and (case when p_decision = 'declined' then invitee_id else inviter_id end) = v_actor;
  if not found then raise exception 'invitation_not_found' using errcode = 'P0001'; end if;
  perform private.social_room_lock(v_invitation.room_id);
  perform private.social_expire_room_invitations(v_invitation.room_id);
  select * into v_invitation from public.game_invitations where id = p_invitation_id for update;
  if v_invitation.status = p_decision then return pg_catalog.jsonb_build_object('status', p_decision); end if;
  if v_invitation.status <> 'pending' then raise exception 'invitation_conflict' using errcode = 'P0001'; end if;
  update public.game_invitations set status = p_decision, resolved_at = now() where id = p_invitation_id;
  return pg_catalog.jsonb_build_object('status', p_decision);
end;
$$;

-- PostgREST sees only these SECURITY INVOKER wrappers. Internal helpers stay
-- inaccessible; each exported definer checks auth.uid() and its own permissions.
create function public.search_players_by_username(p_prefix text)
returns table(user_id uuid, username text) language sql security invoker set search_path = '' as $$
  select * from private.search_players_by_username(p_prefix);
$$;
create function public.get_my_social_snapshot() returns jsonb
language sql security invoker set search_path = '' as $$
  select private.get_my_social_snapshot();
$$;
create function public.send_friend_request(p_recipient_id uuid) returns jsonb
language sql security invoker set search_path = '' as $$
  select private.send_friend_request(p_recipient_id);
$$;
create function public.accept_friend_request(p_request_id uuid) returns jsonb
language sql security invoker set search_path = '' as $$
  select private.accept_friend_request(p_request_id);
$$;
create function public.decline_friend_request(p_request_id uuid) returns jsonb
language sql security invoker set search_path = '' as $$
  select private.decide_friend_request(p_request_id, 'declined');
$$;
create function public.cancel_friend_request(p_request_id uuid) returns jsonb
language sql security invoker set search_path = '' as $$
  select private.decide_friend_request(p_request_id, 'cancelled');
$$;
create function public.remove_friend(p_other_user_id uuid) returns jsonb
language sql security invoker set search_path = '' as $$
  select private.remove_friend(p_other_user_id);
$$;
create function public.get_my_game_invitations() returns jsonb
language sql security invoker set search_path = '' as $$
  select private.get_my_game_invitations();
$$;
create function public.list_invitable_friends(p_room_id uuid)
returns table(user_id uuid, username text) language sql security invoker set search_path = '' as $$
  select * from private.list_invitable_friends(p_room_id);
$$;
create function public.send_game_invitation(p_room_id uuid, p_invitee_id uuid) returns jsonb
language sql security invoker set search_path = '' as $$
  select private.send_game_invitation(p_room_id, p_invitee_id);
$$;
create function public.resolve_game_invitation(p_invitation_id uuid) returns jsonb
language sql security invoker set search_path = '' as $$
  select private.resolve_game_invitation(p_invitation_id);
$$;
create function public.accept_game_invitation(p_invitation_id uuid) returns jsonb
language sql security invoker set search_path = '' as $$
  select private.accept_game_invitation(p_invitation_id);
$$;
create function public.decline_game_invitation(p_invitation_id uuid) returns jsonb
language sql security invoker set search_path = '' as $$
  select private.decide_game_invitation(p_invitation_id, 'declined');
$$;
create function public.cancel_game_invitation(p_invitation_id uuid) returns jsonb
language sql security invoker set search_path = '' as $$
  select private.decide_game_invitation(p_invitation_id, 'cancelled');
$$;

revoke all on all functions in schema private from public, anon, authenticated;
grant execute on function
  private.search_players_by_username(text), private.get_my_social_snapshot(),
  private.send_friend_request(uuid), private.accept_friend_request(uuid),
  private.decide_friend_request(uuid,text), private.remove_friend(uuid),
  private.get_my_game_invitations(), private.list_invitable_friends(uuid),
  private.send_game_invitation(uuid,uuid), private.resolve_game_invitation(uuid),
  private.accept_game_invitation(uuid), private.decide_game_invitation(uuid,text)
  to authenticated;

revoke all on function
  public.search_players_by_username(text), public.get_my_social_snapshot(),
  public.send_friend_request(uuid), public.accept_friend_request(uuid),
  public.decline_friend_request(uuid), public.cancel_friend_request(uuid),
  public.remove_friend(uuid), public.get_my_game_invitations(),
  public.list_invitable_friends(uuid), public.send_game_invitation(uuid,uuid),
  public.resolve_game_invitation(uuid), public.accept_game_invitation(uuid),
  public.decline_game_invitation(uuid), public.cancel_game_invitation(uuid)
  from public, anon;
grant execute on function
  public.search_players_by_username(text), public.get_my_social_snapshot(),
  public.send_friend_request(uuid), public.accept_friend_request(uuid),
  public.decline_friend_request(uuid), public.cancel_friend_request(uuid),
  public.remove_friend(uuid), public.get_my_game_invitations(),
  public.list_invitable_friends(uuid), public.send_game_invitation(uuid,uuid),
  public.resolve_game_invitation(uuid), public.accept_game_invitation(uuid),
  public.decline_game_invitation(uuid), public.cancel_game_invitation(uuid)
  to authenticated;

-- Anonymous signup still calls this exact-match probe before creating Auth.
-- Bound its input without changing the answer for valid signup usernames.
create or replace function public.is_username_taken(p_username text)
returns boolean language sql security definer set search_path = '' as $$
  select case when p_username is null or pg_catalog.char_length(p_username) > 40 then false
    else exists (select 1 from public.profiles where username = pg_catalog.btrim(p_username)) end;
$$;
revoke all on function public.is_username_taken(text) from public;
grant execute on function public.is_username_taken(text) to anon, authenticated, service_role;

notify pgrst, 'reload schema';
