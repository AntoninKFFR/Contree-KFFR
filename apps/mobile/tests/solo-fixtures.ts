// Same public, engine-generated states as the actual web parity captures.
import parity from "./parity/states.json";
export const SESSION_ID = "14800000-0000-4000-8000-000000000001";
export const START_KEY = "14800000-0000-4000-8000-000000000002";
export function soloFixture(phase: "bidding" | "playing" | "finished" | "game-over" = "bidding", version = 3) {
  const source = structuredClone(parity[phase === "bidding" ? "bidding" : phase === "playing" ? "start" : "result"]);
  return { ...source, id: SESSION_ID, version, state: { ...source.state, currentTrick: { ...source.state.currentTrick, cards: source.state.currentTrick.cards as { playerId: number; card: { rank: string; suit: string } }[] }, phase, winnerTeam: phase === "game-over" ? 0 : null } };
}
