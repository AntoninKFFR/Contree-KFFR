import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  createClient: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@supabase/supabase-js", () => ({
  createClient: mocks.createClient,
}));
vi.mock("@/lib/server/supabaseAdmin", () => ({
  authenticatedUserId: mocks.auth,
}));

import { GET as getSnapshot } from "@/app/api/social/route";
import { GET as searchPlayers } from "@/app/api/social/search/route";
import { POST as sendRequest } from "@/app/api/social/friend-requests/route";
import { GET as getInvitations } from "@/app/api/social/invitations/route";
import { POST as acceptInvitation } from "@/app/api/social/invitations/[id]/accept/route";
import { POST as cancelInvitation } from "@/app/api/social/invitations/[id]/cancel/route";
import { POST as declineInvitation } from "@/app/api/social/invitations/[id]/decline/route";
import { POST as resolveInvitation } from "@/app/api/social/invitations/[id]/resolve/route";
import { GET as listInvitable } from "@/app/api/social/rooms/[roomId]/invitable-friends/route";
import { POST as sendInvitation } from "@/app/api/social/rooms/[roomId]/invitations/route";
import { mapSocialRpcError, parseFriendRequestBody, parseGameInvitationBody, parseSocialSearchPrefix } from "@/lib/server/socialService";

const userId = "11111111-1111-4111-8111-111111111111";
const recipientId = "22222222-2222-4222-8222-222222222222";
const roomId = "33333333-3333-4333-8333-333333333333";
const invitationId = "44444444-4444-4444-8444-444444444444";
const authRequest = (url: string, init: RequestInit = {}) => new Request(url, {
  ...init,
  headers: { Authorization: "Bearer user-jwt", "Content-Type": "application/json", ...init.headers },
});

beforeEach(() => {
  vi.clearAllMocks();
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "publishable-test-key";
  mocks.auth.mockResolvedValue(userId);
  mocks.createClient.mockReturnValue({ rpc: mocks.rpc });
});

describe("social API routes", () => {
  it("returns 401 when the Bearer session is missing", async () => {
    mocks.auth.mockRejectedValue(new Error("Authentication required."));
    const response = await getSnapshot(new Request("http://localhost/api/social"));
    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({ code: "authentication_required" });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("rejects a search shorter than three characters", async () => {
    const response = await searchPlayers(new Request("http://localhost/api/social/search?q=Al", {
      headers: { Authorization: "Bearer user-jwt" },
    }));
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ code: "invalid_prefix" });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("returns a normalized snapshot through the user JWT client", async () => {
    mocks.rpc.mockResolvedValue({
      data: { friends: [], received: [], sent: [], counts: { friends: 0, received: 0, sent: 0 } },
      error: null,
    });
    const response = await getSnapshot(new Request("http://localhost/api/social", {
      headers: { Authorization: "Bearer user-jwt" },
    }));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ data: { counts: { friends: 0, received: 0, sent: 0 } } });
    expect(mocks.createClient).toHaveBeenCalledWith("https://example.supabase.co", "publishable-test-key", expect.objectContaining({
      global: { headers: { Authorization: "Bearer user-jwt" } },
    }));
    expect(mocks.rpc).toHaveBeenCalledWith("get_my_social_snapshot", undefined);
  });

  it("strictly parses and sends a friend request without an actor id", async () => {
    mocks.rpc.mockResolvedValue({ data: { status: "pending", id: "request-1" }, error: null });
    const response = await sendRequest(new Request("http://localhost/api/social/friend-requests", {
      method: "POST",
      headers: { Authorization: "Bearer user-jwt", "Content-Type": "application/json" },
      body: JSON.stringify({ recipientId }),
    }));
    expect(response.status).toBe(200);
    expect(mocks.rpc).toHaveBeenCalledWith("send_friend_request", { p_recipient_id: recipientId });
    expect(() => parseFriendRequestBody({ recipientId, actor_user_id: userId })).toThrow("Requête invalide");
  });

  it("maps RPC conflicts and quotas to 409 and 429", () => {
    expect(mapSocialRpcError({ code: "P0001", message: "request_conflict" })).toMatchObject({ status: 409, code: "request_conflict" });
    expect(mapSocialRpcError({ code: "PT429", message: "rate_limited" })).toMatchObject({ status: 429, code: "rate_limited" });
    expect(mapSocialRpcError({ code: "42501", message: "permission denied" })).toMatchObject({ status: 403, code: "access_denied" });
  });

  it("keeps strict query and body parsing", () => {
    expect(parseSocialSearchPrefix("  Alice ")).toBe("Alice");
    expect(() => parseSocialSearchPrefix("Al")).toThrow("3 et 40");
    expect(() => parseFriendRequestBody({ recipientId: "not-a-uuid" })).toThrow("invalide");
    expect(parseGameInvitationBody({ inviteeId: recipientId })).toEqual({ inviteeId: recipientId });
    expect(() => parseGameInvitationBody({ inviteeId: recipientId, inviterId: userId })).toThrow("Requête invalide");
  });

  it("lists invitable friends and sends invitations through the user JWT", async () => {
    mocks.rpc
      .mockResolvedValueOnce({ data: [{ user_id: recipientId, username: "Alice" }], error: null })
      .mockResolvedValueOnce({ data: { status: "pending", id: invitationId }, error: null });
    const context = { params: Promise.resolve({ roomId }) };
    const listResponse = await listInvitable(authRequest(`http://localhost/api/social/rooms/${roomId}/invitable-friends`), context);
    expect(listResponse.status).toBe(200);
    expect(mocks.rpc).toHaveBeenNthCalledWith(1, "list_invitable_friends", { p_room_id: roomId });

    const sendResponse = await sendInvitation(authRequest(`http://localhost/api/social/rooms/${roomId}/invitations`, {
      method: "POST",
      body: JSON.stringify({ inviteeId: recipientId }),
    }), context);
    expect(sendResponse.status).toBe(200);
    expect(mocks.rpc).toHaveBeenNthCalledWith(2, "send_game_invitation", {
      p_room_id: roomId,
      p_invitee_id: recipientId,
    });
  });

  it("returns already_invited without leaking another inviter or invitation id", async () => {
    mocks.rpc.mockResolvedValue({
      data: { status: "already_invited", id: "secret-id", inviter_id: "secret-user" },
      error: null,
    });
    const response = await sendInvitation(authRequest(`http://localhost/api/social/rooms/${roomId}/invitations`, {
      method: "POST",
      body: JSON.stringify({ inviteeId: recipientId }),
    }), { params: Promise.resolve({ roomId }) });
    await expect(response.json()).resolves.toEqual({ data: { status: "already_invited" } });
  });

  it("gets, resolves, declines and cancels game invitations", async () => {
    mocks.rpc
      .mockResolvedValueOnce({ data: { invitations: [], counts: { received_pending: 0, sent_pending: 0 } }, error: null })
      .mockResolvedValueOnce({ data: { state: "joinable", room_id: roomId }, error: null })
      .mockResolvedValueOnce({ data: { status: "accepted" }, error: null })
      .mockResolvedValueOnce({ data: { status: "declined" }, error: null })
      .mockResolvedValueOnce({ data: { status: "cancelled" }, error: null });
    const invitationContext = { params: Promise.resolve({ id: invitationId }) };
    expect((await getInvitations(authRequest("http://localhost/api/social/invitations"))).status).toBe(200);
    expect((await resolveInvitation(authRequest(`http://localhost/api/social/invitations/${invitationId}/resolve`, { method: "POST" }), invitationContext)).status).toBe(200);
    expect((await acceptInvitation(authRequest(`http://localhost/api/social/invitations/${invitationId}/accept`, { method: "POST" }), invitationContext)).status).toBe(200);
    expect((await declineInvitation(authRequest(`http://localhost/api/social/invitations/${invitationId}/decline`, { method: "POST" }), invitationContext)).status).toBe(200);
    expect((await cancelInvitation(authRequest(`http://localhost/api/social/invitations/${invitationId}/cancel`, { method: "POST" }), invitationContext)).status).toBe(200);
    expect(mocks.rpc.mock.calls.map(([name]) => name)).toEqual([
      "get_my_game_invitations",
      "resolve_game_invitation",
      "accept_game_invitation",
      "decline_game_invitation",
      "cancel_game_invitation",
    ]);
  });

  it("maps unavailable rooms, non-friends and seat requirements without weakening the RPC", () => {
    expect(mapSocialRpcError({ code: "P0001", message: "room_unavailable" })).toMatchObject({ status: 409, code: "room_unavailable" });
    expect(mapSocialRpcError({ code: "P0001", message: "not_friends" })).toMatchObject({ status: 403, code: "not_friends" });
    expect(mapSocialRpcError({ code: "P0001", message: "seat_required" })).toMatchObject({ status: 409, code: "seat_required" });
  });
});
