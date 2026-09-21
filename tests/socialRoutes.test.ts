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
import { mapSocialRpcError, parseFriendRequestBody, parseSocialSearchPrefix } from "@/lib/server/socialService";

const userId = "11111111-1111-4111-8111-111111111111";
const recipientId = "22222222-2222-4222-8222-222222222222";

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
  });
});
