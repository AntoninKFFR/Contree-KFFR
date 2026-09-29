-- Dedicated social invitations; no Duo secrets or session codes are exposed.
create table public.training_duo_invitations (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.training_duo_sessions(id) on delete cascade,
  inviter_id uuid not null references auth.users(id) on delete cascade,
  invitee_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','accepted','declined','expired','cancelled')),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '30 minutes'),
  resolved_at timestamptz,
  check (inviter_id <> invitee_id),
  check ((status = 'pending') = (resolved_at is null)),
  check (expires_at > created_at and expires_at <= created_at + interval '30 minutes')
);
create unique index training_duo_invitations_pending on public.training_duo_invitations(session_id,invitee_id) where status = 'pending';
create index training_duo_invitations_recipient on public.training_duo_invitations(invitee_id,status,created_at desc);
create index training_duo_invitations_sender on public.training_duo_invitations(inviter_id);
alter table public.training_duo_invitations enable row level security;
revoke all on public.training_duo_invitations from public,anon,authenticated;
grant all on public.training_duo_invitations to service_role;
grant select (id,inviter_id,invitee_id,status,created_at,expires_at,resolved_at) on public.training_duo_invitations to authenticated;
create policy training_duo_invitations_participant_read on public.training_duo_invitations
  for select to authenticated using ((select auth.uid()) in (inviter_id,invitee_id));
alter publication supabase_realtime add table public.training_duo_invitations
  (id,inviter_id,invitee_id,status,created_at,expires_at,resolved_at);

-- Both join paths share the existing membership contract and session row lock.
create function public.training_duo_join_session(
  p_actor uuid, p_display_name text, p_session_id uuid
) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_session public.training_duo_sessions%rowtype;
declare v_existing public.training_duo_participants%rowtype;
begin
  select * into v_session from public.training_duo_sessions where id = p_session_id for update;
  if not found then raise exception 'duo_session_not_found' using errcode = 'P0001'; end if;
  if v_session.status = 'lobby' and v_session.updated_at <= clock_timestamp() - interval '30 minutes' then
    update public.training_duo_sessions set status = 'cancelled', question_phase = null,
      finished_at = clock_timestamp(), updated_at = clock_timestamp(),
      cancel_reason = 'expired', state_version = state_version + 1 where id = v_session.id;
    return null;
  end if;
  if v_session.status <> 'lobby' then raise exception 'duo_session_not_found' using errcode = 'P0001'; end if;
  select * into v_existing from public.training_duo_participants
    where session_id = v_session.id and user_id = p_actor;
  if found and v_existing.left_at is null then return v_session.id; end if;
  if exists (select 1 from public.training_duo_participants
    where session_id = v_session.id and slot = 1 and left_at is null)
    or p_actor = v_session.host_user_id then
    raise exception 'duo_session_not_found' using errcode = 'P0001';
  end if;
  if v_existing.id is not null then
    update public.training_duo_participants set left_at = null, is_ready = false,
      ready_for_next = false, last_seen_at = clock_timestamp(), joined_at = clock_timestamp(),
      display_name = p_display_name where id = v_existing.id;
  else
    insert into public.training_duo_participants(session_id, user_id, slot, display_name, last_seen_at)
      values (v_session.id, p_actor, 1, p_display_name, clock_timestamp());
  end if;
  update public.training_duo_sessions set state_version = state_version + 1,
    updated_at = clock_timestamp() where id = v_session.id;
  return v_session.id;
end;
$$;


create or replace function public.training_duo_join(p_actor uuid,p_display_name text,p_code text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  select id into v_id from public.training_duo_sessions where code = p_code;
  if not found then raise exception 'duo_session_not_found' using errcode = 'P0001'; end if;
  return public.training_duo_join_session(p_actor,p_display_name,v_id);
end;
$$;

create function public.training_duo_expire_invitations(p_session_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_session public.training_duo_sessions%rowtype;
begin
  select * into v_session from public.training_duo_sessions where id = p_session_id for update;
  update public.training_duo_invitations i set status = 'expired',resolved_at = now()
    where i.session_id = p_session_id and i.status = 'pending' and (
      i.expires_at <= now() or v_session.status <> 'lobby'
      or v_session.updated_at <= now() - interval '30 minutes'
      or not private.social_are_friends(i.inviter_id,i.invitee_id)
      or exists (select 1 from public.training_duo_participants p where p.session_id = p_session_id and p.slot = 1 and p.left_at is null));
end;
$$;

-- Joining by code also invalidates pending invitations immediately (Realtime signal).
create function public.training_duo_cancel_invitations_on_join() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.slot = 1 and new.left_at is null then
    update public.training_duo_invitations set status = 'cancelled',resolved_at = now()
      where session_id = new.session_id and status = 'pending';
  end if;
  return new;
end;
$$;
create trigger training_duo_invitations_partner_joined after insert or update of left_at
  on public.training_duo_participants for each row execute function public.training_duo_cancel_invitations_on_join();

create function public.training_duo_send_invitation(p_actor uuid,p_session_id uuid,p_invitee uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_session public.training_duo_sessions%rowtype; v_id uuid;
begin
  select * into v_session from public.training_duo_sessions where id = p_session_id for update;
  if not found or v_session.host_user_id <> p_actor or not exists (
    select 1 from public.training_duo_participants where session_id = p_session_id and user_id = p_actor and slot = 0 and left_at is null)
    then raise exception 'duo_session_not_found' using errcode = 'P0001'; end if;
  if v_session.status <> 'lobby' or v_session.updated_at <= now() - interval '30 minutes'
    or exists (select 1 from public.training_duo_participants where session_id = p_session_id and slot = 1 and left_at is null)
    then raise exception 'duo_invitation_unavailable' using errcode = 'P0001'; end if;
  -- Hold the friendship through commit; deletion cannot race authorization.
  perform 1 from public.friendships where user_low = least(p_actor,p_invitee) and user_high = greatest(p_actor,p_invitee) for share;
  if not found or p_actor = p_invitee then raise exception 'duo_not_friends' using errcode = 'P0001'; end if;
  perform public.training_duo_expire_invitations(p_session_id);
  select id into v_id from public.training_duo_invitations where session_id = p_session_id and invitee_id = p_invitee and status = 'pending';
  if found then return jsonb_build_object('id',v_id,'status','already_invited'); end if;
  insert into public.training_duo_invitations(session_id,inviter_id,invitee_id)
    values (p_session_id,p_actor,p_invitee) returning id into v_id;
  return jsonb_build_object('id',v_id,'status','pending');
end;
$$;

create function public.training_duo_list_invitations(p_actor uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_result jsonb;
begin
  for v_id in select distinct session_id from public.training_duo_invitations
    where invitee_id = p_actor and status = 'pending' order by session_id loop
    perform public.training_duo_expire_invitations(v_id);
  end loop;
  select coalesce(jsonb_agg(jsonb_build_object('id',i.id,'username',p.username,'level',s.level,
    'status',i.status,'createdAt',i.created_at,'expiresAt',i.expires_at) order by i.created_at desc),'[]'::jsonb)
    into v_result from public.training_duo_invitations i
    join public.training_duo_sessions s on s.id = i.session_id
    join public.profiles p on p.id = i.inviter_id
    where i.invitee_id = p_actor and i.status = 'pending';
  return v_result;
end;
$$;

create function public.training_duo_resolve_invitation(p_actor uuid,p_invitation_id uuid,p_decision text,p_display_name text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_inv public.training_duo_invitations%rowtype; v_session_id uuid;
begin
  if p_decision not in ('join','decline') then raise exception 'duo_invalid_request' using errcode = 'P0001'; end if;
  select * into v_inv from public.training_duo_invitations where id = p_invitation_id and invitee_id = p_actor;
  if not found then raise exception 'duo_invitation_unavailable' using errcode = 'P0001'; end if;
  -- All mutations acquire the session before the invitation to avoid lock inversion.
  perform public.training_duo_expire_invitations(v_inv.session_id);
  select * into v_inv from public.training_duo_invitations where id = p_invitation_id for update;
  if v_inv.status <> 'pending' then return jsonb_build_object('status','unavailable'); end if;
  perform 1 from public.friendships where user_low = least(v_inv.inviter_id,p_actor) and user_high = greatest(v_inv.inviter_id,p_actor) for share;
  if not found then
    update public.training_duo_invitations set status = 'cancelled',resolved_at = now() where id = p_invitation_id;
    return jsonb_build_object('status','unavailable');
  end if;
  if p_decision = 'decline' then
    update public.training_duo_invitations set status = 'declined',resolved_at = now() where id = p_invitation_id;
    return jsonb_build_object('status','declined');
  end if;
  if p_display_name is null or char_length(p_display_name) not between 1 and 40 then
    raise exception 'duo_invalid_request' using errcode = 'P0001'; end if;
  v_session_id := public.training_duo_join_session(p_actor,p_display_name,v_inv.session_id);
  if v_session_id is null then return jsonb_build_object('status','unavailable'); end if;
  update public.training_duo_invitations set status = 'accepted',resolved_at = now() where id = p_invitation_id;
  return jsonb_build_object('sessionId',v_session_id);
end;
$$;

revoke all on function public.training_duo_join_session(uuid,text,uuid),
  public.training_duo_expire_invitations(uuid),public.training_duo_cancel_invitations_on_join(),
  public.training_duo_send_invitation(uuid,uuid,uuid),public.training_duo_list_invitations(uuid),
  public.training_duo_resolve_invitation(uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.training_duo_join_session(uuid,text,uuid),
  public.training_duo_expire_invitations(uuid),public.training_duo_send_invitation(uuid,uuid,uuid),
  public.training_duo_list_invitations(uuid),public.training_duo_resolve_invitation(uuid,uuid,text,text) to service_role;
