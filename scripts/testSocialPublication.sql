do $$
declare friend_columns text[]; invitation_columns text[]; duo_columns text[];
begin
  select array_agg(cols.column_name::text order by cols.column_name::text) into friend_columns
    from pg_publication_tables p cross join lateral unnest(p.attnames) as cols(column_name)
   where p.pubname = 'supabase_realtime' and p.schemaname = 'public' and p.tablename = 'friend_requests';
  if friend_columns is distinct from array['created_at','id','recipient_id','requester_id','resolved_at','status'] then
    raise exception 'friend_requests Realtime publication columns incorrect: %', friend_columns;
  end if;

  select array_agg(cols.column_name::text order by cols.column_name::text) into invitation_columns
    from pg_publication_tables p cross join lateral unnest(p.attnames) as cols(column_name)
   where p.pubname = 'supabase_realtime' and p.schemaname = 'public' and p.tablename = 'game_invitations';
  if invitation_columns is distinct from array['created_at','expires_at','id','invitee_id','inviter_id','resolved_at','room_id','status'] then
    raise exception 'game_invitations Realtime publication columns incorrect: %', invitation_columns;
  end if;

  if exists (select 1 from pg_publication_tables
              where pubname = 'supabase_realtime' and schemaname = 'public'
                and tablename in ('profiles', 'social_rate_limits', 'room_game_states')) then
    raise exception 'Sensitive table included in Realtime publication';
  end if;
  select array_agg(cols.column_name::text order by cols.column_name::text) into duo_columns
    from pg_publication_tables p cross join lateral unnest(p.attnames) as cols(column_name)
    where p.pubname = 'supabase_realtime' and p.schemaname = 'public' and p.tablename = 'training_duo_invitations';
  if duo_columns is distinct from array['created_at','expires_at','id','invitee_id','inviter_id','resolved_at','status'] then
    raise exception 'training_duo_invitations Realtime publication columns incorrect: %', duo_columns;
  end if;
end $$;
