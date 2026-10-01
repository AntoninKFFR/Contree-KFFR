import { afterEach, describe, expect, it, vi } from "vitest";
import { parseFriendProfile } from "@/lib/friendProfile";
import { fetchFriendProfile, parseSocialSnapshot } from "@/lib/socialApi";
export const friendId = "22222222-2222-4222-8222-222222222222";
export const basicProfile = { userId: friendId, username: "Benjamin", level: 1, equipped: { title: null, badge: null, frame: null },
  solo: { games: 0, wins: 0, losses: 0, winrate: 0 }, multiplayer: { games: 4, wins: 2, losses: 2, winrate: 50 }, rating: null };
afterEach(() => vi.unstubAllGlobals());
describe("strict minimal friend profile", () => {
  it("projects only authorized identity/stats/equipment fields", () => {
    expect(parseFriendProfile({ ...basicProfile, totalXp: 1234, items: ["secret"], history: [] })).toEqual(basicProfile);
  });
  it.each([
    { userId: "arbitrary" }, { username: " " }, { level: 0 }, { level: 1.5 }, { level: Number.MAX_SAFE_INTEGER+1 },
    { solo: { games: 2, wins: 2, losses: 1, winrate: 100 } },
    { solo: { games: 3, wins: 2, losses: 1, winrate: 66 } },
    { solo: { games: 0, wins: 0, losses: 0, winrate: 1 } },
    { solo: { games: 1, wins: -1, losses: 2, winrate: 0 } },
    { rating: { rating: 1147, rank: "wrong", position: 1 } },
    { rating: { rating: 1147, rank: "Pas mauvais IV", position: 0 } },
    { equipped: { title: null, badge: { key: "toString", slot: "badge", name: "Invalid", visualVariant: "crown" }, frame: null } },
    { equipped: { title: null, badge: { key: "title_taker", slot: "badge", name: "Invalid", visualVariant: "standard" }, frame: null } },
    { equipped: { title: null, badge: { key: "badge_crown", slot: "badge", name: "Invalid", visualVariant: "kffr" }, frame: null } },
    { equipped: { title: null, badge: [], frame: null } },
  ])("rejects malformed/inconsistent payload %j", (patch) => expect(() => parseFriendProfile({ ...basicProfile, ...patch })).toThrow());
  it("accepts catalog identity and matching current rating", () => {
    const result = parseFriendProfile({ ...basicProfile, rating: { rating: 1147, rank: "Pas mauvais IV", position: 2 },
      equipped: { ...basicProfile.equipped, badge: { key: "badge_crown", slot: "badge", name: "Couronne", visualVariant: "crown", unlockedAt: "private" } } });
    expect(result.equipped.badge).toEqual({ key: "badge_crown", slot: "badge", name: "Couronne", visualVariant: "crown" });
  });
  it("requires a positive level for friends without requiring it for requests", () => {
    const identity = { user_id: friendId, username: "Benjamin", created_at: "now" };
    const snapshot = { friends: [{ ...identity, level: 14 }], received: [{ ...identity, id: "request" }], sent: [], counts: { friends: 1, received: 1, sent: 0 } };
    expect(parseSocialSnapshot(snapshot).friends[0].level).toBe(14);
    expect(parseSocialSnapshot(snapshot).received[0]).not.toHaveProperty("level");
    for (const level of [undefined,0,-1,1.5,"14"]) expect(() => parseSocialSnapshot({ ...snapshot, friends:[{ ...identity,level }] })).toThrow();
  });
  it("validates UUID before fetch and verifies the returned friend", async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ data:basicProfile }),{status:200})); vi.stubGlobal("fetch",fetch);
    expect(() => fetchFriendProfile("invalid", { access_token:"jwt" })).toThrow(); expect(fetch).not.toHaveBeenCalled();
    await expect(fetchFriendProfile(friendId, { access_token:"jwt" })).resolves.toEqual(basicProfile);
    fetch.mockResolvedValue(new Response(JSON.stringify({ data:{ ...basicProfile,userId:"11111111-1111-4111-8111-111111111111" } }),{status:200}));
    await expect(fetchFriendProfile(friendId,{access_token:"jwt"})).rejects.toMatchObject({code:"invalid_response"});
  });
});
