import { expect, it, vi } from "vitest";
import { createInitialGame, playableCardsForCurrentPlayer } from "@/engine/game";
import { createSeededRandom } from "@/engine/random";
import { createGameSettings } from "@/engine/rulesets/resolve";
import { buildCustomRuleset } from "@/engine/rulesets/custom";
import { toPlayerGameView } from "@/engine/views";
import { advanceSoloState, parseSoloIntent, SoloError } from "@/lib/server/soloGame";
import { createSoloApi } from "../apps/mobile/src/solo/api";
import { createSoloController, type SoloState } from "../apps/mobile/src/solo/controller";
import { applyGameAction } from "@/engine/actions";

vi.mock("server-only", () => ({}));
it("native transport completes real server-engine hands, rejects illegal cards and resumes the same authoritative version", async () => {
  const id = "14800000-0000-4000-8000-000000000001", nonce = "14800000-0000-4000-8000-000000000002";
  // A deliberately short ruleset is a server-side TEST fixture, not mobile rules.
  let server = createInitialGame(createSeededRandom(7), createGameSettings({ ruleset: buildCustomRuleset({ presetId: "contree-kffr", overrides: { game: { targetScore: 100 } } }) }));
  let version = 0, starts = 0, moves = 0;
  const reply = () => new Response(JSON.stringify({ data: { id, version, state: toPlayerGameView(server, 0) } }));
  const api = createSoloApi(async (url, init) => {
    expect(new Headers(init?.headers).get("authorization")).toBe("Bearer fixture-jwt");
    expect(String(url)).toMatch(/^https:\/\/contree-kffr.vercel.app\/api\/solo\/sessions/);
    if (init?.method === "GET") return reply();
    const body = JSON.parse(String(init?.body));
    if (body.startKey) { starts++; expect(body.rules).toEqual({ presetId: "contree-kffr" }); return reply(); }
    expect(body.expectedVersion).toBe(version);
    const intent = parseSoloIntent(body.intent);
    try { server = advanceSoloState(server, intent); version++; moves++; return reply(); }
    catch (e) { expect(e).toBeInstanceOf(SoloError); return new Response("{}", { status: 400 }); }
  });
  const map = new Map<string, string>();
  const storage = { getItem: async (key: string) => map.get(key) ?? null, setItem: async (key: string, value: string) => { map.set(key, value); } };
  let latest: SoloState | null = null;
  const make = () => createSoloController({ owner: "owner", identity: () => ({ user: { id: "owner" }, access_token: "fixture-jwt" }), storage, api, uuid: () => nonce, onChange: (next) => { latest = next; }, unauthorized: () => { throw new Error("unexpected 401"); } });
  let client = make(); await client.load(); expect(starts).toBe(0); await client.start();
  let triedIllegal = false;
  for (let step = 0; step < 500 && server.phase !== "game-over"; step++) {
    if (server.phase === "finished") await client.move({ type: "start-next-round" });
    else if (server.currentPlayerId !== 0) await client.move({ type: "advance-bot" });
    else if (server.phase === "bidding") {
      if (!server.bids.some((b) => b.action !== "pass")) await client.move({ type: "bid", playerId: 0, value: 80, contractMode: { kind: "suit", suit: "spades" } });
      else await client.move({ type: "pass", playerId: 0 });
    } else {
      const legal = playableCardsForCurrentPlayer(server);
      const illegal = server.hands[0].find((card) => !legal.some((c) => c.suit === card.suit && c.rank === card.rank));
      if (illegal && !triedIllegal) {
        const before = version; await client.move({ type: "play-card", playerId: 0, card: illegal });
        expect(version).toBe(before); expect(client.state.error).toMatch(/refusée/); await client.load(); triedIllegal = true;
      }
      await client.move({ type: "play-card", playerId: 0, card: legal[0] });
    }
    expect(client.state.error).toBeNull(); expect(client.state.session?.version).toBe(version);
    expect(client.state.session?.state.hand).toEqual(server.hands[0]);
    expect(client.state.session?.state.totalScore).toEqual(server.totalScore);
    if (step === 8) {
      client.dispose(); client = make(); await client.load(); expect(client.state.active).toBe(false); client.resume();
    }
  }
  expect(server.phase).toBe("game-over"); expect(moves).toBeGreaterThan(30); expect(starts).toBe(1);
  expect(client.state.session?.state.winnerTeam).toBe(server.winnerTeam);
  expect(latest).not.toBeNull(); client.dispose();
}, 30_000);

it("a real all-pass server result can explicitly start the next round through the native client", async () => {
  let server = createInitialGame(createSeededRandom(9));
  for (let i = 0; i < 4; i++) server = applyGameAction(server, { type: "pass", playerId: server.currentPlayerId });
  expect(server.phase).toBe("finished");
  let version = 4;
  const id = "14800000-0000-4000-8000-000000000001";
  const api = createSoloApi(async (_url, init) => {
    if (init?.method === "POST") { const body = JSON.parse(String(init.body)); expect(body.expectedVersion).toBe(version); server = advanceSoloState(server, parseSoloIntent(body.intent)); version++; }
    return new Response(JSON.stringify({ data: { id, version, state: toPlayerGameView(server, 0) } }));
  });
  const controller = createSoloController({ owner: "test", identity: () => ({ user: { id: "test" }, access_token: "fixture" }), api,
    storage: { getItem: async () => JSON.stringify({ sessionId: id, startKey: null }), setItem: async () => {} },
    uuid: () => id, onChange: () => {}, unauthorized: () => {},
  });
  await controller.load(); controller.resume(); expect(controller.state.session?.state.result).toContain("Tous ont passé");
  await controller.move({ type: "start-next-round" });
  expect(controller.state.session?.state.phase).toBe("bidding"); expect(controller.state.session?.state.roundNumber).toBe(2);
  expect(controller.state.session?.state.hand).toHaveLength(8); controller.dispose();
});
