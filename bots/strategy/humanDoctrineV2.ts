import { SUITS } from "@/engine/cards";
import { getAvailableBidValues } from "@/engine/bidding";
import { getCurrentContract } from "@/engine/game";
import { playerTeam } from "@/engine/rules";
import type { Bid, BidValue, Card, Contract, GameState, PlayerId, Suit, TeamId } from "@/engine/types";
import { HUMAN_DOCTRINE_DEFAULT_OPTIONS, evaluateHumanDoctrineHand, type HumanDoctrineAdjustments } from "@/bots/strategy/humanDoctrine";

export type CommunicativeTrumpStructure = "jack-only" | "nine-only" | "thirty-four" | "jack-nine-third" | "strong-long-trump" | "weak-long-trump" | "ordinary";
export type TrumpStructureAnalysis = {
  label: CommunicativeTrumpStructure;
  hasJack: boolean;
  hasNine: boolean;
  hasBoth: boolean;
  hasJackOnly: boolean;
  hasNineOnly: boolean;
  trumpCount: number;
  quality: "weak" | "single-major" | "two-majors" | "controlled";
};
export type OutsideSuitControl = {
  suit: Suit;
  length: number;
  hasAce: boolean;
  hasTen: boolean;
  classification: "void" | "singleton-ace" | "ace-ten-protected" | "ace-control" | "unprotected-ten" | "long-no-control" | "none";
};
export type IntrinsicHandEvaluation = {
  trump: Suit;
  structure: CommunicativeTrumpStructure;
  trumpStructure: TrumpStructureAnalysis;
  trumpQuality: number;
  trumpQuantity: number;
  trumpControl: "none" | "fragile" | "partial" | "strong";
  outsideAces: number;
  outsideTens: number;
  protectedOutsideTens: number;
  outsideControls: OutsideSuitControl[];
  outsideControlCount: number;
  longOutsideSuits: Suit[];
  singletonSuits: Suit[];
  voidSuits: Suit[];
  vulnerableToCuts: Suit[];
  legacyScore: number;
  structuralAdjustments: Pick<HumanDoctrineAdjustments, "dryNine" | "thirtyFour" | "jackNineThird" | "longTrump">;
  outsideControlAdjustments: Pick<HumanDoctrineAdjustments, "outsideAces" | "protectedTens">;
  shapeAdjustments: Pick<HumanDoctrineAdjustments, "longSuits" | "voids" | "vulnerableToCuts">;
  intrinsicHandStrength: number;
  estimatedMissingHighPoints: number;
};

export type BiddingPosition = "first" | "second" | "third" | "fourth";
export type AuctionRole = "opening" | "response" | "rebid" | "competitive-overcall";
export type AuctionDecisionContext = {
  playerId: PlayerId;
  playerTeam: TeamId;
  currentContract: Contract | null;
  currentContractTeam: TeamId | null;
  publicBids: Bid[];
  legalNextBids: BidValue[];
  positionFromStart: number;
  positionFromDealer: number;
  biddingPosition: BiddingPosition;
  isPartance: boolean;
  partnerBid: Extract<Bid, { action: "bid" }> | null;
  partnerBids: Array<Extract<Bid, { action: "bid" }>>;
  ownBids: Array<Extract<Bid, { action: "bid" }>>;
  opponentBids: Array<Extract<Bid, { action: "bid" }>>;
  auctionRole: AuctionRole;
  publicScore: Record<TeamId, number>;
};
export type PartnerInformation = {
  source: "public-auction-only";
  hasBid: boolean;
  hasBidSameSuit: boolean;
  supportKnown: boolean;
  supportedSuit: Suit | null;
  lastBidValue: BidValue | null;
  inferredOtherMajor: "none" | "possible" | "likely";
  inferredLength: "unknown" | "possible" | "likely";
  inferredOutsideControls: "unknown" | "possible";
};
export type AuctionIntent = "probing-major-trump" | "showing-strong-trump" | "showing-length" | "partner-support" | "partner-supported-rebid" | "competitive-overcall" | "natural-strength";
export type BidCeiling = {
  value: BidValue | null;
  intrinsicValue: BidValue | null;
  openingCap: BidValue | null;
  partnerSupportBonus: number;
  positionAdjustment: number;
  estimatedMissingHighPoints: number;
  reasons: string[];
};
export type HumanDoctrineV2Options = { allow110: boolean; communication?: boolean };
export const HUMAN_DOCTRINE_V2_NO110: HumanDoctrineV2Options = { allow110: false, communication: false };
export const HUMAN_DOCTRINE_V2_110: HumanDoctrineV2Options = { allow110: true, communication: false };
export const HUMAN_DOCTRINE_V2_COMMUNICATION: HumanDoctrineV2Options = { allow110: true, communication: true };

export type HumanDoctrineV2Trace = {
  evaluations: IntrinsicHandEvaluation[];
  intrinsic: { evaluation: IntrinsicHandEvaluation; desiredContract: BidValue | null; desiredTrump: Suit };
  auction: {
    context: AuctionDecisionContext;
    partnerInference: PartnerInformation;
    intent: AuctionIntent;
    ceiling: BidCeiling;
    overcallDecision: "open" | "raise" | "pass-insufficient" | "pass-not-higher" | "pass-blocked";
    finalAction: { action: "pass" } | { action: "bid"; value: BidValue; trump: Suit };
    reason: string;
  };
};
export type HumanDoctrineV2Decision = HumanDoctrineV2Trace["auction"]["finalAction"] & { trace: HumanDoctrineV2Trace };

const INTRINSIC_OPTIONS = { ...HUMAN_DOCTRINE_DEFAULT_OPTIONS, partnerSupport: false, opponentContractPenalty: false, scoreGapAdjustment: false };
const BID_VALUES_TO_110: BidValue[] = [80, 90, 100, 110];

function suitCards(hand: Card[], suit: Suit): Card[] { return hand.filter((card) => card.suit === suit); }

export function classifyTrumpStructure(hand: Card[], trump: Suit): TrumpStructureAnalysis {
  const trumps = suitCards(hand, trump);
  const hasJack = trumps.some((card) => card.rank === "J");
  const hasNine = trumps.some((card) => card.rank === "9");
  const hasBoth = hasJack && hasNine;
  const hasJackOnly = hasJack && !hasNine;
  const hasNineOnly = hasNine && !hasJack;
  let label: CommunicativeTrumpStructure = "ordinary";
  if (hasJackOnly) label = "jack-only";
  else if (hasNineOnly) label = "nine-only";
  else if (hasBoth && trumps.length === 2) label = "thirty-four";
  else if (hasBoth && trumps.length === 3) label = "jack-nine-third";
  else if (hasBoth && trumps.length >= 4) label = "strong-long-trump";
  else if (!hasJack && !hasNine && trumps.length >= 4) label = "weak-long-trump";
  return {
    label, hasJack, hasNine, hasBoth, hasJackOnly, hasNineOnly, trumpCount: trumps.length,
    quality: hasBoth && trumps.length >= 3 ? "controlled" : hasBoth ? "two-majors" : hasJack || hasNine ? "single-major" : "weak",
  };
}

function outsideSuitControl(hand: Card[], suit: Suit): OutsideSuitControl {
  const cards = suitCards(hand, suit);
  const hasAce = cards.some((card) => card.rank === "A");
  const hasTen = cards.some((card) => card.rank === "10");
  let classification: OutsideSuitControl["classification"] = "none";
  if (cards.length === 0) classification = "void";
  else if (hasAce && hasTen) classification = "ace-ten-protected";
  else if (hasAce && cards.length === 1) classification = "singleton-ace";
  else if (hasAce) classification = "ace-control";
  else if (hasTen) classification = "unprotected-ten";
  else if (cards.length >= 3) classification = "long-no-control";
  return { suit, length: cards.length, hasAce, hasTen, classification };
}

function estimateMissingHighPoints(controls: OutsideSuitControl[], structure: TrumpStructureAnalysis): number {
  const raw = controls.reduce((sum, control) => {
    const missingAceRisk = control.hasAce ? 0 : control.length >= 2 ? 8 : 4;
    const missingTenRisk = control.hasTen ? 0 : control.hasAce ? 3 : control.length >= 2 ? 6 : 3;
    const exposedTenRisk = control.hasTen && !control.hasAce ? 5 : 0;
    return sum + missingAceRisk + missingTenRisk + exposedTenRisk;
  }, 0);
  const trumpReduction = structure.quality === "controlled" ? 6 : structure.quality === "two-majors" ? 3 : 0;
  return Math.max(0, raw - trumpReduction);
}

export function evaluateIntrinsicHand(hand: GameState["hands"][PlayerId], trump: Suit): IntrinsicHandEvaluation {
  const evaluation = evaluateHumanDoctrineHand(hand, trump, INTRINSIC_OPTIONS);
  const trumpStructure = classifyTrumpStructure(hand, trump);
  const controls = SUITS.filter((suit) => suit !== trump).map((suit) => outsideSuitControl(hand, suit));
  return {
    trump, structure: trumpStructure.label, trumpStructure, trumpQuality: evaluation.trumpQuality,
    trumpQuantity: evaluation.trumpQuantity, trumpControl: evaluation.trumpControl,
    outsideAces: evaluation.outsideAces, outsideTens: evaluation.outsideTens,
    protectedOutsideTens: evaluation.protectedOutsideTens, outsideControls: controls,
    outsideControlCount: controls.filter((control) => control.hasAce).length,
    longOutsideSuits: [...evaluation.longOutsideSuits], singletonSuits: [...evaluation.singletonSuits],
    voidSuits: [...evaluation.voidSuits], vulnerableToCuts: [...evaluation.vulnerableToCuts],
    legacyScore: evaluation.legacyScore,
    structuralAdjustments: { dryNine: evaluation.adjustments.dryNine, thirtyFour: evaluation.adjustments.thirtyFour, jackNineThird: evaluation.adjustments.jackNineThird, longTrump: evaluation.adjustments.longTrump },
    outsideControlAdjustments: { outsideAces: evaluation.adjustments.outsideAces, protectedTens: evaluation.adjustments.protectedTens },
    shapeAdjustments: { longSuits: evaluation.adjustments.longSuits, voids: evaluation.adjustments.voids, vulnerableToCuts: evaluation.adjustments.vulnerableToCuts },
    intrinsicHandStrength: evaluation.intrinsicScore,
    estimatedMissingHighPoints: estimateMissingHighPoints(controls, trumpStructure),
  };
}

function bidsByTeam(state: GameState, team: TeamId): Array<Extract<Bid, { action: "bid" }>> {
  return state.bids.filter((bid): bid is Extract<Bid, { action: "bid" }> => bid.action === "bid" && playerTeam(bid.playerId) === team).map((bid) => ({ ...bid }));
}

export function analyzeAuctionContext(state: GameState): AuctionDecisionContext {
  const currentContract = getCurrentContract(state);
  const ownTeam = playerTeam(state.currentPlayerId);
  const teamBids = bidsByTeam(state, ownTeam);
  const ownBids = teamBids.filter((bid) => bid.playerId === state.currentPlayerId);
  const partnerBids = teamBids.filter((bid) => bid.playerId !== state.currentPlayerId);
  const opponentBids = bidsByTeam(state, ownTeam === 0 ? 1 : 0);
  const partnerBid = partnerBids.at(-1) ?? null;
  const positionFromStart = (state.currentPlayerId - state.startingPlayerId + 4) % 4;
  const positions: BiddingPosition[] = ["first", "second", "third", "fourth"];
  const auctionRole: AuctionRole = ownBids.length ? "rebid" : partnerBid ? "response" : opponentBids.length ? "competitive-overcall" : "opening";
  return {
    playerId: state.currentPlayerId, playerTeam: ownTeam, currentContract: currentContract ? { ...currentContract } : null,
    currentContractTeam: currentContract?.teamId ?? null, publicBids: state.bids.map((bid) => ({ ...bid })),
    legalNextBids: getAvailableBidValues(currentContract), positionFromStart, positionFromDealer: positionFromStart,
    biddingPosition: positions[positionFromStart], isPartance: positionFromStart === 0,
    partnerBid, partnerBids, ownBids, opponentBids, auctionRole, publicScore: { ...state.totalScore },
  };
}

export const buildAuctionDecisionContext = analyzeAuctionContext;

export function inferPartnerInformation(evaluation: IntrinsicHandEvaluation, context: AuctionDecisionContext): PartnerInformation {
  const sameSuitBids = context.partnerBids.filter((bid) => bid.trump === evaluation.trump);
  const supportingBid = sameSuitBids.at(-1) ?? null;
  const supportKnown = Boolean(supportingBid);
  return {
    source: "public-auction-only", hasBid: context.partnerBids.length > 0, hasBidSameSuit: supportKnown,
    supportKnown, supportedSuit: supportingBid?.trump ?? null,
    lastBidValue: supportingBid?.value ?? context.partnerBid?.value ?? null,
    inferredOtherMajor: supportKnown && (evaluation.trumpStructure.hasJackOnly || evaluation.trumpStructure.hasNineOnly) ? "likely" : supportKnown ? "possible" : "none",
    inferredLength: supportKnown && (supportingBid?.value ?? 0) >= 90 ? "likely" : supportKnown ? "possible" : "unknown",
    inferredOutsideControls: supportKnown ? "possible" : "unknown",
  };
}

export function determineOpeningIntent(evaluation: IntrinsicHandEvaluation, context: AuctionDecisionContext, partner: PartnerInformation): AuctionIntent {
  if (partner.supportKnown && context.auctionRole === "rebid") return "partner-supported-rebid";
  if (partner.supportKnown) return "partner-support";
  if ((evaluation.trumpStructure.hasJackOnly || evaluation.trumpStructure.hasNineOnly) && context.ownBids.length === 0) return "probing-major-trump";
  if (context.auctionRole === "competitive-overcall") return "competitive-overcall";
  if (evaluation.trumpStructure.hasBoth && evaluation.trumpQuantity >= 3) return "showing-strong-trump";
  if (evaluation.trumpQuantity >= 4) return "showing-length";
  return "natural-strength";
}

function intrinsicContract(score: number, allow110: boolean): BidValue | null {
  if (score < 60) return null;
  if (score < 76) return 80;
  if (score < 94) return 90;
  if (score < 125) return 100;
  return allow110 ? 110 : 100;
}
function lowerBid(first: BidValue | null, cap: BidValue): BidValue | null { return first === null ? null : first > cap ? cap : first; }
function raiseBid(value: BidValue | null, steps: number, allow110: boolean): BidValue | null {
  if (value === null) return null;
  const values = allow110 ? BID_VALUES_TO_110 : BID_VALUES_TO_110.slice(0, 3);
  const index = Math.max(0, values.indexOf(value));
  return values[Math.min(values.length - 1, index + steps)];
}

export function determineBidCeiling(
  evaluation: IntrinsicHandEvaluation,
  context: AuctionDecisionContext,
  partner: PartnerInformation,
  options: HumanDoctrineV2Options = HUMAN_DOCTRINE_V2_COMMUNICATION,
): BidCeiling {
  const reasons: string[] = [];
  const intrinsicValue = intrinsicContract(evaluation.intrinsicHandStrength, options.allow110);
  let value = intrinsicValue;
  let openingCap: BidValue | null = null;
  let partnerSupportBonus = 0;
  let positionAdjustment = 0;
  const structure = evaluation.trumpStructure;
  if ((structure.hasJackOnly || structure.hasNineOnly) && !partner.supportKnown) {
    openingCap = 80; value = lowerBid(value, 80);
    reasons.push("La piece majeure unique est annoncee par un sondage plafonne a 80.");
  }
  if (structure.hasBoth && structure.trumpCount === 2 && !partner.supportKnown) {
    openingCap = 80; value = lowerBid(value, 80);
    reasons.push("Le 34 sans longueur ni soutien ne justifie pas une grosse ouverture.");
  }
  if (evaluation.structure === "jack-nine-third" && evaluation.outsideControlCount > 0 && !partner.supportKnown) {
    const cap: BidValue = context.isPartance ? 100 : 90;
    openingCap = cap; value = value === null ? null : cap; positionAdjustment = context.isPartance ? 10 : 0;
    reasons.push(context.isPartance ? "J+9+troisieme avec controle exterieur valorise la partance." : "Sans partance, J+9+troisieme reste prudent face au risque de coupe.");
  }
  if (evaluation.structure === "weak-long-trump" && evaluation.outsideControlCount === 0) {
    openingCap = 80; value = lowerBid(value, 80);
    reasons.push("La longueur sans piece majeure ni controle exterieur est insuffisante seule.");
  }
  if (evaluation.outsideControlCount === 0 && value !== null && value > 100) {
    value = 100; reasons.push("Sans controle exterieur, le plafond reste sous les contrats tres eleves.");
  }
  if (partner.supportKnown) {
    const supportSteps = partner.inferredOtherMajor === "likely" ? 2 : 1;
    const supported = raiseBid(intrinsicValue ?? 80, supportSteps, options.allow110);
    if (supported !== null && (value === null || supported > value)) value = supported;
    partnerSupportBonus = supportSteps * 10; openingCap = null;
    reasons.push("Le soutien public du partenaire autorise une reevaluation structuree.");
  }
  if (!options.allow110 && value !== null && value > 100) value = 100;
  if (evaluation.estimatedMissingHighPoints >= 34 && value !== null && value > 100) {
    value = 100; reasons.push("Les gros points manquants limitent le plafond sans predire exactement les plis.");
  }
  if (!reasons.length) reasons.push("Le plafond suit la force intrinseque et les controles disponibles.");
  return { value, intrinsicValue, openingCap, partnerSupportBonus, positionAdjustment, estimatedMissingHighPoints: evaluation.estimatedMissingHighPoints, reasons };
}

export function chooseAuctionAction(trump: Suit, ceiling: BidCeiling, context: AuctionDecisionContext): {
  action: HumanDoctrineV2Trace["auction"]["finalAction"];
  outcome: HumanDoctrineV2Trace["auction"]["overcallDecision"];
} {
  if (!ceiling.value) return { action: { action: "pass" }, outcome: "pass-insufficient" };
  if (context.currentContract?.status && context.currentContract.status !== "normal") return { action: { action: "pass" }, outcome: "pass-blocked" };
  if (context.currentContract && ceiling.value <= context.currentContract.value) return { action: { action: "pass" }, outcome: "pass-not-higher" };
  if (context.currentContract && !context.legalNextBids.includes(ceiling.value)) return { action: { action: "pass" }, outcome: "pass-not-higher" };
  return { action: { action: "bid", value: ceiling.value, trump }, outcome: context.currentContract ? "raise" : "open" };
}

function chooseSeparatedV2Bid(
  options: HumanDoctrineV2Options,
  evaluations: IntrinsicHandEvaluation[],
  context: AuctionDecisionContext,
): HumanDoctrineV2Decision {
  const selected = [...evaluations].sort((first, second) => second.intrinsicHandStrength - first.intrinsicHandStrength)[0];
  let desired = intrinsicContract(selected.intrinsicHandStrength, options.allow110);
  if (selected.trumpStructure.hasNineOnly && selected.trumpQuantity === 1 && selected.outsideAces === 0) desired = null;
  if (selected.structure === "thirty-four" && selected.outsideAces === 0 && selected.protectedOutsideTens === 0) desired = lowerBid(desired, 80);
  const ceiling: BidCeiling = {
    value: desired,
    intrinsicValue: desired,
    openingCap: selected.structure === "thirty-four" && desired === 80 ? 80 : null,
    partnerSupportBonus: 0,
    positionAdjustment: 0,
    estimatedMissingHighPoints: selected.estimatedMissingHighPoints,
    reasons: ["Variante V2 historique: separation force/contexte sans convention de communication."],
  };
  const result = chooseAuctionAction(selected.trump, ceiling, context);
  const partnerInference = inferPartnerInformation(selected, context);
  const trace: HumanDoctrineV2Trace = {
    evaluations,
    intrinsic: { evaluation: selected, desiredContract: desired, desiredTrump: selected.trump },
    auction: {
      context,
      partnerInference,
      intent: selected.trumpQuantity >= 4 ? "showing-length" : "natural-strength",
      ceiling,
      overcallDecision: result.outcome,
      finalAction: result.action,
      reason: `Variante V2 historique; decision ${result.action.action}.`,
    },
  };
  return { ...result.action, trace } as HumanDoctrineV2Decision;
}

export function chooseHumanDoctrineV2Bid(state: GameState, options: HumanDoctrineV2Options = HUMAN_DOCTRINE_V2_COMMUNICATION): HumanDoctrineV2Decision {
  if (state.phase !== "bidding") throw new Error("Human doctrine V2 requires the bidding phase.");
  const hand = state.hands[state.currentPlayerId];
  const context = analyzeAuctionContext(state);
  const evaluations = SUITS.map((trump) => evaluateIntrinsicHand(hand, trump));
  if (options.communication !== true) return chooseSeparatedV2Bid(options, evaluations, context);
  const plans = evaluations.map((evaluation) => {
    const partner = inferPartnerInformation(evaluation, context);
    const intent = determineOpeningIntent(evaluation, context, partner);
    const ceiling = determineBidCeiling(evaluation, context, partner, options);
    const supportValue = partner.supportKnown ? 18 : 0;
    const ownSuitContinuity = context.ownBids.some((bid) => bid.trump === evaluation.trump) ? 8 : 0;
    return { evaluation, partner, intent, ceiling, selectionScore: evaluation.intrinsicHandStrength + supportValue + ownSuitContinuity };
  }).sort((first, second) => second.selectionScore - first.selectionScore || second.evaluation.trumpQuality - first.evaluation.trumpQuality);
  const selected = plans[0];
  const result = chooseAuctionAction(selected.evaluation.trump, selected.ceiling, context);
  const reason = [
    `Structure ${selected.evaluation.structure}; intention ${selected.intent}.`, ...selected.ceiling.reasons,
    result.action.action === "bid" ? `Decision ${result.action.value} ${result.action.trump}.` : "Decision de passer dans le contexte public courant.",
  ].join(" ");
  const trace: HumanDoctrineV2Trace = {
    evaluations: evaluations.map((evaluation) => ({ ...evaluation })),
    intrinsic: { evaluation: selected.evaluation, desiredContract: selected.ceiling.intrinsicValue, desiredTrump: selected.evaluation.trump },
    auction: { context, partnerInference: selected.partner, intent: selected.intent, ceiling: selected.ceiling, overcallDecision: result.outcome, finalAction: result.action, reason },
  };
  return { ...result.action, trace } as HumanDoctrineV2Decision;
}
