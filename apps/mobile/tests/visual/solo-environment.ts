import { multiplayerFetch } from "./multiplayer-environment";
// Network-free UI server fixtures. The app imports its real environment through Metro.
import { soloStorageKey } from "../../src/solo/controller";
import { SESSION_ID, START_KEY, soloFixture, biddingFixture } from "../solo-fixtures";
import parity from "../parity/states.json";
import illegalState from "../parity/illegal-state.json";
import { clonePlayerPreferences, PLAYER_PREFERENCES_STORAGE_KEY } from "../../../../lib/preferences/playerPreferences";
const parityStage = new URLSearchParams(location.search).get("parity") as keyof typeof parity | null;
const biddingStage = new URLSearchParams(location.search).get("bidding");
const scenario = new URLSearchParams(location.search).get("solo") || "empty";
const phases = ["bidding", "playing", "finished", "game-over"] as const;
let current = soloFixture(phases.includes(scenario as typeof phases[number]) ? scenario as typeof phases[number] : "playing");
if (parityStage && parity[parityStage]) current = { ...structuredClone(parity[parityStage]), id: SESSION_ID } as typeof current;
const biddingState = biddingFixture(biddingStage);
if (biddingState) current = { ...biddingState, id: SESSION_ID } as unknown as typeof current;
if (scenario === "illegal") current = { ...structuredClone(illegalState), id: SESSION_ID } as typeof current;
if (scenario === "trick" || scenario === "last-trick") {
  current.state.currentTrick.cards = [
    { playerId: 1, card: { rank: "J", suit: "hearts" } },
    { playerId: 2, card: { rank: "A", suit: "clubs" } },
    { playerId: 3, card: { rank: "K", suit: "diamonds" } },
  ];
  current.state.handCounts = { 0: 8, 1: 7, 2: 7, 3: 7 };
  if (scenario === "last-trick") {
    const played = current.state.hand.shift()!;
    current.state.completedTricks = [{ leaderId: 0, winnerId: 0, points: 32, cards: [{ playerId: 0, card: played }, ...current.state.currentTrick.cards] }];
    current.state.currentTrick.cards = [];
    current.state.handCounts[0] = 7;
  }
}
const memory = new Map<string, string>();
if (new URLSearchParams(location.search).get("multi") && !["landing", "live"].includes(new URLSearchParams(location.search).get("multi")!)) memory.set("kffr.native.multiplayer.room.v1:visual-test-only", "15100000-0000-4000-8000-000000000001");
if (parityStage || biddingStage || new URLSearchParams(location.search).has("multi")) { const prefs = clonePlayerPreferences(); prefs.visual.reducedMotion = new URLSearchParams(location.search).get("motion") !== "1"; memory.set(PLAYER_PREFERENCES_STORAGE_KEY, JSON.stringify(prefs)); }
if (scenario !== "empty" || parityStage || biddingStage) memory.set(soloStorageKey("visual-test-only"), JSON.stringify({ sessionId: SESSION_ID, startKey: null }));
const requests: { method: string; body: unknown }[] = [];
Object.assign(globalThis, { __soloFixture: { requests, current: () => current, stored: (key: string) => memory.get(key) ?? null } });
export const soloEnvironment = {
  uuid: () => START_KEY,
  storage: { getItem: async (key: string) => memory.get(key) ?? null, setItem: async (key: string, value: string) => { memory.set(key, value); } },
  fetcher: (async (_url, init) => {
    if (String(_url).includes("/api/multiplayer/") || String(_url).includes("/api/social/")) return multiplayerFetch(String(_url), init);
    requests.push({ method: init?.method ?? "GET", body: init?.body ? JSON.parse(String(init.body)) : null });
    if (scenario === "offline") throw new Error("fixture offline");
    if (scenario === "loading") return new Promise<Response>(() => {});
    if (init?.method === "POST") {
      const body = JSON.parse(String(init.body));
      const postDelay = Number(new URLSearchParams(location.search).get("postDelay") || 0);
      if (postDelay > 0) await new Promise((resolve) => setTimeout(resolve, postDelay));
      // Callback/permission tests stay on the same engine-generated human turn.
      // Full transitions and bots are exercised by the real-engine transport test.
      if (biddingStage && body.intent) {
        const version = current.version + 1;
        if (biddingStage === "bot-turn" && body.intent.type === "advance-bot") current = { ...biddingFixture("coinche")!, id: SESSION_ID } as unknown as typeof current;
        current.version = version;
        return new Response(JSON.stringify({ data: current }));
      }
      if (scenario === "action-error" && body.intent) return new Response("{}", { status: 400 });
      if (body.startKey) current = soloFixture("bidding", 0);
      else {
        current.version++;
        if (body.intent.type === "pass" || body.intent.type === "bid") current = soloFixture("playing", current.version);
        if (body.intent.type === "play-card") { current.state.hand = current.state.hand.filter((c) => c.rank !== body.intent.card.rank || c.suit !== body.intent.card.suit); current.state.handCounts[0] = current.state.hand.length; current.state.currentTrick.cards.push({ playerId: 0, card: body.intent.card }); }
        if (body.intent.type === "start-next-round") current = soloFixture("bidding", current.version);
      }
    }
    return new Response(JSON.stringify({ data: current }), { headers: { "content-type": "application/json" } });
  }) as typeof fetch,
};
