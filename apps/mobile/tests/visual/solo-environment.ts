// Network-free UI server fixtures. The app imports its real environment through Metro.
import { soloStorageKey } from "../../src/solo/controller";
import { SESSION_ID, START_KEY, soloFixture } from "../solo-fixtures";
import parity from "../parity/states.json";
import biddingParity from "../parity/bidding-states.json";
import illegalState from "../parity/illegal-state.json";
import { clonePlayerPreferences, PLAYER_PREFERENCES_STORAGE_KEY } from "../../../../lib/preferences/playerPreferences";
const parityStage = new URLSearchParams(location.search).get("parity") as keyof typeof parity | null;
const biddingStage = new URLSearchParams(location.search).get("bidding") as keyof typeof biddingParity | null;
const scenario = new URLSearchParams(location.search).get("solo") || "empty";
const phases = ["bidding", "playing", "finished", "game-over"] as const;
let current = soloFixture(phases.includes(scenario as typeof phases[number]) ? scenario as typeof phases[number] : "playing");
if (parityStage && parity[parityStage]) current = { ...structuredClone(parity[parityStage]), id: SESSION_ID } as typeof current;
if (biddingStage && biddingParity[biddingStage]) current = { ...structuredClone(biddingParity[biddingStage]), id: SESSION_ID } as typeof current;
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
if (parityStage || biddingStage) { const prefs = clonePlayerPreferences(); prefs.visual.reducedMotion = true; memory.set(PLAYER_PREFERENCES_STORAGE_KEY, JSON.stringify(prefs)); }
if (scenario !== "empty" || parityStage || biddingStage) memory.set(soloStorageKey("visual-test-only"), JSON.stringify({ sessionId: SESSION_ID, startKey: null }));
const requests: { method: string; body: unknown }[] = [];
Object.assign(globalThis, { __soloFixture: { requests, stored: (key: string) => memory.get(key) ?? null } });
export const soloEnvironment = {
  uuid: () => START_KEY,
  storage: { getItem: async (key: string) => memory.get(key) ?? null, setItem: async (key: string, value: string) => { memory.set(key, value); } },
  fetcher: (async (_url, init) => {
    requests.push({ method: init?.method ?? "GET", body: init?.body ? JSON.parse(String(init.body)) : null });
    if (scenario === "offline") throw new Error("fixture offline");
    if (scenario === "loading") return new Promise<Response>(() => {});
    if (init?.method === "POST") {
      const body = JSON.parse(String(init.body));
      // Callback/permission tests stay on the same engine-generated human turn.
      // Full transitions and bots are exercised by the real-engine transport test.
      if (biddingStage && body.intent) { current.version++; return new Response(JSON.stringify({ data: current })); }
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
