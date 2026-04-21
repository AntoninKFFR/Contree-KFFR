import { describe, expect, it } from "vitest";
import { getBotProfile } from "@/bots/profiles";
import { chooseBotBid } from "@/bots/simpleBot";
import { chooseProfileBidFromHand } from "@/bots/strategy/biddingStrategy";
import type { Card, GameState } from "@/engine/types";

function card(rank: Card["rank"], suit: Card["suit"]): Card {
  return { rank, suit };
}

describe("bot profiles", () => {
  it("lets an aggressive bot bid a hand that a prudent bot refuses", () => {
    const mediumHand = [
      card("J", "hearts"),
      card("8", "hearts"),
      card("A", "clubs"),
      card("8", "clubs"),
      card("7", "diamonds"),
      card("8", "diamonds"),
      card("9", "diamonds"),
      card("8", "spades"),
      card("7", "spades"),
    ];

    expect(chooseProfileBidFromHand(mediumHand, getBotProfile("prudent"), null).action).toBe(
      "pass",
    );
    expect(chooseProfileBidFromHand(mediumHand, getBotProfile("aggressive"), null).action).toBe(
      "bid",
    );
  });

  it("keeps profile settings ordered from safe to risky", () => {
    expect(getBotProfile("prudent").bidRisk).toBeLessThan(getBotProfile("balanced").bidRisk);
    expect(getBotProfile("aggressive").bidRisk).toBeGreaterThan(getBotProfile("balanced").bidRisk);
  });

  it("lets a bot surcontrer when its team has been contre and the hand is strong", () => {
    const state: GameState = {
      settings: { scoringMode: "made-points", targetScore: 1000 },
      phase: "bidding",
      roundNumber: 1,
      startingPlayerId: 0,
      totalScore: { 0: 0, 1: 0 },
      roundHistory: [],
      winnerTeam: null,
      trump: null,
      hands: {
        0: [],
        1: [],
        2: [
          card("J", "hearts"),
          card("9", "hearts"),
          card("A", "hearts"),
          card("10", "hearts"),
          card("K", "hearts"),
          card("A", "clubs"),
          card("A", "spades"),
          card("10", "diamonds"),
        ],
        3: [],
      },
      currentPlayerId: 2,
      currentTrick: { leaderId: 0, cards: [] },
      completedTricks: [],
      bids: [
        { playerId: 0, action: "bid", value: 80, trump: "hearts" },
        { playerId: 1, action: "coinche" },
      ],
      contract: null,
      result: null,
      trickPoints: { 0: 0, 1: 0 },
      roundScore: { 0: 0, 1: 0 },
      message: "Test",
    };

    expect(chooseBotBid(state)).toEqual({ action: "surcoinche" });
  });
});
