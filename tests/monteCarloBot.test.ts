import { describe, expect, it } from "vitest";
import { chooseBotCard } from "@/bots/simpleBot";
import {
  getMonteCarloV2Candidates,
  chooseMonteCarloCardToPlay,
  chooseMonteCarloV2CardToPlay,
} from "@/bots/strategy/monteCarloCardStrategy";
import { chooseMonteCarloBid } from "@/bots/strategy/monteCarloBiddingStrategy";
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

  it("adds a safe master lead candidate in V2 when leading is ambiguous", () => {
    const state: GameState = {
      ...stateForMonteCarlo([
        card("J", "hearts"),
        card("9", "hearts"),
        card("A", "diamonds"),
      ]),
      hands: {
        0: [card("A", "clubs"), card("7", "clubs"), card("8", "diamonds"), card("7", "spades")],
        1: [card("J", "hearts"), card("9", "hearts"), card("A", "diamonds"), card("8", "spades")],
        2: [card("7", "diamonds"), card("8", "diamonds"), card("K", "spades"), card("Q", "spades")],
        3: [card("8", "clubs"), card("9", "diamonds"), card("Q", "clubs"), card("K", "diamonds")],
      },
      currentTrick: { leaderId: 0, cards: [] },
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
        {
          leaderId: 0,
          cards: [
            { playerId: 0, card: card("10", "diamonds") },
            { playerId: 1, card: card("J", "diamonds") },
            { playerId: 2, card: card("7", "diamonds") },
            { playerId: 3, card: card("8", "diamonds") },
          ],
          winnerId: 1,
          points: 12,
        },
      ],
    };

    const candidates = getMonteCarloV2Candidates(state, card("7", "spades"));

    expect(candidates).toContainEqual(card("A", "clubs"));
  });

  it("keeps a support candidate when the partner already wins a valuable trick", () => {
    const state: GameState = {
      ...stateForMonteCarlo([
        card("J", "hearts"),
        card("9", "hearts"),
        card("A", "diamonds"),
      ]),
      hands: {
        0: [card("10", "clubs"), card("A", "spades"), card("7", "spades")],
        1: [card("J", "hearts"), card("9", "hearts"), card("A", "diamonds")],
        2: [card("7", "clubs"), card("8", "diamonds"), card("J", "spades")],
        3: [card("8", "clubs"), card("9", "diamonds"), card("K", "spades")],
      },
      currentTrick: {
        leaderId: 1,
        cards: [
          { playerId: 1, card: card("K", "diamonds") },
          { playerId: 2, card: card("A", "diamonds") },
          { playerId: 3, card: card("K", "diamonds") },
        ],
      },
      completedTricks: [
        {
          leaderId: 0,
          cards: [
            { playerId: 0, card: card("7", "spades") },
            { playerId: 1, card: card("8", "spades") },
            { playerId: 2, card: card("9", "spades") },
            { playerId: 3, card: card("K", "spades") },
          ],
          winnerId: 3,
          points: 4,
        },
      ],
    };

    const candidates = getMonteCarloV2Candidates(state, card("7", "spades"));

    expect(candidates).toContainEqual(card("10", "clubs"));
    expect(candidates).not.toContainEqual(card("A", "spades"));
  });

  it("filters obviously dominated candidates when a safer alternative exists", () => {
    const state: GameState = {
      ...stateForMonteCarlo([
        card("J", "hearts"),
        card("9", "hearts"),
        card("A", "diamonds"),
      ]),
      hands: {
        0: [card("A", "clubs"), card("7", "clubs"), card("8", "diamonds"), card("7", "spades")],
        1: [card("J", "hearts"), card("9", "hearts"), card("A", "diamonds"), card("8", "spades")],
        2: [card("7", "diamonds"), card("8", "diamonds"), card("K", "spades"), card("Q", "spades")],
        3: [card("8", "clubs"), card("9", "diamonds"), card("Q", "clubs"), card("K", "diamonds")],
      },
      currentTrick: { leaderId: 0, cards: [] },
      completedTricks: [
        {
          leaderId: 1,
          cards: [
            { playerId: 1, card: card("7", "clubs") },
            { playerId: 2, card: card("8", "clubs") },
            { playerId: 3, card: card("9", "clubs") },
            { playerId: 0, card: card("7", "spades") },
          ],
          winnerId: 3,
          points: 0,
        },
        {
          leaderId: 2,
          cards: [
            { playerId: 2, card: card("K", "clubs") },
            { playerId: 3, card: card("8", "hearts") },
            { playerId: 0, card: card("7", "clubs") },
            { playerId: 1, card: card("9", "diamonds") },
          ],
          winnerId: 3,
          points: 4,
        },
      ],
    };

    const candidates = getMonteCarloV2Candidates(state, card("7", "spades"));

    expect(candidates).not.toContainEqual(card("A", "clubs"));
  });

  it("returns a legal bidding decision for the Monte Carlo bidding strategy", () => {
    const state: GameState = {
      ...stateForMonteCarlo([
        card("J", "hearts"),
        card("9", "hearts"),
        card("A", "diamonds"),
      ]),
      phase: "bidding",
      trump: null,
      contract: null,
      currentPlayerId: 0,
      currentTrick: { leaderId: 0, cards: [] },
      completedTricks: [],
      bids: [],
      trickPoints: { 0: 0, 1: 0 },
      result: null,
    };

    const decision = chooseMonteCarloBid(state, { totalBudget: 8 });

    expect(["pass", "bid", "coinche", "surcoinche"]).toContain(decision.action);
    if (decision.action === "bid") {
      expect(decision.value).toBeDefined();
      expect(decision.trump).toBeDefined();
    }
  });

  it("keeps Monte Carlo bidding independent from actual hidden hands", () => {
    const baseState: GameState = {
      ...stateForMonteCarlo([
        card("J", "hearts"),
        card("9", "hearts"),
        card("A", "diamonds"),
      ]),
      phase: "bidding",
      trump: null,
      contract: null,
      currentPlayerId: 0,
      currentTrick: { leaderId: 0, cards: [] },
      completedTricks: [],
      bids: [],
      trickPoints: { 0: 0, 1: 0 },
      result: null,
    };
    const otherHiddenHands: GameState = {
      ...baseState,
      hands: {
        ...baseState.hands,
        1: [card("7", "hearts"), card("8", "hearts"), card("Q", "diamonds")],
        2: [card("J", "clubs"), card("9", "clubs"), card("A", "spades")],
        3: [card("10", "diamonds"), card("K", "diamonds"), card("Q", "spades")],
      },
    };

    expect(chooseMonteCarloBid(baseState, { totalBudget: 8 })).toEqual(
      chooseMonteCarloBid(otherHiddenHands, { totalBudget: 8 }),
    );
  });
});
