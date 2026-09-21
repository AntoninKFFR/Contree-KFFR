import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync("supabase/migrations/20260921000000_social_schema_security.sql", "utf8");
const dialog = readFileSync("components/multiplayer/GameInvitationDialog.tsx", "utf8");

describe("game invitation RPC security contract", () => {
  it("requires a seated human, lobby status and a free seat", () => {
    expect(migration).toContain("v_room.status <> 'lobby' or not private.social_human_seated(p_room_id, v_actor)");
    expect(migration).toContain("or not private.social_room_has_empty_seat(p_room_id)");
  });

  it("requires friendship and hides a third party invitation", () => {
    expect(migration).toContain("if not private.social_are_friends(v_actor, p_invitee_id)");
    expect(migration).toContain("jsonb_build_object('status', 'already_invited')");
    expect(migration).not.toContain("jsonb_build_object('status', 'already_invited', 'id'");
  });

  it("expires started or full rooms but preserves an already seated invitee", () => {
    expect(migration).toContain("not private.social_human_seated(i.room_id, i.invitee_id)");
    expect(migration).toContain("r.status = 'lobby'");
    expect(migration).toContain("not private.social_room_has_empty_seat(i.room_id)");
  });

  it("accepts only after the invitee has a real human seat", () => {
    expect(migration).toContain("if not private.social_human_seated(v_invitation.room_id, v_actor) then");
    expect(migration).toContain("raise exception 'seat_required'");
  });

  it("prevents duplicate invitation clicks and exposes safe result labels", () => {
    expect(dialog).toContain("inFlight.current.has(friend.userId)");
    expect(dialog).toContain("Invitation envoyée");
    expect(dialog).toContain("Déjà invité");
    expect(dialog).not.toContain("inviterId");
  });
});
