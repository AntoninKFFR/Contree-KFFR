import { describe, expect, it } from "vitest";
import { applyGameAction } from "@/engine/actions";
import { createInitialGame } from "@/engine/game";
import type { Card, GameState } from "@/engine/types";

function card(rank: Card["rank"], suit: Card["suit"]): Card {
  return { rank, suit };
}

describe("game actions", () => {
  it("applies bidding actions through the existing game engine", () => {
    const state = createInitialGame(() => 0.1);

    const nextState = applyGameAction(state, {
      type: "bid",
      playerId: 0,
      value: 80,
      trump: "spades",
    });

    expect(nextState.bids).toEqual([
      { action: "bid", playerId: 0, value: 80, trump: "spades" },
    ]);
    expect(nextState.currentPlayerId).toBe(1);
  });

  it("applies card actions through the existing game engine", () => {
    const state: GameState = {
      settings: { scoringMode: "made-points", targetScore: 1000 },
      phase: "playing",
      roundNumber: 1,
      startingPlayerId: 0,
      totalScore: { 0: 0, 1: 0 },
      roundHistory: [],
      winnerTeam: null,
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
      bids: [{ playerId: 0, action: "bid", value: 80, trump: "hearts" }],
      contract: { playerId: 0, teamId: 0, value: 80, trump: "hearts", status: "normal" },
      result: null,
      trickPoints: { 0: 0, 1: 0 },
      roundScore: { 0: 0, 1: 0 },
      message: "Test",
    };

    const nextState = applyGameAction(state, {
      type: "play-card",
      playerId: 0,
      card: card("A", "clubs"),
    });

    expect(nextState.hands[0]).toEqual([]);
    expect(nextState.currentTrick.cards).toEqual([
      { playerId: 0, card: card("A", "clubs") },
    ]);
    expect(nextState.currentPlayerId).toBe(1);
  });

  it("can start the next round with an injected random source", () => {
    const state = createInitialGame(() => 0.1, { targetScore: 1000 });
    const finishedState: GameState = {
      ...state,
      phase: "finished",
      totalScore: { 0: 80, 1: 0 },
      roundHistory: [
        {
          roundNumber: 1,
          result: {
            kind: "all-pass",
            roundScore: { 0: 0, 1: 0 },
          },
          totalScoreAfterRound: { 0: 80, 1: 0 },
        },
      ],
    };

    const nextState = applyGameAction(
      finishedState,
      { type: "start-next-round" },
      { random: () => 0.5 },
    );

    expect(nextState.phase).toBe("bidding");
    expect(nextState.roundNumber).toBe(2);
    expect(nextState.startingPlayerId).toBe(1);
    expect(nextState.totalScore).toEqual({ 0: 80, 1: 0 });
  });
});
