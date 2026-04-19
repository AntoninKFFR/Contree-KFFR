import { describe, expect, it } from "vitest";
import { chooseBotCard } from "@/bots/simpleBot";
import {
  chooseMonteCarloCardToPlay,
  chooseMonteCarloV2CardToPlay,
} from "@/bots/strategy/monteCarloCardStrategy";
import type { Card, GameState } from "@/engine/types";

function card(rank: Card["rank"], suit: Card["suit"]): Card {
  return { rank, suit };
}

function stateForMonteCarlo(opponentHand: Card[]): GameState {
  return {
    settings: { scoringMode: "made-points", targetScore: 1000 },
    phase: "playing",
    roundNumber: 1,
    startingPlayerId: 0,
    totalScore: { 0: 0, 1: 0 },
    roundHistory: [],
    winnerTeam: null,
    trump: "hearts",
    hands: {
      0: [card("A", "clubs"), card("10", "clubs"), card("7", "spades")],
      1: opponentHand,
      2: [card("7", "clubs"), card("8", "diamonds"), card("K", "spades")],
      3: [card("8", "clubs"), card("9", "diamonds"), card("Q", "spades")],
    },
    currentPlayerId: 0,
    currentTrick: {
      leaderId: 0,
      cards: [],
    },
    completedTricks: [
      {
        leaderId: 1,
        cards: [
          { playerId: 1, card: card("7", "hearts") },
          { playerId: 2, card: card("8", "hearts") },
          { playerId: 3, card: card("Q", "hearts") },
          { playerId: 0, card: card("K", "hearts") },
        ],
        winnerId: 0,
        points: 7,
      },
    ],
    bids: [{ playerId: 0, action: "bid", value: 80, trump: "hearts" }],
    contract: { playerId: 0, teamId: 0, value: 80, trump: "hearts", status: "normal" },
    result: null,
    trickPoints: { 0: 7, 1: 0 },
    roundScore: { 0: 0, 1: 0 },
    message: "Test",
  };
}

describe("monte carlo bot", () => {
  it("returns a legal card from the current player's hand", () => {
    const state = stateForMonteCarlo([
      card("J", "hearts"),
      card("9", "hearts"),
      card("A", "diamonds"),
    ]);

    const choice = chooseMonteCarloCardToPlay(state, { totalBudget: 12 });

    expect(state.hands[0]).toContainEqual(choice);
  });

  it("does not depend on the actual hidden opponent cards", () => {
    const firstState = stateForMonteCarlo([
      card("J", "hearts"),
      card("9", "hearts"),
      card("A", "diamonds"),
    ]);
    const secondState = stateForMonteCarlo([
      card("J", "diamonds"),
      card("9", "spades"),
      card("A", "hearts"),
    ]);

    expect(chooseMonteCarloCardToPlay(firstState, { totalBudget: 12 })).toEqual(
      chooseMonteCarloCardToPlay(secondState, { totalBudget: 12 }),
    );
  });

  it("returns a legal card with the V2 strategy", () => {
    const state = stateForMonteCarlo([
      card("J", "hearts"),
      card("9", "hearts"),
      card("A", "diamonds"),
    ]);

    const choice = chooseMonteCarloV2CardToPlay(state, { totalBudget: 12 });

    expect(state.hands[0]).toContainEqual(choice);
  });

  it("keeps V2 independent from actual hidden opponent cards", () => {
    const firstState = stateForMonteCarlo([
      card("J", "hearts"),
      card("9", "hearts"),
      card("A", "diamonds"),
    ]);
    const secondState = stateForMonteCarlo([
      card("J", "diamonds"),
      card("9", "spades"),
      card("A", "hearts"),
    ]);

    expect(chooseMonteCarloV2CardToPlay(firstState, { totalBudget: 12 })).toEqual(
      chooseMonteCarloV2CardToPlay(secondState, { totalBudget: 12 }),
    );
  });

  it("uses Monte Carlo V2 for the official web bot card choice", () => {
    const state = stateForMonteCarlo([
      card("J", "hearts"),
      card("9", "hearts"),
      card("A", "diamonds"),
    ]);

    expect(chooseBotCard(state)).toEqual(chooseMonteCarloV2CardToPlay(state));
  });
});
