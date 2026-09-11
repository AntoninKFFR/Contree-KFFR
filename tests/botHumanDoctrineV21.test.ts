import { describe, expect, it } from "vitest";
import { OFFICIAL_BOT_PROFILE_ID } from "@/bots/profiles";
import {
  HUMAN_DOCTRINE_V2_1_AGGRESSIVE,
  HUMAN_DOCTRINE_V2_1_BALANCED,
  HUMAN_DOCTRINE_V2_1_CONSERVATIVE,
  analyzeAuctionContext,
  chooseHumanDoctrineV2Bid,
  classifyHandDependency,
  evaluateIntrinsicHand,
} from "@/bots/strategy/humanDoctrineV2";
import type { Bid, Card, GameState, PlayerId, Suit } from "@/engine/types";
import { findBotStrategy } from "@/simulation/botRegistry";

const c = (rank: Card["rank"], suit: Suit): Card => ({ rank, suit });
const policies = [HUMAN_DOCTRINE_V2_1_CONSERVATIVE, HUMAN_DOCTRINE_V2_1_BALANCED, HUMAN_DOCTRINE_V2_1_AGGRESSIVE];

function stateWith(hand: Card[], bids: Bid[] = [], startingPlayerId: PlayerId = 0): GameState {
  return {
    settings: { scoringMode: "ffb", targetScore: 1000 }, phase: "bidding", roundNumber: 1,
    startingPlayerId, totalScore: { 0: 0, 1: 0 }, roundHistory: [], winnerTeam: null, trump: null,
    hands: { 0: hand, 1: [c("7", "clubs")], 2: [c("8", "clubs")], 3: [c("7", "diamonds")] },
    currentPlayerId: 0, currentTrick: { leaderId: 0, cards: [] }, completedTricks: [], bids,
    contract: null, result: null, trickPoints: { 0: 0, 1: 0 }, roundScore: { 0: 0, 1: 0 }, message: "V2.1 test",
  };
}

const dependentJack = [
  c("J", "hearts"), c("7", "hearts"), c("8", "hearts"), c("K", "clubs"),
  c("Q", "clubs"), c("K", "diamonds"), c("Q", "diamonds"), c("7", "spades"),
];
const autonomousJack = [
  c("J", "hearts"), c("A", "hearts"), c("10", "hearts"), c("K", "hearts"), c("Q", "hearts"),
  c("A", "clubs"), c("A", "diamonds"), c("A", "spades"),
];
const dependentNine = [
  c("9", "hearts"), c("7", "hearts"), c("8", "hearts"), c("K", "clubs"),
  c("Q", "clubs"), c("K", "diamonds"), c("Q", "diamonds"), c("7", "spades"),
];
const thirtyFour = [
  c("J", "hearts"), c("9", "hearts"), c("A", "clubs"), c("10", "clubs"),
  c("K", "diamonds"), c("Q", "diamonds"), c("7", "spades"), c("8", "spades"),
];

describe("human doctrine V2.1 initiative", () => {
  it("classifies weak single-major hands as partner-dependent", () => {
    const state = stateWith(dependentJack);
    const analysis = classifyHandDependency(evaluateIntrinsicHand(dependentJack, "hearts"), analyzeAuctionContext(state), "selective-probe-balanced");
    expect(analysis.classification).toBe("partner-dependent");
    expect(analysis.autonomyScore).toBeLessThan(analysis.semiAutonomousThreshold);
  });

  it("classifies long single-major hands with several outside aces as autonomous", () => {
    const state = stateWith(autonomousJack);
    for (const policy of ["selective-probe-conservative", "selective-probe-balanced", "selective-probe-aggressive"] as const) {
      expect(classifyHandDependency(evaluateIntrinsicHand(autonomousJack, "hearts"), analyzeAuctionContext(state), policy).classification).toBe("autonomous");
    }
  });

  it("preserves an 80 probe for a partner-dependent jack-only opening", () => {
    for (const policy of policies) {
      const decision = chooseHumanDoctrineV2Bid(stateWith(dependentJack), policy);
      if (decision.action === "bid") expect(decision.value).toBe(80);
      expect(decision.trace.auction.handDependency?.classification).toBe("partner-dependent");
    }
  });

  it("preserves an 80 probe for a partner-dependent nine-only opening", () => {
    for (const policy of policies) {
      const decision = chooseHumanDoctrineV2Bid(stateWith(dependentNine), policy);
      if (decision.action === "bid") expect(decision.value).toBe(80);
      expect(decision.trace.auction.handDependency?.classification).toBe("partner-dependent");
    }
  });

  it("does not cap an autonomous jack-only opening at 80", () => {
    for (const policy of policies) {
      const decision = chooseHumanDoctrineV2Bid(stateWith(autonomousJack), policy);
      expect(decision.action).toBe("bid");
      if (decision.action === "bid") expect(decision.value).toBeGreaterThan(80);
      expect(decision.trace.auction.ceiling.openingCap).toBeNull();
    }
  });

  it("uses the competitive ceiling instead of the opening probe cap after an opponent bid", () => {
    const bids: Bid[] = [{ playerId: 1, action: "bid", value: 90, trump: "clubs" }];
    for (const policy of policies) {
      const decision = chooseHumanDoctrineV2Bid(stateWith(autonomousJack, bids), policy);
      expect(decision.trace.auction.context.auctionRole).toBe("competitive-overcall");
      expect(decision.action).toBe("bid");
      if (decision.action === "bid") expect(decision.value).toBeGreaterThan(90);
      expect(decision.trace.auction.ceiling.openingCap).toBeNull();
    }
  });

  it("keeps an ordinary 34 prudent without partner support", () => {
    for (const policy of policies) {
      expect(chooseHumanDoctrineV2Bid(stateWith(thirtyFour), policy)).toMatchObject({ action: "bid", value: 80, trump: "hearts" });
    }
  });

  it("still permits a partner-supported raise", () => {
    const bids: Bid[] = [
      { playerId: 0, action: "bid", value: 80, trump: "hearts" }, { playerId: 1, action: "pass" },
      { playerId: 2, action: "bid", value: 90, trump: "hearts" }, { playerId: 3, action: "pass" },
    ];
    const decision = chooseHumanDoctrineV2Bid(stateWith(dependentJack, bids), HUMAN_DOCTRINE_V2_1_BALANCED);
    expect(decision.trace.auction.partnerInference.supportKnown).toBe(true);
    if (decision.action === "bid") expect(decision.value).toBeGreaterThan(90);
  });

  it("remains invariant to hidden partner and opponent hands", () => {
    const state = stateWith(autonomousJack, [{ playerId: 1, action: "bid", value: 90, trump: "clubs" }]);
    const changed = { ...state, hands: { ...state.hands, 1: [c("J", "spades")], 2: [c("9", "spades")], 3: [c("A", "diamonds")] } };
    expect(chooseHumanDoctrineV2Bid(changed, HUMAN_DOCTRINE_V2_1_BALANCED)).toEqual(chooseHumanDoctrineV2Bid(state, HUMAN_DOCTRINE_V2_1_BALANCED));
  });

  it("registers all short variants as experimental MC V1 and leaves V1 official", () => {
    for (const id of ["human_doctrine_v2_1_conservative_mc_v1", "human_doctrine_v2_1_balanced_mc_v1", "human_doctrine_v2_1_aggressive_mc_v1"]) {
      expect(findBotStrategy(id)).toMatchObject({ status: "experimental", card: { kind: "monte-carlo-v1" } });
    }
    expect(OFFICIAL_BOT_PROFILE_ID).toBe("human_doctrine_v1_mc_v1");
  });
});
