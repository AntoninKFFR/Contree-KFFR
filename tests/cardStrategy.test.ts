import { describe, expect, it } from "vitest";
import { getBotProfile } from "@/bots/profiles";
import { chooseProfileCardToPlay } from "@/bots/strategy/cardStrategy";
import type { Card, GameState } from "@/engine/types";

function card(rank: Card["rank"], suit: Card["suit"]): Card {
  return { rank, suit };
}

function createPlayingState(hand: Card[], completedTricks: GameState["completedTricks"]): GameState {
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
      0: hand,
      1: [],
      2: [],
      3: [],
    },
    currentPlayerId: 0,
    currentTrick: {
      leaderId: 0,
      cards: [],
    },
    completedTricks,
    bids: [{ playerId: 0, action: "bid", value: 100, trump: "hearts" }],
    contract: { playerId: 0, teamId: 0, value: 100, trump: "hearts", status: "normal" },
    result: null,
    trickPoints: { 0: 0, 1: 0 },
    roundScore: { 0: 0, 1: 0 },
    message: "Test",
  };
}

describe("card strategy", () => {
  it("draws trump early when strong side-suit points are exposed to a cut", () => {
    const state = createPlayingState(
      [
        card("J", "hearts"),
        card("9", "hearts"),
        card("A", "hearts"),
        card("7", "hearts"),
        card("A", "clubs"),
        card("10", "clubs"),
        card("K", "spades"),
        card("8", "diamonds"),
      ],
      [
        {
          leaderId: 1,
          cards: [
            { playerId: 1, card: card("7", "clubs") },
            { playerId: 2, card: card("8", "clubs") },
            { playerId: 3, card: card("9", "clubs") },
            { playerId: 0, card: card("K", "clubs") },
          ],
          winnerId: 0,
          points: 4,
        },
        {
          leaderId: 1,
          cards: [
            { playerId: 1, card: card("Q", "clubs") },
            { playerId: 2, card: card("8", "hearts") },
            { playerId: 3, card: card("J", "clubs") },
            { playerId: 0, card: card("7", "spades") },
          ],
          winnerId: 2,
          points: 22,
        },
      ],
    );

    expect(chooseProfileCardToPlay(state, getBotProfile("main"))).toEqual(card("J", "hearts"));
  });

  it("avoids leading an exposed ace when the suit has a high cut risk", () => {
    const state = createPlayingState(
      [
        card("A", "clubs"),
        card("10", "clubs"),
        card("J", "hearts"),
        card("9", "hearts"),
        card("7", "hearts"),
        card("K", "spades"),
        card("8", "spades"),
        card("7", "diamonds"),
      ],
      [
        {
          leaderId: 1,
          cards: [
            { playerId: 1, card: card("7", "clubs") },
            { playerId: 2, card: card("8", "clubs") },
            { playerId: 3, card: card("9", "clubs") },
            { playerId: 0, card: card("K", "clubs") },
          ],
          winnerId: 0,
          points: 4,
        },
        {
          leaderId: 1,
          cards: [
            { playerId: 1, card: card("Q", "clubs") },
            { playerId: 2, card: card("8", "hearts") },
            { playerId: 3, card: card("J", "clubs") },
            { playerId: 0, card: card("7", "spades") },
          ],
          winnerId: 2,
          points: 22,
        },
        {
          leaderId: 2,
          cards: [
            { playerId: 2, card: card("A", "diamonds") },
            { playerId: 3, card: card("K", "diamonds") },
            { playerId: 0, card: card("8", "diamonds") },
            { playerId: 1, card: card("7", "hearts") },
          ],
          winnerId: 2,
          points: 15,
        },
      ],
    );

    expect(chooseProfileCardToPlay(state, getBotProfile("main"))).toEqual(card("J", "hearts"));
  });
});
