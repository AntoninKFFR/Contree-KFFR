import { describe, expect, it } from "vitest";
import { OFFICIAL_BOT_PROFILE_ID } from "@/bots/profiles";
import {
  HUMAN_DOCTRINE_V2_110,
  HUMAN_DOCTRINE_V2_NO110,
  buildAuctionDecisionContext,
  chooseHumanDoctrineV2Bid,
  evaluateIntrinsicHand,
} from "@/bots/strategy/humanDoctrineV2";
import type { Bid, Card, GameState, PlayerId, Suit } from "@/engine/types";
import { createHybridStrategy, findBotStrategy } from "@/simulation/botRegistry";

const c = (rank: Card["rank"], suit: Suit): Card => ({ rank, suit });

function stateWith(
  hand: Card[],
  bids: Bid[] = [],
  totalScore: GameState["totalScore"] = { 0: 0, 1: 0 },
  currentPlayerId: PlayerId = 0,
): GameState {
  return {
    settings: { scoringMode: "made-points", targetScore: 1000 },
    phase: "bidding",
    roundNumber: 1,
    startingPlayerId: 0,
    totalScore,
    roundHistory: [],
    winnerTeam: null,
    trump: null,
    hands: {
      0: currentPlayerId === 0 ? hand : [c("7", "clubs")],
      1: currentPlayerId === 1 ? hand : [c("8", "clubs")],
      2: currentPlayerId === 2 ? hand : [c("7", "diamonds")],
      3: currentPlayerId === 3 ? hand : [c("8", "diamonds")],
    },
    currentPlayerId,
    currentTrick: { leaderId: currentPlayerId, cards: [] },
    completedTricks: [],
    bids,
    contract: null,
    result: null,
    trickPoints: { 0: 0, 1: 0 },
    roundScore: { 0: 0, 1: 0 },
    message: "Human doctrine V2 test",
  };
}

const hundredHand = [
  c("J", "hearts"), c("9", "hearts"), c("7", "hearts"), c("A", "clubs"),
  c("10", "clubs"), c("K", "diamonds"), c("Q", "diamonds"), c("8", "spades"),
];

const strongHand = [
  c("J", "hearts"), c("9", "hearts"), c("A", "hearts"), c("10", "hearts"),
  c("A", "clubs"), c("A", "diamonds"), c("7", "spades"), c("8", "spades"),
];

describe("human doctrine V2 separation", () => {
  it("keeps intrinsic evaluation identical across public auctions", () => {
    const opening = chooseHumanDoctrineV2Bid(stateWith(hundredHand), HUMAN_DOCTRINE_V2_NO110);
    const overcall = chooseHumanDoctrineV2Bid(
      stateWith(hundredHand, [{ playerId: 1, action: "bid", value: 110, trump: "clubs" }]),
      HUMAN_DOCTRINE_V2_NO110,
    );

    expect(overcall.trace.intrinsic).toEqual(opening.trace.intrinsic);
    expect(overcall.trace.auction.context.currentContract?.value).toBe(110);
    expect(opening.trace.auction.context.currentContract).toBeNull();
  });

  it("keeps intrinsic strength identical across game scores while exposing score as context", () => {
    const neutral = chooseHumanDoctrineV2Bid(stateWith(hundredHand));
    const trailing = chooseHumanDoctrineV2Bid(stateWith(hundredHand, [], { 0: 0, 1: 600 }));

    expect(trailing.trace.intrinsic).toEqual(neutral.trace.intrinsic);
    expect(trailing.trace.auction.context.publicScore).toEqual({ 0: 0, 1: 600 });
  });

  it("allows auction decisions to differ without changing hand strength", () => {
    const opening = chooseHumanDoctrineV2Bid(stateWith(hundredHand));
    const blocked = chooseHumanDoctrineV2Bid(
      stateWith(hundredHand, [{ playerId: 1, action: "bid", value: 110, trump: "clubs" }]),
    );

    expect(opening.action).toBe("bid");
    expect(blocked.action).toBe("pass");
    expect(blocked.trace.auction.overcallDecision).toBe("pass-not-higher");
    expect(blocked.trace.intrinsic.desiredContract).toBe(opening.trace.intrinsic.desiredContract);
  });

  it("traces intrinsic components and the public auction decision separately", () => {
    const decision = chooseHumanDoctrineV2Bid(stateWith(hundredHand));

    expect(decision.trace.intrinsic.evaluation).toEqual(expect.objectContaining({
      legacyScore: expect.any(Number),
      structuralAdjustments: expect.any(Object),
      outsideControlAdjustments: expect.any(Object),
      intrinsicHandStrength: expect.any(Number),
    }));
    expect(decision.trace.auction.context).toEqual(expect.objectContaining({
      currentContract: null,
      currentContractTeam: null,
      legalNextBids: [80, 90, 100, 110, 120, 130, 140, 150, 160],
      publicBids: [],
    }));
    expect(decision.trace.auction.overcallDecision).toBe("open");
  });

  it("isolates 110 as the only difference between V2 bidding variants", () => {
    const state = stateWith(strongHand);
    const no110 = chooseHumanDoctrineV2Bid(state, HUMAN_DOCTRINE_V2_NO110);
    const with110 = chooseHumanDoctrineV2Bid(state, HUMAN_DOCTRINE_V2_110);

    expect(no110).toMatchObject({ action: "bid", value: 100 });
    expect(with110).toMatchObject({ action: "bid", value: 110 });
    expect(with110.trace.intrinsic.evaluation).toEqual(no110.trace.intrinsic.evaluation);
  });

  it("builds auction context from public data without affecting intrinsic evaluation", () => {
    const bids: Bid[] = [
      { playerId: 2, action: "bid", value: 80, trump: "hearts" },
      { playerId: 3, action: "bid", value: 90, trump: "clubs" },
    ];
    const state = stateWith(hundredHand, bids, { 0: 200, 1: 300 });
    const context = buildAuctionDecisionContext(state);

    expect(context).toMatchObject({
      currentContract: { value: 90, trump: "clubs", teamId: 1 },
      currentContractTeam: 1,
      partnerBid: { playerId: 2, value: 80, trump: "hearts" },
      publicScore: { 0: 200, 1: 300 },
    });
    expect(context.legalNextBids[0]).toBe(100);
    expect(evaluateIntrinsicHand(hundredHand, "hearts")).toEqual(
      chooseHumanDoctrineV2Bid(state).trace.intrinsic.evaluation,
    );
  });

  it("keeps intrinsic evaluation independent from a partner bid", () => {
    const withoutPartnerBid = chooseHumanDoctrineV2Bid(stateWith(hundredHand, [], { 0: 200, 1: 300 }, 2));
    const withPartnerBid = chooseHumanDoctrineV2Bid(stateWith(hundredHand, [
      { playerId: 0, action: "bid", value: 80, trump: "clubs" },
      { playerId: 1, action: "pass" },
    ], { 0: 200, 1: 300 }, 2));

    expect(withPartnerBid.trace.auction.context.partnerBid).toMatchObject({ playerId: 0, value: 80 });
    expect(withPartnerBid.trace.intrinsic).toEqual(withoutPartnerBid.trace.intrinsic);
  });

  it("is independent from hidden opponent hands", () => {
    const state = stateWith(hundredHand);
    const changed = {
      ...state,
      hands: { ...state.hands, 1: state.hands[3], 3: state.hands[1] },
    };
    expect(chooseHumanDoctrineV2Bid(changed)).toEqual(chooseHumanDoctrineV2Bid(state));
  });

  it("keeps both V2 variants experimental and the legacy hybrid official", () => {
    const no110 = createHybridStrategy("human_doctrine_v2_no110", "monte_carlo_v1", { status: "experimental" });
    const with110 = createHybridStrategy("human_doctrine_v2_110", "monte_carlo_v1", { status: "experimental" });

    expect(no110.status).toBe("experimental");
    expect(with110.status).toBe("experimental");
    expect(OFFICIAL_BOT_PROFILE_ID).toBe("hybrid_legacy_v1");
    expect(findBotStrategy(OFFICIAL_BOT_PROFILE_ID)).toMatchObject({
      status: "active",
      bidding: { kind: "legacy" },
      card: { kind: "monte-carlo-v1" },
    });
  });
});
