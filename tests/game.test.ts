import { describe, expect, it } from "vitest";
import { createInitialGame, playCard } from "@/engine/game";
import type { Card, GameState } from "@/engine/types";

function card(rank: Card["rank"], suit: Card["suit"]): Card {
  return { rank, suit };
}

describe("game", () => {
  it("deals 8 cards to each player", () => {
    const state = createInitialGame(() => 0.5);

    expect(state.hands[0]).toHaveLength(8);
    expect(state.hands[1]).toHaveLength(8);
    expect(state.hands[2]).toHaveLength(8);
    expect(state.hands[3]).toHaveLength(8);
  });

  it("moves turn to the next player after a card is played", () => {
    const state = createInitialGame(() => 0.5);
    const firstCard = state.hands[0][0];
    const nextState = playCard(state, 0, firstCard);

    expect(nextState.currentPlayerId).toBe(1);
    expect(nextState.currentTrick.cards).toHaveLength(1);
    expect(nextState.hands[0]).toHaveLength(7);
  });

  it("completes a trick, gives points to the winner team, and lets winner lead", () => {
    const state: GameState = {
      phase: "playing",
      trump: "hearts",
      hands: {
        0: [card("A", "clubs")],
        1: [card("7", "hearts")],
        2: [card("10", "clubs")],
        3: [card("K", "clubs")],
      },
      currentPlayerId: 0,
      currentTrick: { leaderId: 0, cards: [] },
      completedTricks: [],
      trickPoints: { 0: 0, 1: 0 },
      roundScore: { 0: 0, 1: 0 },
      message: "Test",
    };

    const afterPlayer0 = playCard(state, 0, card("A", "clubs"));
    const afterPlayer1 = playCard(afterPlayer0, 1, card("7", "hearts"));
    const afterPlayer2 = playCard(afterPlayer1, 2, card("10", "clubs"));
    const afterPlayer3 = playCard(afterPlayer2, 3, card("K", "clubs"));

    expect(afterPlayer3.phase).toBe("finished");
    expect(afterPlayer3.completedTricks).toHaveLength(1);
    expect(afterPlayer3.completedTricks[0].winnerId).toBe(1);
    expect(afterPlayer3.trickPoints[1]).toBe(35);
    expect(afterPlayer3.currentPlayerId).toBe(1);
  });
});
