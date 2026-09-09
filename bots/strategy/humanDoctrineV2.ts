import { getAvailableBidValues } from "@/engine/bidding";
import { getCurrentContract } from "@/engine/game";
import { playerTeam } from "@/engine/rules";
import type { Bid, BidValue, Contract, GameState, PlayerId, Suit, TeamId } from "@/engine/types";
import {
  HUMAN_DOCTRINE_DEFAULT_OPTIONS,
  evaluateHumanDoctrineHand,
  type HumanDoctrineAdjustments,
  type HumanTrumpStructure,
} from "@/bots/strategy/humanDoctrine";

export type IntrinsicHandEvaluation = {
  trump: Suit;
  structure: HumanTrumpStructure;
  trumpQuality: number;
  trumpQuantity: number;
  trumpControl: "none" | "fragile" | "partial" | "strong";
  outsideAces: number;
  outsideTens: number;
  protectedOutsideTens: number;
  longOutsideSuits: Suit[];
  singletonSuits: Suit[];
  voidSuits: Suit[];
  vulnerableToCuts: Suit[];
  legacyScore: number;
  structuralAdjustments: Pick<HumanDoctrineAdjustments, "dryNine" | "thirtyFour" | "jackNineThird" | "longTrump">;
  outsideControlAdjustments: Pick<HumanDoctrineAdjustments, "outsideAces" | "protectedTens">;
  shapeAdjustments: Pick<HumanDoctrineAdjustments, "longSuits" | "voids" | "vulnerableToCuts">;
  intrinsicHandStrength: number;
};

export type AuctionDecisionContext = {
  playerId: PlayerId;
  playerTeam: TeamId;
  currentContract: Contract | null;
  currentContractTeam: TeamId | null;
  publicBids: Bid[];
  legalNextBids: BidValue[];
  positionFromDealer: number;
  partnerBid: Extract<Bid, { action: "bid" }> | null;
  publicScore: Record<TeamId, number>;
};

export type HumanDoctrineV2Options = {
  allow110: boolean;
};

export const HUMAN_DOCTRINE_V2_NO110: HumanDoctrineV2Options = { allow110: false };
export const HUMAN_DOCTRINE_V2_110: HumanDoctrineV2Options = { allow110: true };

export type HumanDoctrineV2Trace = {
  intrinsic: {
    evaluation: IntrinsicHandEvaluation;
    desiredContract: BidValue | null;
    desiredTrump: Suit;
  };
  auction: {
    context: AuctionDecisionContext;
    overcallDecision: "open" | "raise" | "pass-insufficient" | "pass-not-higher" | "pass-blocked";
    finalAction: { action: "pass" } | { action: "bid"; value: BidValue; trump: Suit };
  };
};

export type HumanDoctrineV2Decision = HumanDoctrineV2Trace["auction"]["finalAction"] & {
  trace: HumanDoctrineV2Trace;
};

const INTRINSIC_OPTIONS = {
  ...HUMAN_DOCTRINE_DEFAULT_OPTIONS,
  partnerSupport: false,
  opponentContractPenalty: false,
  scoreGapAdjustment: false,
};

export function evaluateIntrinsicHand(hand: GameState["hands"][PlayerId], trump: Suit): IntrinsicHandEvaluation {
  const evaluation = evaluateHumanDoctrineHand(hand, trump, INTRINSIC_OPTIONS);
  return {
    trump,
    structure: evaluation.structure,
    trumpQuality: evaluation.trumpQuality,
    trumpQuantity: evaluation.trumpQuantity,
    trumpControl: evaluation.trumpControl,
    outsideAces: evaluation.outsideAces,
    outsideTens: evaluation.outsideTens,
    protectedOutsideTens: evaluation.protectedOutsideTens,
    longOutsideSuits: [...evaluation.longOutsideSuits],
    singletonSuits: [...evaluation.singletonSuits],
    voidSuits: [...evaluation.voidSuits],
    vulnerableToCuts: [...evaluation.vulnerableToCuts],
    legacyScore: evaluation.legacyScore,
    structuralAdjustments: {
      dryNine: evaluation.adjustments.dryNine,
      thirtyFour: evaluation.adjustments.thirtyFour,
      jackNineThird: evaluation.adjustments.jackNineThird,
      longTrump: evaluation.adjustments.longTrump,
    },
    outsideControlAdjustments: {
      outsideAces: evaluation.adjustments.outsideAces,
      protectedTens: evaluation.adjustments.protectedTens,
    },
    shapeAdjustments: {
      longSuits: evaluation.adjustments.longSuits,
      voids: evaluation.adjustments.voids,
      vulnerableToCuts: evaluation.adjustments.vulnerableToCuts,
    },
    intrinsicHandStrength: evaluation.intrinsicScore,
  };
}

function lastPartnerBid(state: GameState): Extract<Bid, { action: "bid" }> | null {
  const team = playerTeam(state.currentPlayerId);
  for (let index = state.bids.length - 1; index >= 0; index -= 1) {
    const bid = state.bids[index];
    if (bid.action === "bid" && bid.playerId !== state.currentPlayerId && playerTeam(bid.playerId) === team) {
      return { ...bid };
    }
  }
  return null;
}

export function buildAuctionDecisionContext(state: GameState): AuctionDecisionContext {
  const currentContract = getCurrentContract(state);
  return {
    playerId: state.currentPlayerId,
    playerTeam: playerTeam(state.currentPlayerId),
    currentContract: currentContract ? { ...currentContract } : null,
    currentContractTeam: currentContract?.teamId ?? null,
    publicBids: state.bids.map((bid) => ({ ...bid })),
    legalNextBids: getAvailableBidValues(currentContract),
    positionFromDealer: (state.currentPlayerId - state.startingPlayerId + 4) % 4,
    partnerBid: lastPartnerBid(state),
    publicScore: { ...state.totalScore },
  };
}

function desiredContract(evaluation: IntrinsicHandEvaluation, allow110: boolean): BidValue | null {
  const score = evaluation.intrinsicHandStrength;
  let desired: BidValue | null = score < 60 ? null : score < 76 ? 80 : score < 94 ? 90 : 100;
  if (allow110 && score >= 125) desired = 110;
  if (evaluation.structure === "dry-nine" && evaluation.outsideAces === 0) desired = null;
  if (
    evaluation.structure === "thirty-four"
    && evaluation.outsideAces === 0
    && evaluation.protectedOutsideTens === 0
    && desired
    && desired > 80
  ) {
    desired = 80;
  }
  return desired;
}

export function chooseHumanDoctrineV2Bid(
  state: GameState,
  options: HumanDoctrineV2Options = HUMAN_DOCTRINE_V2_NO110,
): HumanDoctrineV2Decision {
  if (state.phase !== "bidding") throw new Error("Human doctrine V2 requires the bidding phase.");
  const hand = state.hands[state.currentPlayerId];
  const evaluations = (["clubs", "diamonds", "hearts", "spades"] as Suit[])
    .map((trump) => evaluateIntrinsicHand(hand, trump))
    .sort((first, second) => second.intrinsicHandStrength - first.intrinsicHandStrength);
  const best = evaluations[0];
  const desired = desiredContract(best, options.allow110);
  const context = buildAuctionDecisionContext(state);

  let finalAction: HumanDoctrineV2Trace["auction"]["finalAction"] = { action: "pass" };
  let overcallDecision: HumanDoctrineV2Trace["auction"]["overcallDecision"] = "pass-insufficient";
  if (desired) {
    if (!context.currentContract) {
      finalAction = { action: "bid", value: desired, trump: best.trump };
      overcallDecision = "open";
    } else if (context.currentContract.status !== "normal") {
      overcallDecision = "pass-blocked";
    } else if (desired <= context.currentContract.value) {
      overcallDecision = "pass-not-higher";
    } else if (context.legalNextBids.includes(desired)) {
      finalAction = { action: "bid", value: desired, trump: best.trump };
      overcallDecision = "raise";
    }
  }

  const trace: HumanDoctrineV2Trace = {
    intrinsic: { evaluation: best, desiredContract: desired, desiredTrump: best.trump },
    auction: { context, overcallDecision, finalAction },
  };
  return { ...finalAction, trace } as HumanDoctrineV2Decision;
}
