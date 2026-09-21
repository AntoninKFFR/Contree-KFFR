import { afterEach, describe, expect, it, vi } from "vitest";
import {
  fetchSocialSnapshot,
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
