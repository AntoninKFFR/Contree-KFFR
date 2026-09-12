import { BID_VALUES } from "@/engine/bidding";
import { SUITS } from "@/engine/cards";
import { playerTeam } from "@/engine/rules";
import type { BidValue, Card, GameState, Suit } from "@/engine/types";
import {
  HUMAN_DOCTRINE_V2_1_CONSERVATIVE,
  analyzeAuctionContext,
  classifyHandDependency,
  evaluateIntrinsicHand,
  type AuctionDecisionContext,
  type AuctionRole,
  type HandDependency,
  type IntrinsicHandEvaluation,
} from "@/bots/strategy/humanDoctrineV2";

export type TrumpFoundation = "none" | "one-major" | "two-majors" | "controlled-long";
export type PartnerTrumpFit = "none" | "minor-support" | "missing-major-fit" | "strong-fit";
export type PartnerSuitOverride = "not-applicable" | "allowed" | "forbidden";
export type CommunicationIntent =
  | "pass-with-partner"
  | "probe-for-jack"
  | "probe-for-nine"
  | "show-autonomous-strength"
  | "support-partner-major"
  | "support-partner-strongly"
  | "rebid-after-support"
  | "competitive-overcall"
  | "override-partner-suit"
  | "reject-weak-foundation";

export type AuctionConversationState = {
  auctionRole: AuctionRole;
  ownPreviousBids: AuctionDecisionContext["ownBids"];
  partnerPreviousBids: AuctionDecisionContext["partnerBids"];
  opponentBids: AuctionDecisionContext["opponentBids"];
  suitAlreadyShown: Suit | null;
  messageAlreadyTransmitted: boolean;
  informationRequestedFromPartner: "jack" | "nine" | "trump-support" | "none";
  informationReceivedFromPartner: "same-suit-support" | "different-suit-message" | "none";
  minimumUsefulLegalBid: BidValue | null;
  autonomousStrength: HandDependency;
  reasonToChangeSuit: string | null;
};

export type HumanDoctrineV3Action =
  | { action: "pass" }
  | { action: "bid"; value: BidValue; trump: Suit };

export type HumanDoctrineV3Trace = {
  version: 3;
  evaluations: IntrinsicHandEvaluation[];
  trump: Suit;
  intrinsicCeiling: BidValue | null;
  trumpFoundation: TrumpFoundation;
  auctionRole: AuctionRole;
  partnerMessage: { value: BidValue; trump: Suit } | null;
  partnerFit: PartnerTrumpFit;
  dependency: HandDependency;
  communicationIntent: CommunicationIntent;
  minimalUsefulBid: BidValue | null;
  competitiveMinimum: BidValue | null;
  rebidCeiling: BidValue | null;
  candidateSuit: Suit;
  partnerSuit: Suit | null;
  partnerSuitOverride: PartnerSuitOverride;
  ownPreviousMessage: { value: BidValue; trump: Suit } | null;
  conversation: AuctionConversationState;
  finalAction: HumanDoctrineV3Action;
  reason: string;
};

export type HumanDoctrineV3Decision = HumanDoctrineV3Action & { trace: HumanDoctrineV3Trace };

function ceilingForStrength(score: number): BidValue | null {
  if (score < 60) return null;
  if (score < 76) return 80;
  if (score < 94) return 90;
  if (score < 125) return 100;
  return 110;
}

function suitCards(hand: Card[], suit: Suit): Card[] {
  return hand.filter((card) => card.suit === suit);
}

export function classifyTrumpFoundation(
  hand: Card[],
  evaluation: IntrinsicHandEvaluation,
): TrumpFoundation {
  const trumps = suitCards(hand, evaluation.trump);
  const hasTrumpAce = trumps.some((card) => card.rank === "A");
  const hasTrumpTen = trumps.some((card) => card.rank === "10");
  if (evaluation.trumpStructure.hasBoth && evaluation.trumpQuantity >= 3) return "controlled-long";
  if (evaluation.trumpStructure.hasBoth) return "two-majors";
  if (evaluation.trumpStructure.hasJackOnly || evaluation.trumpStructure.hasNineOnly) return "one-major";
  if (
    evaluation.trumpQuantity >= 5
    && hasTrumpAce
    && hasTrumpTen
    && evaluation.outsideAces >= 2
  ) return "controlled-long";
  return "none";
}

export function evaluatePartnerFit(
  hand: Card[],
  partnerSuit: Suit | null,
  evaluation: IntrinsicHandEvaluation,
): PartnerTrumpFit {
  if (!partnerSuit || evaluation.trump !== partnerSuit) return "none";
  const trumps = suitCards(hand, partnerSuit);
  const hasJack = trumps.some((card) => card.rank === "J");
  const hasNine = trumps.some((card) => card.rank === "9");
  if (hasJack && hasNine) return "strong-fit";
  if ((hasJack || hasNine) && (trumps.length >= 3 || (trumps.length >= 2 && evaluation.outsideAces > 0))) return "strong-fit";
  if (hasJack || hasNine) return "missing-major-fit";
  if (trumps.length >= 2) return "minor-support";
  return "none";
}

function nextLegalBid(context: AuctionDecisionContext): BidValue | null {
  return context.legalNextBids[0] ?? null;
}

function raiseValue(value: BidValue | null, steps: number): BidValue | null {
  if (value === null) return null;
  const index = BID_VALUES.indexOf(value);
  if (index < 0) return null;
  return BID_VALUES[Math.min(BID_VALUES.length - 1, index + steps)];
}

function bidWithinCeiling(
  trump: Suit,
  minimum: BidValue | null,
  ceiling: BidValue | null,
): HumanDoctrineV3Action {
  if (minimum === null || ceiling === null || minimum > ceiling) return { action: "pass" };
  return { action: "bid", value: minimum, trump };
}

function requestedMajor(evaluation: IntrinsicHandEvaluation): AuctionConversationState["informationRequestedFromPartner"] {
  if (evaluation.trumpStructure.hasNineOnly) return "jack";
  if (evaluation.trumpStructure.hasJackOnly) return "nine";
  if (evaluation.trumpStructure.hasBoth) return "trump-support";
  return "none";
}

function evaluatePartnerSuitOverride(
  alternative: IntrinsicHandEvaluation,
  alternativeFoundation: TrumpFoundation,
  alternativeDependency: HandDependency,
  partnerSuit: Suit | null,
): { status: PartnerSuitOverride; reason: string } {
  if (!partnerSuit || alternative.trump === partnerSuit) {
    return { status: "not-applicable", reason: "Aucune couleur partenaire a ecraser." };
  }
  const exceptional = alternativeFoundation === "controlled-long"
    && alternative.trumpStructure.hasBoth
    && alternative.trumpQuantity >= 3
    && alternative.outsideAces >= 1
    && alternativeDependency !== "partner-dependent";
  if (exceptional) {
    return {
      status: "allowed",
      reason: "Nouvelle couleur exceptionnellement autonome: J+9, longueur et As exterieur.",
    };
  }
  return {
    status: "forbidden",
    reason: `La couleur ${alternative.trump} n'est pas assez dominante pour abandonner ${partnerSuit}.`,
  };
}

function sortEvaluations(evaluations: IntrinsicHandEvaluation[]): IntrinsicHandEvaluation[] {
  return [...evaluations].sort(
    (first, second) => second.intrinsicHandStrength - first.intrinsicHandStrength
      || second.trumpQuality - first.trumpQuality
      || second.trumpQuantity - first.trumpQuantity,
  );
}

export function analyzeAuctionConversation(
  context: AuctionDecisionContext,
  evaluation: IntrinsicHandEvaluation,
  dependency: HandDependency,
): AuctionConversationState {
  const ownPreviousMessage = context.ownBids.at(-1) ?? null;
  const partnerMessage = context.partnerBid;
  return {
    auctionRole: context.auctionRole,
    ownPreviousBids: context.ownBids.map((bid) => ({ ...bid })),
    partnerPreviousBids: context.partnerBids.map((bid) => ({ ...bid })),
    opponentBids: context.opponentBids.map((bid) => ({ ...bid })),
    suitAlreadyShown: ownPreviousMessage?.trump ?? null,
    messageAlreadyTransmitted: Boolean(ownPreviousMessage),
    informationRequestedFromPartner: requestedMajor(evaluation),
    informationReceivedFromPartner: partnerMessage
      ? partnerMessage.trump === ownPreviousMessage?.trump
        ? "same-suit-support"
        : "different-suit-message"
      : "none",
    minimumUsefulLegalBid: context.currentContract ? nextLegalBid(context) : 80,
    autonomousStrength: dependency,
    reasonToChangeSuit: null,
  };
}

export function chooseHumanDoctrineV3Bid(state: GameState): HumanDoctrineV3Decision {
  if (state.phase !== "bidding") throw new Error("Auction Doctrine V3 requires the bidding phase.");
  const hand = state.hands[state.currentPlayerId];
  const context = analyzeAuctionContext(state);
  const evaluations = SUITS.map((trump) => evaluateIntrinsicHand(hand, trump));
  const dependencies = new Map(evaluations.map((evaluation) => [
    evaluation.trump,
    classifyHandDependency(evaluation, context, HUMAN_DOCTRINE_V2_1_CONSERVATIVE.selectiveProbePolicy!),
  ]));
  const foundations = new Map(evaluations.map((evaluation) => [
    evaluation.trump,
    classifyTrumpFoundation(hand, evaluation),
  ]));
  const sorted = sortEvaluations(evaluations);
  const partnerSuit = context.partnerBid?.trump ?? null;
  const ownPreviousMessage = context.ownBids.at(-1) ?? null;
  const partnerEvaluation = partnerSuit
    ? evaluations.find((evaluation) => evaluation.trump === partnerSuit) ?? null
    : null;
  const continuityEvaluation = ownPreviousMessage
    ? evaluations.find((evaluation) => evaluation.trump === ownPreviousMessage.trump) ?? null
    : null;
  const bestAlternative = sorted.find((evaluation) => evaluation.trump !== partnerSuit) ?? sorted[0];
  const alternativeDependency = dependencies.get(bestAlternative.trump)!.classification;
  const override = evaluatePartnerSuitOverride(
    bestAlternative,
    foundations.get(bestAlternative.trump)!,
    alternativeDependency,
    partnerSuit,
  );

  let selected = continuityEvaluation ?? sorted[0];
  if (partnerEvaluation) {
    selected = override.status === "allowed" ? bestAlternative : partnerEvaluation;
  }
  const dependency = dependencies.get(selected.trump)!.classification;
  const foundation = foundations.get(selected.trump)!;
  const partnerFit = evaluatePartnerFit(hand, partnerSuit, selected);
  const intrinsicCeiling = ceilingForStrength(selected.intrinsicHandStrength);
  const competitiveMinimum = nextLegalBid(context);
  const partnerSupportSteps = partnerFit === "strong-fit" ? 2 : partnerFit === "missing-major-fit" ? 1 : 0;
  const rebidCeiling = raiseValue(intrinsicCeiling ?? 80, partnerSupportSteps);
  const conversation = analyzeAuctionConversation(context, selected, dependency);
  conversation.reasonToChangeSuit = override.status === "allowed" ? override.reason : null;

  let finalAction: HumanDoctrineV3Action = { action: "pass" };
  let intent: CommunicationIntent = "pass-with-partner";
  let reason = "Le passe conserve le message public deja transmis.";
  let minimalUsefulBid: BidValue | null = context.currentContract ? competitiveMinimum : 80;

  const currentContractIsPartner = Boolean(
    context.currentContract
    && context.partnerBid
    && context.currentContract.playerId === context.partnerBid.playerId,
  );
  const currentContractIsOpponent = Boolean(
    context.currentContract
    && context.currentContractTeam !== playerTeam(state.currentPlayerId),
  );
  const partnerSupportedOwnSuit = Boolean(
    ownPreviousMessage
    && context.partnerBid
    && context.partnerBid.trump === ownPreviousMessage.trump,
  );

  if (!context.currentContract) {
    if (foundation === "none") {
      intent = "reject-weak-foundation";
      reason = selected.trumpQuantity >= 4
        ? "Longueur sans Valet ni 9: la quantite seule ne fonde pas une ouverture."
        : "Aucune fondation d'atout suffisante pour ouvrir.";
    } else if (foundation === "one-major" && dependency !== "autonomous") {
      finalAction = intrinsicCeiling ? { action: "bid", value: 80, trump: selected.trump } : { action: "pass" };
      intent = selected.trumpStructure.hasNineOnly ? "probe-for-jack" : "probe-for-nine";
      reason = `${selected.trumpStructure.hasNineOnly ? "9 sans Valet" : "Valet sans 9"}: 80 transmet la couleur et reserve le plafond pour un rebid.`;
    } else if (intrinsicCeiling) {
      finalAction = { action: "bid", value: intrinsicCeiling, trump: selected.trump };
      minimalUsefulBid = intrinsicCeiling;
      intent = "show-autonomous-strength";
      reason = "La fondation d'atout et les controles rendent la main suffisamment autonome.";
    }
  } else if (partnerSupportedOwnSuit && currentContractIsPartner && ownPreviousMessage) {
    finalAction = bidWithinCeiling(selected.trump, competitiveMinimum, rebidCeiling);
    intent = "rebid-after-support";
    reason = finalAction.action === "bid"
      ? "Le soutien partenaire complete le message d'ouverture et libere le plafond de rebid."
      : "Le soutien est reconnu mais le prochain palier depasse le plafond de rebid.";
  } else if (partnerSuit && selected.trump === partnerSuit && currentContractIsPartner) {
    const partnerValue = context.currentContract!.value as BidValue;
    if (partnerFit === "strong-fit") {
      const target = raiseValue(partnerValue, 2);
      finalAction = bidWithinCeiling(selected.trump, target, rebidCeiling);
      intent = "support-partner-strongly";
      reason = "La piece majeure, la longueur ou les controles justifient un soutien de deux paliers.";
    } else if (partnerFit === "missing-major-fit" && partnerValue === 80) {
      const target = raiseValue(partnerValue, 1);
      finalAction = bidWithinCeiling(selected.trump, target, rebidCeiling);
      intent = "support-partner-major";
      reason = "Le bot apporte probablement la majeure manquante; 90 suffit comme reponse.";
    } else {
      intent = "pass-with-partner";
      reason = partnerFit === "missing-major-fit"
        ? "La majeure manquante est reconnue, mais sur 90 un nouveau palier serait inutile sans soutien supplementaire."
        : "La couleur partenaire est respectee; aucune information assez forte ne justifie une relance.";
    }
  } else if (partnerSuit && override.status === "allowed" && selected.trump !== partnerSuit) {
    finalAction = bidWithinCeiling(selected.trump, competitiveMinimum, intrinsicCeiling);
    intent = "override-partner-suit";
    reason = override.reason;
  } else if (partnerSuit && override.status === "forbidden") {
    if (currentContractIsOpponent && partnerFit !== "none") {
      finalAction = bidWithinCeiling(partnerSuit, competitiveMinimum, rebidCeiling);
      intent = partnerFit === "strong-fit" ? "support-partner-strongly" : "support-partner-major";
      reason = finalAction.action === "bid"
        ? "Le soutien de la couleur partenaire est prefere au changement de couleur."
        : override.reason;
    } else {
      intent = "pass-with-partner";
      reason = override.reason;
    }
  } else if (currentContractIsOpponent) {
    finalAction = bidWithinCeiling(selected.trump, competitiveMinimum, intrinsicCeiling);
    intent = "competitive-overcall";
    reason = finalAction.action === "bid"
      ? "Le plus petit palier legal conserve un overcall competitif justifie."
      : "La force autonome ne couvre pas le prochain palier competitif.";
  }

  const trace: HumanDoctrineV3Trace = {
    version: 3,
    evaluations: evaluations.map((evaluation) => ({ ...evaluation })),
    trump: selected.trump,
    intrinsicCeiling,
    trumpFoundation: foundation,
    auctionRole: context.auctionRole,
    partnerMessage: context.partnerBid
      ? { value: context.partnerBid.value, trump: context.partnerBid.trump }
      : null,
    partnerFit,
    dependency,
    communicationIntent: intent,
    minimalUsefulBid,
    competitiveMinimum,
    rebidCeiling,
    candidateSuit: selected.trump,
    partnerSuit,
    partnerSuitOverride: override.status,
    ownPreviousMessage: ownPreviousMessage
      ? { value: ownPreviousMessage.value, trump: ownPreviousMessage.trump }
      : null,
    conversation,
    finalAction,
    reason,
  };
  return { ...finalAction, trace } as HumanDoctrineV3Decision;
}
