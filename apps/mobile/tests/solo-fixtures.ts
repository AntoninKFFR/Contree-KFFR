// Public wire fixture only. Never imported by the production Metro entry.
export const SESSION_ID = "14800000-0000-4000-8000-000000000001";
export const START_KEY = "14800000-0000-4000-8000-000000000002";
export function soloFixture(phase: "bidding" | "playing" | "finished" | "game-over" = "bidding", version = 3) {
  const hand = [
    { rank: "A", suit: "spades" }, { rank: "10", suit: "spades" }, { rank: "K", suit: "hearts" }, { rank: "Q", suit: "hearts" },
    { rank: "J", suit: "clubs" }, { rank: "9", suit: "clubs" }, { rank: "8", suit: "diamonds" }, { rank: "7", suit: "diamonds" },
  ];
  return { id: SESSION_ID, version, state: {
    phase, viewerPlayerId: 0, currentPlayerId: 0, roundNumber: 2, winnerTeam: phase === "game-over" ? 0 : null,
    hand: phase === "finished" || phase === "game-over" ? [] : hand,
    handCounts: { 0: phase === "finished" || phase === "game-over" ? 0 : 8, 1: 8, 2: 8, 3: 8 },
    playerNames: { 0: "Antonin KFFR", 1: "Camille", 2: "Alexandre", 3: "Louise" },
    totalScore: { 0: 240, 1: 180 }, currentTrick: { leaderId: 0, cards: [] as { playerId: number; card: { rank: string; suit: string } }[] }, completedTricks: [],
    contract: phase === "bidding" ? null : { playerId: 0, teamId: 0, value: 100, contractMode: { kind: "suit", suit: "spades" }, status: "normal" },
    bids: [{ playerId: 0, action: "bid", value: 100, contractMode: { kind: "suit", suit: "spades" } }],
    result: phase === "finished" || phase === "game-over" ? { kind: "played", contractSucceeded: true, roundScore: { 0: 260, 1: 0 } } : null,
    message: "La table KFFR t’attend.",
  } };
}
