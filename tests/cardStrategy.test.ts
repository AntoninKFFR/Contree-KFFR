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

function createFollowingState(
  hand: Card[],
  currentTrick: GameState["currentTrick"],
  completedTricks: GameState["completedTricks"] = [],
): GameState {
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
    currentTrick,
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

  it("feeds the partner with points without throwing a protected master", () => {
    const state = createFollowingState(
      [card("10", "clubs"), card("A", "spades")],
      {
        leaderId: 1,
        cards: [
          { playerId: 1, card: card("A", "diamonds") },
          { playerId: 2, card: card("J", "diamonds") },
          { playerId: 3, card: card("K", "diamonds") },
        ],
      },
      [
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
    );

    expect(chooseProfileCardToPlay(state, getBotProfile("main"))).toEqual(card("10", "clubs"));
  });

  it("does not overtake the partner with a stronger card without a clear reason", () => {
    const state = createFollowingState(
      [card("A", "spades"), card("7", "spades")],
      {
        leaderId: 1,
        cards: [
          { playerId: 1, card: card("K", "spades") },
          { playerId: 2, card: card("10", "spades") },
          { playerId: 3, card: card("8", "spades") },
        ],
      },
    );

    expect(chooseProfileCardToPlay(state, getBotProfile("main"))).toEqual(card("7", "spades"));
  });

  it("discards a weak risky card instead of a protected point card when it cannot win", () => {
    const state = createFollowingState(
      [card("A", "clubs"), card("7", "diamonds")],
      {
        leaderId: 1,
        cards: [
          { playerId: 1, card: card("J", "hearts") },
          { playerId: 2, card: card("7", "spades") },
          { playerId: 3, card: card("8", "hearts") },
        ],
      },
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
      ],
    );

    expect(chooseProfileCardToPlay(state, getBotProfile("main"))).toEqual(card("7", "diamonds"));
  });

  it("as last player, lets a small trick go instead of spending a protected winner", () => {
    const state = createFollowingState(
      [card("A", "clubs"), card("7", "clubs")],
      {
        leaderId: 1,
        cards: [
          { playerId: 1, card: card("K", "clubs") },
          { playerId: 2, card: card("8", "clubs") },
          { playerId: 3, card: card("9", "clubs") },
        ],
      },
      [
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
    );

    expect(chooseProfileCardToPlay(state, getBotProfile("main"))).toEqual(card("7", "clubs"));
  });

  it("as last player, takes an important trick with the cheapest winning card", () => {
    const state = createFollowingState(
      [card("10", "spades"), card("A", "spades"), card("7", "diamonds")],
      {
        leaderId: 1,
        cards: [
          { playerId: 1, card: card("K", "spades") },
          { playerId: 2, card: card("A", "diamonds") },
          { playerId: 3, card: card("Q", "spades") },
        ],
      },
    );

    expect(chooseProfileCardToPlay(state, getBotProfile("main"))).toEqual(card("10", "spades"));
  });

  it("as third player, avoids overcommitting on a low-value trick", () => {
    const state = createFollowingState(
      [card("A", "clubs"), card("7", "clubs")],
      {
        leaderId: 1,
        cards: [
          { playerId: 1, card: card("K", "clubs") },
          { playerId: 2, card: card("8", "clubs") },
        ],
      },
      [
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
    );

    expect(chooseProfileCardToPlay(state, getBotProfile("main"))).toEqual(card("7", "clubs"));
  });

  it("cashes a master card earlier in the late round instead of keeping it too long", () => {
    const state = createPlayingState(
      [card("A", "spades"), card("7", "clubs"), card("8", "diamonds")],
      [
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
        {
          leaderId: 1,
          cards: [
            { playerId: 1, card: card("7", "diamonds") },
            { playerId: 2, card: card("8", "diamonds") },
            { playerId: 3, card: card("9", "diamonds") },
            { playerId: 0, card: card("K", "diamonds") },
          ],
          winnerId: 0,
          points: 4,
        },
        {
          leaderId: 2,
          cards: [
            { playerId: 2, card: card("7", "clubs") },
            { playerId: 3, card: card("8", "clubs") },
            { playerId: 0, card: card("9", "clubs") },
            { playerId: 1, card: card("K", "clubs") },
          ],
          winnerId: 1,
          points: 4,
        },
        {
          leaderId: 3,
          cards: [
            { playerId: 3, card: card("J", "hearts") },
            { playerId: 0, card: card("7", "hearts") },
            { playerId: 1, card: card("8", "hearts") },
            { playerId: 2, card: card("Q", "hearts") },
          ],
          winnerId: 3,
          points: 23,
        },
        {
          leaderId: 0,
          cards: [
            { playerId: 0, card: card("A", "clubs") },
            { playerId: 1, card: card("Q", "clubs") },
            { playerId: 2, card: card("J", "clubs") },
            { playerId: 3, card: card("10", "clubs") },
          ],
          winnerId: 0,
          points: 23,
        },
      ],
    );

    expect(chooseProfileCardToPlay(state, getBotProfile("main"))).toEqual(card("A", "spades"));
  });

  it("secures a valuable trick in the late round with the cheapest winning card", () => {
    const state = createFollowingState(
      [card("10", "spades"), card("A", "spades"), card("7", "clubs")],
      {
        leaderId: 1,
        cards: [
          { playerId: 1, card: card("K", "spades") },
          { playerId: 2, card: card("A", "diamonds") },
          { playerId: 3, card: card("Q", "spades") },
        ],
      },
      [
        {
          leaderId: 0,
          cards: [
            { playerId: 0, card: card("7", "hearts") },
            { playerId: 1, card: card("8", "hearts") },
            { playerId: 2, card: card("9", "hearts") },
            { playerId: 3, card: card("K", "hearts") },
          ],
          winnerId: 2,
          points: 29,
        },
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
            { playerId: 1, card: card("7", "diamonds") },
            { playerId: 2, card: card("8", "diamonds") },
            { playerId: 3, card: card("9", "diamonds") },
            { playerId: 0, card: card("K", "diamonds") },
          ],
          winnerId: 0,
          points: 4,
        },
        {
          leaderId: 1,
          cards: [
            { playerId: 1, card: card("J", "clubs") },
            { playerId: 2, card: card("Q", "clubs") },
            { playerId: 3, card: card("A", "clubs") },
            { playerId: 0, card: card("10", "clubs") },
          ],
          winnerId: 3,
          points: 26,
        },
        {
          leaderId: 2,
          cards: [
            { playerId: 2, card: card("10", "hearts") },
            { playerId: 3, card: card("A", "hearts") },
            { playerId: 0, card: card("8", "hearts") },
            { playerId: 1, card: card("7", "spades") },
          ],
          winnerId: 3,
          points: 21,
        },
      ],
    );

    expect(chooseProfileCardToPlay(state, getBotProfile("main"))).toEqual(card("10", "spades"));
  });
});
