import { describe, expect, it } from "vitest";
import { OFFICIAL_BOT_PROFILE_ID } from "@/bots/profiles";
import { chooseBotBid } from "@/bots/simpleBot";
import { chooseHumanDoctrineV31Bid } from "@/bots/strategy/humanDoctrineV31";
import type { Bid, Card, GameState, PlayerId, Suit } from "@/engine/types";
import { findBotStrategy } from "@/simulation/botRegistry";

const c = (rank: Card["rank"], suit: Suit): Card => ({ rank, suit });

function stateWith(
  hand: Card[],
  bids: Bid[] = [],
  currentPlayerId: PlayerId = 0,
  startingPlayerId: PlayerId = 0,
): GameState {
  return {
    settings: { scoringMode: "ffb", targetScore: 1000 },
    phase: "bidding",
    roundNumber: 1,
    startingPlayerId,
    totalScore: { 0: 0, 1: 0 },
    roundHistory: [],
    winnerTeam: null,
    trump: null,
    hands: {
      0: currentPlayerId === 0 ? hand : [c("7", "clubs")],
      1: [c("8", "clubs")],
      2: [c("7", "diamonds")],
      3: currentPlayerId === 3 ? hand : [c("8", "diamonds")],
    },
    currentPlayerId,
    currentTrick: { leaderId: startingPlayerId, cards: [] },
    completedTricks: [],
    bids,
    contract: null,
    result: null,
    trickPoints: { 0: 0, 1: 0 },
    roundScore: { 0: 0, 1: 0 },
    message: "Auction Doctrine V3.1 test",
  };
}

const supportedRebidBids: Bid[] = [
  { playerId: 1, action: "bid", value: 80, trump: "clubs" },
  { playerId: 0, action: "bid", value: 90, trump: "diamonds" },
  { playerId: 3, action: "pass" },
  { playerId: 2, action: "bid", value: 100, trump: "diamonds" },
  { playerId: 1, action: "pass" },
];

describe("Auction Doctrine V3.1 targeted refinements", () => {
  it("A: passes with only nine-ten doubleton and no outside control", () => {
    const hand = [
      c("9", "diamonds"), c("10", "diamonds"),
      c("7", "hearts"), c("8", "hearts"), c("7", "spades"),
      c("8", "spades"), c("7", "clubs"), c("8", "clubs"),
    ];
    const decision = chooseHumanDoctrineV31Bid(stateWith(hand));

    expect(decision.action).toBe("pass");
    expect(decision.trace.reason).toMatch(/Deux atouts/);
  });

  it("B: keeps an 80 probe available with three trumps and a nine", () => {
    const hand = [
      c("9", "diamonds"), c("A", "diamonds"), c("7", "diamonds"),
      c("K", "hearts"), c("Q", "hearts"), c("Q", "spades"),
      c("K", "clubs"), c("8", "clubs"),
    ];
    expect(chooseHumanDoctrineV31Bid(stateWith(hand))).toMatchObject({
      action: "bid",
      value: 80,
      trump: "diamonds",
    });
  });

  it("C: caps the observed strong first club message at 100", () => {
    const hand = [
      c("J", "clubs"), c("9", "clubs"), c("10", "clubs"),
      c("A", "hearts"), c("10", "hearts"),
      c("J", "spades"), c("9", "spades"), c("7", "diamonds"),
    ];
    const decision = chooseHumanDoctrineV31Bid(stateWith(hand));

    expect(decision).toMatchObject({ action: "bid", value: 100, trump: "clubs" });
    expect(decision.trace.firstMessageCeiling).toBe(100);
  });

  it("D: still allows an exceptional hand to open at 110", () => {
    const hand = [
      c("J", "diamonds"), c("9", "diamonds"), c("A", "diamonds"), c("K", "diamonds"), c("Q", "diamonds"),
      c("A", "hearts"), c("A", "clubs"), c("K", "spades"),
    ];
    const decision = chooseHumanDoctrineV31Bid(stateWith(hand));

    expect(decision).toMatchObject({ action: "bid", value: 110, trump: "diamonds" });
    expect(decision.trace.firstMessageCeiling).toBe(110);
  });

  it("E/G: expresses at least 120 after a same-suit strong fit confirms a monster", () => {
    const hand = [
      c("J", "diamonds"), c("9", "diamonds"), c("A", "diamonds"), c("K", "diamonds"), c("Q", "diamonds"),
      c("A", "hearts"), c("10", "hearts"), c("K", "spades"),
    ];
    const decision = chooseHumanDoctrineV31Bid(stateWith(hand, supportedRebidBids));

    expect(decision.action).toBe("bid");
    if (decision.action === "bid") {
      expect(decision.trump).toBe("diamonds");
      expect(decision.value).toBeGreaterThanOrEqual(120);
    }
    expect(decision.trace).toMatchObject({
      partnerFit: "strong-fit",
      dependency: "autonomous",
      trumpFoundation: "controlled-long",
      rebidCeiling: 130,
      minimalUsefulBid: 110,
      fitEscalation: "strong",
      selectedRebidStep: 120,
    });
  });

  it("F: does not inflate a weak strong-fit hand above the minimum", () => {
    const hand = [
      c("J", "diamonds"), c("9", "diamonds"),
      c("7", "hearts"), c("8", "hearts"), c("7", "spades"),
      c("8", "spades"), c("7", "clubs"), c("8", "clubs"),
    ];
    const decision = chooseHumanDoctrineV31Bid(stateWith(hand, supportedRebidBids));

    if (decision.action === "bid") expect(decision.value).toBeLessThanOrEqual(110);
    expect(decision.trace.fitEscalation).not.toBe("strong");
  });

  it("preserves progression after support without ever forcing capot", () => {
    const hand = [
      c("J", "hearts"), c("9", "hearts"), c("A", "hearts"), c("K", "hearts"),
      c("A", "clubs"), c("10", "clubs"), c("K", "spades"), c("7", "diamonds"),
    ];
    const bids: Bid[] = [
      { playerId: 0, action: "bid", value: 90, trump: "hearts" },
      { playerId: 1, action: "pass" },
      { playerId: 2, action: "bid", value: 110, trump: "hearts" },
      { playerId: 3, action: "pass" },
    ];
    const decision = chooseHumanDoctrineV31Bid(stateWith(hand, bids));

    expect(decision.action).toBe("bid");
    if (decision.action === "bid") expect(decision.value).toBeGreaterThanOrEqual(120);
  });

  it("is the official bidding strategy while retaining Monte Carlo V1 cards", () => {
    const hand = [
      c("9", "diamonds"), c("10", "diamonds"),
      c("7", "hearts"), c("8", "hearts"), c("7", "spades"),
      c("8", "spades"), c("7", "clubs"), c("8", "clubs"),
    ];
    const state = stateWith(hand);

    expect(OFFICIAL_BOT_PROFILE_ID).toBe("human_doctrine_v3_1_conversation_mc_v1");
    expect(findBotStrategy(OFFICIAL_BOT_PROFILE_ID)).toMatchObject({
      status: "active",
      bidding: { kind: "human-doctrine-v3-1" },
      card: { kind: "monte-carlo-v1" },
    });
    expect(chooseBotBid(state)).toEqual({ action: "pass" });
  });
});
