import { describe, expect, it } from "vitest";
import { OFFICIAL_BOT_PROFILE_ID } from "@/bots/profiles";
import {
  HUMAN_DOCTRINE_V2_110,
  analyzeAuctionContext,
  chooseHumanDoctrineV2Bid,
  classifyTrumpStructure,
  evaluateIntrinsicHand,
} from "@/bots/strategy/humanDoctrineV2";
import type { Bid, Card, GameState, PlayerId, Suit } from "@/engine/types";
import { findBotStrategy } from "@/simulation/botRegistry";

const c = (rank: Card["rank"], suit: Suit): Card => ({ rank, suit });

function stateWith({
  hand,
  bids = [],
  currentPlayerId = 0,
  startingPlayerId = 0,
  hiddenHands,
}: {
  hand: Card[];
  bids?: Bid[];
  currentPlayerId?: PlayerId;
  startingPlayerId?: PlayerId;
  hiddenHands?: Partial<GameState["hands"]>;
}): GameState {
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
      1: currentPlayerId === 1 ? hand : [c("8", "clubs")],
      2: currentPlayerId === 2 ? hand : [c("7", "diamonds")],
      3: currentPlayerId === 3 ? hand : [c("8", "diamonds")],
      ...hiddenHands,
      [currentPlayerId]: hand,
    },
    currentPlayerId,
    currentTrick: { leaderId: currentPlayerId, cards: [] },
    completedTricks: [],
    bids,
    contract: null,
    result: null,
    trickPoints: { 0: 0, 1: 0 },
    roundScore: { 0: 0, 1: 0 },
    message: "Human doctrine V2 communication test",
  };
}

const jackOnlyStrong = [
  c("J", "hearts"), c("A", "hearts"), c("10", "hearts"), c("K", "hearts"),
  c("A", "clubs"), c("10", "clubs"), c("A", "diamonds"), c("7", "spades"),
];
const nineOnlyLong = [
  c("9", "hearts"), c("A", "hearts"), c("10", "hearts"), c("K", "hearts"), c("Q", "hearts"),
  c("A", "clubs"), c("10", "clubs"), c("7", "spades"),
];
const thirtyFour = [
  c("J", "hearts"), c("9", "hearts"), c("A", "clubs"), c("10", "clubs"),
  c("K", "diamonds"), c("Q", "diamonds"), c("7", "spades"), c("8", "spades"),
];
const jackNineThirdAce = [
  c("J", "hearts"), c("9", "hearts"), c("7", "hearts"), c("A", "clubs"),
  c("10", "clubs"), c("K", "diamonds"), c("Q", "diamonds"), c("8", "spades"),
];
const weakLongTrump = [
  c("A", "hearts"), c("10", "hearts"), c("K", "hearts"), c("Q", "hearts"), c("8", "hearts"),
  c("K", "clubs"), c("Q", "diamonds"), c("7", "spades"),
];
const strongLongControlled = [
  c("J", "hearts"), c("9", "hearts"), c("A", "hearts"), c("10", "hearts"),
  c("A", "clubs"), c("10", "clubs"), c("A", "diamonds"), c("7", "spades"),
];

describe("human doctrine V2 communicative bidding", () => {
  it("caps a strong jack-only first message at 80 instead of converting strength into 110", () => {
    const decision = chooseHumanDoctrineV2Bid(stateWith({ hand: jackOnlyStrong }));
    expect(decision).toMatchObject({ action: "bid", value: 80, trump: "hearts" });
    expect(decision.trace.auction).toMatchObject({ intent: "probing-major-trump", ceiling: { openingCap: 80 } });
  });

  it("uses a prudent probing bid for a long nine-only suit without partner support", () => {
    const decision = chooseHumanDoctrineV2Bid(stateWith({ hand: nineOnlyLong }));
    expect(decision).toMatchObject({ action: "bid", value: 80, trump: "hearts" });
    expect(decision.trace.intrinsic.evaluation.trumpStructure).toMatchObject({ hasNineOnly: true, trumpCount: 5 });
  });

  it("allows a jack-only bidder to raise after public same-suit partner support", () => {
    const bids: Bid[] = [
      { playerId: 0, action: "bid", value: 80, trump: "hearts" },
      { playerId: 1, action: "pass" },
      { playerId: 2, action: "bid", value: 90, trump: "hearts" },
      { playerId: 3, action: "pass" },
    ];
    const decision = chooseHumanDoctrineV2Bid(stateWith({ hand: jackOnlyStrong, bids }));
    expect(decision.action).toBe("bid");
    if (decision.action === "bid") expect(decision.value).toBeGreaterThan(90);
    expect(decision.trace.auction).toMatchObject({ intent: "partner-supported-rebid", partnerInference: { inferredOtherMajor: "likely" } });
  });

  it("reevaluates a nine-only probing opening after partner support", () => {
    const bids: Bid[] = [
      { playerId: 0, action: "bid", value: 80, trump: "hearts" },
      { playerId: 1, action: "pass" },
      { playerId: 2, action: "bid", value: 90, trump: "hearts" },
      { playerId: 3, action: "pass" },
    ];
    const decision = chooseHumanDoctrineV2Bid(stateWith({ hand: nineOnlyLong, bids }));
    expect(decision.action).toBe("bid");
    if (decision.action === "bid") expect(decision.value).toBeGreaterThan(90);
    expect(decision.trace.auction.ceiling.openingCap).toBeNull();
  });

  it("keeps exactly J+9 with two trumps at a prudent 80 opening", () => {
    const decision = chooseHumanDoctrineV2Bid(stateWith({ hand: thirtyFour }));
    expect(decision).toMatchObject({ action: "bid", value: 80, trump: "hearts" });
    expect(decision.trace.intrinsic.evaluation.trumpStructure).toMatchObject({ hasBoth: true, trumpCount: 2 });
  });

  it("values J+9 plus a third trump and an outside ace above the bare 34", () => {
    const richer = evaluateIntrinsicHand(jackNineThirdAce, "hearts");
    const bare = evaluateIntrinsicHand(thirtyFour, "hearts");
    expect(richer.structure).toBe("jack-nine-third");
    expect(richer.trumpQuantity).toBe(3);
    expect(richer.intrinsicHandStrength).toBeGreaterThan(bare.intrinsicHandStrength);
  });

  it("distinguishes partance from a later position for J+9+third+outside ace", () => {
    const atPartance = chooseHumanDoctrineV2Bid(stateWith({ hand: jackNineThirdAce, startingPlayerId: 0 }));
    const withoutPartance = chooseHumanDoctrineV2Bid(stateWith({ hand: jackNineThirdAce, startingPlayerId: 3 }));
    expect(atPartance).toMatchObject({ action: "bid", value: 100, trump: "hearts" });
    expect(withoutPartance).toMatchObject({ action: "bid", value: 90, trump: "hearts" });
    expect(atPartance.trace.intrinsic.evaluation).toEqual(withoutPartance.trace.intrinsic.evaluation);
  });

  it("does not turn mediocre trump quantity alone into a large opening", () => {
    const decision = chooseHumanDoctrineV2Bid(stateWith({ hand: weakLongTrump }));
    expect(classifyTrumpStructure(weakLongTrump, "hearts").label).toBe("weak-long-trump");
    if (decision.action === "bid" && decision.trump === "hearts") expect(decision.value).toBeLessThanOrEqual(80);
  });

  it("permits a large bid with strong long trump and outside controls", () => {
    const decision = chooseHumanDoctrineV2Bid(stateWith({ hand: strongLongControlled }));
    expect(decision.action).toBe("bid");
    if (decision.action === "bid") expect(decision.value).toBeGreaterThanOrEqual(100);
    expect(decision.trace.intrinsic.evaluation.outsideControlCount).toBeGreaterThan(0);
  });

  it("responds coherently rather than redundantly when partner already named the same suit", () => {
    const bids: Bid[] = [
      { playerId: 2, action: "bid", value: 80, trump: "hearts" },
      { playerId: 3, action: "pass" },
    ];
    const decision = chooseHumanDoctrineV2Bid(stateWith({ hand: strongLongControlled, bids, currentPlayerId: 0 }));
    expect(decision.trace.auction.context.auctionRole).toBe("response");
    expect(decision.trace.auction.partnerInference.supportKnown).toBe(true);
    if (decision.action === "bid") {
      expect(decision.trump).toBe("hearts");
      expect(decision.value).toBeGreaterThan(80);
    }
  });

  it("keeps intrinsic evaluation unchanged while an opponent bid changes the auction action", () => {
    const opening = chooseHumanDoctrineV2Bid(stateWith({ hand: jackNineThirdAce }));
    const opposed = chooseHumanDoctrineV2Bid(stateWith({
      hand: jackNineThirdAce,
      bids: [{ playerId: 1, action: "bid", value: 100, trump: "clubs" }],
    }));
    expect(opposed.trace.evaluations).toEqual(opening.trace.evaluations);
    expect(opposed.action).toBe("pass");
    expect(opposed.trace.auction.context.auctionRole).toBe("competitive-overcall");
  });

  it("is invariant to every hidden hand, including the partner's real cards", () => {
    const state = stateWith({
      hand: jackOnlyStrong,
      bids: [{ playerId: 2, action: "bid", value: 80, trump: "hearts" }],
    });
    const changed = {
      ...state,
      hands: {
        ...state.hands,
        1: [c("A", "spades"), c("10", "spades")],
        2: [c("J", "spades"), c("9", "spades")],
        3: [c("A", "diamonds"), c("10", "diamonds")],
      },
    };
    expect(chooseHumanDoctrineV2Bid(changed)).toEqual(chooseHumanDoctrineV2Bid(state));
  });

  it("exposes position, intent, controls, missing-points ceiling and public-only inference", () => {
    const decision = chooseHumanDoctrineV2Bid(stateWith({ hand: jackOnlyStrong }));
    expect(decision.trace).toEqual(expect.objectContaining({
      evaluations: expect.any(Array),
      intrinsic: { evaluation: expect.objectContaining({ outsideControls: expect.any(Array), estimatedMissingHighPoints: expect.any(Number) }), desiredContract: expect.any(Number), desiredTrump: "hearts" },
      auction: expect.objectContaining({
        context: expect.objectContaining({ biddingPosition: "first", isPartance: true, publicBids: [] }),
        partnerInference: expect.objectContaining({ source: "public-auction-only", supportKnown: false }),
        intent: "probing-major-trump",
        ceiling: expect.objectContaining({ openingCap: 80 }),
        reason: expect.any(String),
      }),
    }));
  });

  it("registers the communication variant as experimental with MC V1 while V3 is official", () => {
    expect(findBotStrategy("human_doctrine_v2_comm_mc_v1")).toMatchObject({
      status: "experimental",
      bidding: { kind: "human-doctrine-v2", options: { allow110: true, communication: true } },
      card: { kind: "monte-carlo-v1" },
    });
    expect(OFFICIAL_BOT_PROFILE_ID).toBe("human_doctrine_v3_1_conversation_mc_v1");
    expect(analyzeAuctionContext(stateWith({ hand: jackOnlyStrong })).publicBids).toEqual([]);
  });

  it("keeps the historical V2 threshold variant distinct from the communication experiment", () => {
    const communicative = chooseHumanDoctrineV2Bid(stateWith({ hand: jackOnlyStrong }));
    const historical = chooseHumanDoctrineV2Bid(stateWith({ hand: jackOnlyStrong }), HUMAN_DOCTRINE_V2_110);
    expect(communicative).toMatchObject({ action: "bid", value: 80 });
    expect(historical).toMatchObject({ action: "bid", value: 110 });
    expect(HUMAN_DOCTRINE_V2_110.communication).toBe(false);
  });
});
