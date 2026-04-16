import { describe, expect, it } from "vitest";
import { chooseCardToPlay, chooseSimpleBid, evaluateHand } from "@/bots/heuristicBot";
import type { Card, GameState } from "@/engine/types";

function card(rank: Card["rank"], suit: Card["suit"]): Card {
  return { rank, suit };
}

function stateForBot(hand: Card[], currentTrick: GameState["currentTrick"]): GameState {
  return {
    phase: "playing",
    trump: "hearts",
    hands: {
      0: [],
      1: hand,
      2: [],
      3: [],
    },
    currentPlayerId: 1,
    currentTrick,
    completedTricks: [],
    bids: [{ playerId: 1, action: "bid", value: 80, trump: "hearts" }],
    contract: { playerId: 1, teamId: 1, value: 80, trump: "hearts" },
    result: null,
    trickPoints: { 0: 0, 1: 0 },
    roundScore: { 0: 0, 1: 0 },
    message: "Test",
  };
}

describe("heuristic bot", () => {
  it("evaluates strong trump hands higher than weak hands", () => {
    const strongHand = [
      card("J", "hearts"),
      card("9", "hearts"),
      card("A", "hearts"),
      card("A", "clubs"),
      card("10", "clubs"),
      card("K", "diamonds"),
      card("8", "spades"),
      card("7", "spades"),
    ];
    const weakHand = [
      card("7", "clubs"),
      card("8", "clubs"),
      card("7", "diamonds"),
      card("8", "diamonds"),
      card("7", "hearts"),
      card("8", "hearts"),
      card("7", "spades"),
      card("8", "spades"),
    ];

    expect(evaluateHand(strongHand, "hearts").score).toBeGreaterThan(
      evaluateHand(weakHand, "hearts").score,
    );
  });

  it("bids when a hand has strong trump potential", () => {
    const hand = [
      card("J", "hearts"),
      card("9", "hearts"),
      card("A", "hearts"),
      card("10", "hearts"),
      card("A", "clubs"),
      card("10", "clubs"),
      card("K", "diamonds"),
      card("7", "spades"),
    ];

    expect(chooseSimpleBid(hand)).toMatchObject({
      action: "bid",
      trump: "hearts",
    });
  });

  it("does not waste a strong card when partner is already winning", () => {
    const state = stateForBot(
      [card("10", "clubs"), card("7", "clubs")],
      {
        leaderId: 3,
        cards: [{ playerId: 3, card: card("A", "clubs") }],
      },
    );

    expect(chooseCardToPlay(state)).toEqual(card("7", "clubs"));
  });

  it("wins with the cheapest useful card when an opponent is winning", () => {
    const state = stateForBot(
      [card("A", "clubs"), card("10", "clubs"), card("7", "clubs")],
      {
        leaderId: 0,
        cards: [{ playerId: 0, card: card("K", "clubs") }],
      },
    );

    expect(chooseCardToPlay(state)).toEqual(card("10", "clubs"));
  });

  it("preserves strong trump when partner is already winning", () => {
    const state = stateForBot(
      [card("J", "hearts"), card("7", "spades")],
      {
        leaderId: 3,
        cards: [{ playerId: 3, card: card("A", "clubs") }],
      },
    );

    expect(chooseCardToPlay(state)).toEqual(card("7", "spades"));
  });
});
