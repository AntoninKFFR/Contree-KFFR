-- Publish only the columns needed to invalidate authenticated social snapshots.
-- Existing participant SELECT policies remain the access boundary; clients gain no writes.
do $$ begin
  alter publication supabase_realtime add table public.friend_requests (
    id, requester_id, recipient_id, status, created_at, resolved_at
  );
exception when duplicate_object then null; when undefined_object then null;
end $$;

do $$ begin
  alter publication supabase_realtime add table public.game_invitations (
    id, room_id, inviter_id, invitee_id, status, created_at, expires_at, resolved_at
  );
exception when duplicate_object then null; when undefined_object then null;
end $$;
