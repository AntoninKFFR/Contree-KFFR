import { describe, expect, it } from "vitest";
import { getBotProfile } from "@/bots/profiles";
import { chooseProfileBidFromHand, chooseProfileBid } from "@/bots/strategy/biddingStrategy";
import type { Card, GameState } from "@/engine/types";

function card(rank: Card["rank"], suit: Card["suit"]): Card {
  return { rank, suit };
}

function createBiddingState(hand: Card[], bids: GameState["bids"], currentPlayerId = 0): GameState {
  return {
    settings: { scoringMode: "made-points", targetScore: 1000 },
    phase: "bidding",
    roundNumber: 1,
    startingPlayerId: 0,
    totalScore: { 0: 0, 1: 0 },
    roundHistory: [],
    winnerTeam: null,
    trump: null,
    hands: {
      0: currentPlayerId === 0 ? hand : [],
      1: currentPlayerId === 1 ? hand : [],
      2: currentPlayerId === 2 ? hand : [],
      3: currentPlayerId === 3 ? hand : [],
    },
    currentPlayerId,
    currentTrick: { leaderId: 0, cards: [] },
    completedTricks: [],
    bids,
    contract: null,
    result: null,
    trickPoints: { 0: 0, 1: 0 },
    roundScore: { 0: 0, 1: 0 },
    message: "Test",
  };
}

describe("bidding strategy", () => {
  it("opens 80 with a petit jeu", () => {
    const hand = [
      card("J", "hearts"),
      card("A", "hearts"),
      card("10", "hearts"),
      card("8", "hearts"),
      card("7", "clubs"),
      card("8", "clubs"),
      card("7", "spades"),
      card("8", "diamonds"),
    ];

    expect(chooseProfileBidFromHand(hand, getBotProfile("main"), null)).toMatchObject({
      action: "bid",
      trump: "hearts",
      value: 80,
    });
  });

  it("opens 90 with jack-nine and one outside master trick", () => {
    const hand = [
      card("J", "hearts"),
      card("9", "hearts"),
      card("A", "hearts"),
      card("A", "clubs"),
      card("10", "clubs"),
      card("K", "diamonds"),
      card("8", "spades"),
      card("7", "spades"),
    ];

    expect(chooseProfileBidFromHand(hand, getBotProfile("main"), null)).toMatchObject({
      action: "bid",
      trump: "hearts",
      value: 90,
    });
  });

  it("opens 110 with jack-nine, two side trumps and two aces outside", () => {
    const hand = [
      card("J", "hearts"),
      card("9", "hearts"),
      card("A", "hearts"),
      card("10", "hearts"),
      card("A", "clubs"),
      card("A", "diamonds"),
      card("8", "spades"),
      card("7", "spades"),
    ];

    expect(chooseProfileBidFromHand(hand, getBotProfile("main"), null)).toMatchObject({
      action: "bid",
      trump: "hearts",
      value: 110,
    });
  });

  it("opens at least 120 with a strong bicolor hand", () => {
    const hand = [
      card("J", "hearts"),
      card("9", "hearts"),
      card("A", "hearts"),
      card("10", "hearts"),
      card("A", "clubs"),
      card("10", "clubs"),
      card("K", "clubs"),
      card("7", "spades"),
    ];

    const decision = chooseProfileBidFromHand(hand, getBotProfile("main"), null);

    expect(decision.action).toBe("bid");
    expect(decision.trump).toBe("hearts");
    expect((decision.value ?? 0) >= 120).toBe(true);
  });

  it("supports partner by adding 20 with a real trump basis", () => {
    const hand = [
      card("J", "hearts"),
      card("9", "hearts"),
      card("A", "hearts"),
      card("10", "hearts"),
      card("A", "clubs"),
      card("8", "clubs"),
      card("7", "spades"),
      card("8", "diamonds"),
    ];
    const state = createBiddingState(
      hand,
      [
        { playerId: 2, action: "bid", value: 90, trump: "hearts" },
        { playerId: 3, action: "pass" },
      ],
      0,
    );

    expect(chooseProfileBid(state, getBotProfile("main"))).toMatchObject({
      action: "bid",
      trump: "hearts",
      value: 110,
    });
  });

  it("supports a strong partner more firmly in a competitive sequence", () => {
    const hand = [
      card("J", "hearts"),
      card("9", "hearts"),
      card("A", "hearts"),
      card("10", "hearts"),
      card("A", "clubs"),
      card("8", "clubs"),
      card("7", "spades"),
      card("8", "diamonds"),
    ];
    const state = createBiddingState(
      hand,
      [
        { playerId: 1, action: "bid", value: 110, trump: "spades" },
        { playerId: 2, action: "bid", value: 120, trump: "hearts" },
        { playerId: 3, action: "pass" },
      ],
      0,
    );

    expect(chooseProfileBid(state, getBotProfile("main"))).toMatchObject({
      action: "bid",
      trump: "hearts",
      value: 140,
    });
  });

  it("stays prudent in competition with only a petit jeu", () => {
    const hand = [
      card("J", "hearts"),
      card("A", "hearts"),
      card("10", "hearts"),
      card("8", "hearts"),
      card("7", "clubs"),
      card("8", "clubs"),
      card("7", "spades"),
      card("8", "diamonds"),
    ];
    const state = createBiddingState(
      hand,
      [{ playerId: 1, action: "bid", value: 90, trump: "spades" }],
      0,
    );

    expect(chooseProfileBid(state, getBotProfile("main")).action).toBe("pass");
  });

  it("passes against a strong late opponent contract without a real trump basis", () => {
    const hand = [
      card("J", "hearts"),
      card("A", "hearts"),
      card("10", "hearts"),
      card("8", "hearts"),
      card("A", "clubs"),
      card("8", "clubs"),
      card("7", "spades"),
      card("8", "diamonds"),
    ];
    const state = createBiddingState(
      hand,
      [
        { playerId: 1, action: "bid", value: 100, trump: "clubs" },
        { playerId: 2, action: "bid", value: 110, trump: "hearts" },
        { playerId: 3, action: "bid", value: 120, trump: "spades" },
      ],
      0,
    );

    expect(chooseProfileBid(state, getBotProfile("main")).action).toBe("pass");
  });
});
