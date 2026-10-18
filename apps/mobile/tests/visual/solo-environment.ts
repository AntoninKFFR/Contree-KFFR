// Network-free UI server fixtures. The app imports its real environment through Metro.
import { soloStorageKey } from "../../src/solo/controller";
import { SESSION_ID, START_KEY, soloFixture } from "../solo-fixtures";
const scenario = new URLSearchParams(location.search).get("solo") || "empty";
const phases = ["bidding", "playing", "finished", "game-over"] as const;
let current = soloFixture(phases.includes(scenario as typeof phases[number]) ? scenario as typeof phases[number] : "playing");
if (scenario === "trick") {
  current.state.currentTrick.cards = [
    { playerId: 1, card: { rank: "J", suit: "hearts" } },
    { playerId: 2, card: { rank: "A", suit: "clubs" } },
    { playerId: 3, card: { rank: "K", suit: "diamonds" } },
  ];
  current.state.handCounts = { 0: 8, 1: 7, 2: 7, 3: 7 };
}
const memory = new Map<string, string>();
if (scenario !== "empty") memory.set(soloStorageKey("visual-test-only"), JSON.stringify({ sessionId: SESSION_ID, startKey: null }));
export const soloEnvironment = {
  uuid: () => START_KEY,
  storage: { getItem: async (key: string) => memory.get(key) ?? null, setItem: async (key: string, value: string) => { memory.set(key, value); } },
  fetcher: (async (_url, init) => {
    if (scenario === "offline") throw new Error("fixture offline");
    if (scenario === "loading") return new Promise<Response>(() => {});
    if (init?.method === "POST") {
      const body = JSON.parse(String(init.body));
      if (scenario === "action-error" && body.intent) return new Response("{}", { status: 400 });
      if (body.startKey) current = soloFixture("bidding", 0);
      else {
        current.version++;
        if (body.intent.type === "pass" || body.intent.type === "bid") current.state.phase = "playing";
        if (body.intent.type === "play-card") { current.state.hand = current.state.hand.filter((c) => c.rank !== body.intent.card.rank || c.suit !== body.intent.card.suit); current.state.handCounts[0] = current.state.hand.length; current.state.currentTrick.cards.push({ playerId: 0, card: body.intent.card }); }
        if (body.intent.type === "start-next-round") current = soloFixture("bidding", current.version);
      }
    }
    return new Response(JSON.stringify({ data: current }), { headers: { "content-type": "application/json" } });
  }) as typeof fetch,
};
