import { describe, expect, it } from "vitest";
import { EXPERIMENTAL_BOT_PROFILE_IDS, getBotProfile, OFFICIAL_BOT_PROFILE_ID } from "@/bots/profiles";
import { chooseBotBid } from "@/bots/simpleBot";
import { findBotStrategy } from "@/simulation/botRegistry";
import { chooseProfileBid, chooseProfileBidFromHand } from "@/bots/strategy/biddingStrategy";
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

    expect(chooseProfileBid(state, getBotProfile("main")).action).toBe("surcoinche");
    expect(chooseBotBid(state)).toEqual({ action: "pass" });
  });

  it("promotes the measured hybrid champion while keeping V3 experimental", () => {
    expect(EXPERIMENTAL_BOT_PROFILE_IDS).toContain("main_montecarlo_v3");
    expect(EXPERIMENTAL_BOT_PROFILE_IDS).toContain("main_montecarlo_v3_1");
    expect(EXPERIMENTAL_BOT_PROFILE_IDS).not.toContain("hybrid_legacy_v1");
    expect(OFFICIAL_BOT_PROFILE_ID).toBe("hybrid_legacy_v1");
  });

  it("registers only the three permanent hybrid finalists", () => {
    expect(EXPERIMENTAL_BOT_PROFILE_IDS).toEqual(expect.arrayContaining([
      "hybrid_legacy_v2",
      "hybrid_legacy_v3",
    ]));
    expect(findBotStrategy("hybrid_legacy_v1")).toMatchObject({
      status: "active",
      bidding: { kind: "legacy" },
      card: { kind: "monte-carlo-v1" },
    });
  });
});
