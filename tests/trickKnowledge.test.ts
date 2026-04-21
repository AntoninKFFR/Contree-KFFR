import { describe, expect, it } from "vitest";
import {
  buildTrickKnowledge,
  getCutRiskBySuit,
  getMasterCardsStillOutBySuit,
  getPlayedTrumps,
  getRemainingTrumps,
  inferVoidSuitsByPlayer,
} from "@/bots/strategy/trickKnowledge";
import type { Card, GameState } from "@/engine/types";

function card(rank: Card["rank"], suit: Card["suit"]): Card {
  return { rank, suit };
}

function createState(): GameState {
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
      0: [card("A", "clubs"), card("10", "spades"), card("J", "hearts")],
      1: [],
      2: [],
      3: [],
    },
    currentPlayerId: 0,
    currentTrick: {
      leaderId: 1,
      cards: [
        { playerId: 1, card: card("K", "clubs") },
        { playerId: 2, card: card("8", "hearts") },
      ],
    },
    completedTricks: [
      {
        leaderId: 0,
        cards: [
          { playerId: 0, card: card("7", "clubs") },
          { playerId: 1, card: card("A", "diamonds") },
          { playerId: 2, card: card("8", "clubs") },
          { playerId: 3, card: card("9", "clubs") },
        ],
        winnerId: 3,
        points: 11,
      },
      {
        leaderId: 3,
        cards: [
          { playerId: 3, card: card("9", "hearts") },
          { playerId: 0, card: card("Q", "hearts") },
          { playerId: 1, card: card("10", "hearts") },
          { playerId: 2, card: card("7", "spades") },
        ],
        winnerId: 3,
        points: 24,
      },
      {
        leaderId: 3,
        cards: [
          { playerId: 3, card: card("A", "spades") },
          { playerId: 0, card: card("8", "spades") },
          { playerId: 1, card: card("K", "spades") },
          { playerId: 2, card: card("7", "diamonds") },
        ],
        winnerId: 3,
        points: 15,
      },
    ],
    bids: [{ playerId: 0, action: "bid", value: 90, trump: "hearts" }],
    contract: { playerId: 0, teamId: 0, value: 90, trump: "hearts", status: "normal" },
    result: null,
    trickPoints: { 0: 0, 1: 50 },
    roundScore: { 0: 0, 1: 0 },
    message: "Test",
  };
}

describe("trick knowledge", () => {
  it("infers players who are certainly void in a suit", () => {
    const state = createState();

    expect(inferVoidSuitsByPlayer(state)).toEqual({
      0: [],
      1: ["clubs"],
      2: ["clubs", "hearts", "spades"],
      3: [],
    });
  });

  it("tracks played and remaining trumps", () => {
    const state = createState();

    expect(getPlayedTrumps(state)).toEqual([
      card("8", "hearts"),
      card("9", "hearts"),
      card("Q", "hearts"),
      card("10", "hearts"),
    ]);

    expect(getRemainingTrumps(state)).toEqual([
      card("J", "hearts"),
      card("A", "hearts"),
      card("K", "hearts"),
      card("7", "hearts"),
    ]);
  });

  it("returns the strongest unplayed card by suit", () => {
    const state = createState();

    expect(getMasterCardsStillOutBySuit(state)).toEqual({
      clubs: card("A", "clubs"),
      diamonds: card("10", "diamonds"),
      hearts: card("J", "hearts"),
      spades: card("10", "spades"),
    });
  });

  it("computes a simple cut risk by suit and aggregates the knowledge", () => {
    const state = createState();

    expect(getCutRiskBySuit(state)).toMatchObject({
      clubs: {
        level: "medium",
        knownVoidOpponents: [1],
        knownVoidPartner: true,
        remainingTrumpCount: 4,
      },
      hearts: {
        level: "none",
      },
      spades: {
        level: "medium",
        knownVoidOpponents: [],
        knownVoidPartner: true,
        remainingTrumpCount: 4,
      },
    });

    expect(buildTrickKnowledge(state)).toMatchObject({
      deadSuits: [],
      weakenedSuits: [],
      masterCardsBySuit: {
        hearts: card("J", "hearts"),
      },
    });
  });
});
