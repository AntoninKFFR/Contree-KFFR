import { afterEach, describe, expect, it, vi } from "vitest";
import {
  fetchSocialSnapshot,
  gameInvitationRoomPath,
  parseGameInvitationMutationResult,
  parseGameInvitationResolution,
  parseGameInvitationsSnapshot,
  parseInvitableFriends,
  parseSocialMutationResult,
  parseSocialSearchResults,
  parseSocialSnapshot,
  searchSocialPlayers,
  SocialApiError,
} from "@/lib/socialApi";

const token = { access_token: "user-jwt" };

afterEach(() => vi.unstubAllGlobals());

describe("social API client", () => {
  it("parses and normalizes the bounded social payloads", () => {
    expect(parseSocialSnapshot({
      friends: [{ user_id: "friend-1", username: "Alice", created_at: "2026-09-21" }],
      received: [{ id: "request-1", user_id: "friend-2", username: "Bob", created_at: "2026-09-21" }],
      sent: [],
      counts: { friends: 1, received: 1, sent: 0 },
    })).toEqual({
      friends: [{ userId: "friend-1", username: "Alice", createdAt: "2026-09-21" }],
      received: [{ id: "request-1", userId: "friend-2", username: "Bob", createdAt: "2026-09-21" }],
      sent: [],
      counts: { friends: 1, received: 1, sent: 0 },
    });
    expect(parseSocialSearchResults([{ user_id: "friend-1", username: "Alice" }])).toEqual([{ userId: "friend-1", username: "Alice" }]);
    expect(parseSocialMutationResult({ status: "pending", id: "request-1" })).toEqual({ status: "pending", id: "request-1" });
  });

  it("rejects oversized searches and inconsistent snapshots", () => {
    expect(() => parseSocialSearchResults(Array.from({ length: 11 }, (_, index) => ({ user_id: String(index), username: "A" })))).toThrow("Invalid social search results");
    expect(() => parseSocialSnapshot({ friends: [], received: [], sent: [], counts: { friends: 1, received: 0, sent: 0 } })).toThrow("Inconsistent");
  });

  it("normalizes game invitations without leaking third-party details", () => {
    expect(parseInvitableFriends([{ user_id: "friend-1", username: "Alice" }])).toEqual([
      { userId: "friend-1", username: "Alice" },
    ]);
    expect(parseGameInvitationMutationResult({
      status: "already_invited",
      id: "hidden-invitation",
      inviter_id: "hidden-inviter",
    })).toEqual({ status: "already_invited" });
    expect(parseGameInvitationResolution({ state: "joinable", room_id: "room-1" })).toEqual({
      state: "joinable",
      roomId: "room-1",
    });
    expect(gameInvitationRoomPath("room-1", "invitation-1")).toBe("/multiplayer/room-1?invitation=invitation-1");
  });

  it("parses received and sent invitation counts from the RPC payload", () => {
    expect(parseGameInvitationsSnapshot({
      invitations: [{
        id: "invitation-1",
        room_id: "room-1",
        room_code: "ABCDEF",
        inviter_id: "user-a",
        invitee_id: "user-b",
        other_username: "Alice",
        status: "pending",
        created_at: "2026-09-21T10:00:00Z",
        expires_at: "2026-09-21T10:30:00Z",
        resolved_at: null,
      }],
      counts: { received_pending: 1, sent_pending: 0 },
    })).toMatchObject({
      invitations: [{ roomId: "room-1", roomCode: "ABCDEF", otherUsername: "Alice" }],
      counts: { receivedPending: 1, sentPending: 0 },
    });
  });

  it("sends the bearer token and maps a successful snapshot", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      data: { friends: [], received: [], sent: [], counts: { friends: 0, received: 0, sent: 0 } },
    }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(fetchSocialSnapshot(token)).resolves.toMatchObject({ counts: { friends: 0 } });
    expect(fetchMock).toHaveBeenCalledWith("/api/social", expect.objectContaining({
      headers: expect.objectContaining({ Authorization: "Bearer user-jwt" }),
    }));
  });

  it.each([[409, "request_conflict"], [429, "rate_limited"]] as const)("preserves HTTP %s and its error code", async (status, code) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: "Refusé", code }), { status })));
    await expect(searchSocialPlayers("Ali", token)).rejects.toEqual(expect.objectContaining<Partial<SocialApiError>>({ status, code }));
  });
});
