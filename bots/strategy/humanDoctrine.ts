import { SUITS, cardId, createDeck } from "@/engine/cards";
import { getAvailableBidValues } from "@/engine/bidding";
import { getCurrentContract, playableCardsForCurrentPlayer } from "@/engine/game";
import { cardPoints, playerTeam } from "@/engine/rules";
import type { BidValue, Card, GameState, PlayerId, Suit } from "@/engine/types";
import { evaluateHand as evaluateLegacyHand } from "@/bots/heuristicBot 2";
import { getPlayedTrumps, inferVoidSuitsByPlayer } from "@/bots/strategy/trickKnowledge";

export type HumanTrumpStructure =
  | "dry-nine"
  | "thirty-four"
  | "jack-nine-third"
  | "long-trump"
  | "ordinary";

export type HumanDoctrineHandEvaluation = {
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
  intrinsicScore: number;
  doctrineScore: number;
  adjustments: HumanDoctrineAdjustments;
};

export type HumanDoctrineAdjustments = {
  dryNine: number;
  thirtyFour: number;
  jackNineThird: number;
  longTrump: number;
  outsideAces: number;
  protectedTens: number;
  longSuits: number;
  voids: number;
  vulnerableToCuts: number;
  partnerSupport: number;
  opponentContract: number;
  scoreGap: number;
  firstSeat: number;
};

export type HumanDoctrineOptions = {
  thresholds: "legacy" | "doctrine";
  allow110: boolean;
  structuralRules: boolean;
  outsideControls: boolean;
  handShape: boolean;
  partnerSupport: boolean;
  opponentContractPenalty: boolean;
  scoreGapAdjustment: boolean;
};

export const HUMAN_DOCTRINE_DEFAULT_OPTIONS: HumanDoctrineOptions = {
  thresholds: "doctrine",
  allow110: true,
  structuralRules: true,
  outsideControls: true,
  handShape: true,
  partnerSupport: true,
  opponentContractPenalty: true,
  scoreGapAdjustment: true,
};

export type HumanDoctrineBidDecision = {
  action: "pass" | "bid";
  trump?: Suit;
  value?: BidValue;
  confidence: number;
  reason: string;
  evaluation: HumanDoctrineHandEvaluation;
};

const TRUMP_QUALITY: Record<Card["rank"], number> = {
  J: 22,
  "9": 15,
  A: 8,
  "10": 5,
  K: 3,
  Q: 2,
  "8": 0,
  "7": 0,
};

function cardsBySuit(hand: Card[]): Record<Suit, Card[]> {
  return {
    clubs: hand.filter((card) => card.suit === "clubs"),
    diamonds: hand.filter((card) => card.suit === "diamonds"),
    hearts: hand.filter((card) => card.suit === "hearts"),
    spades: hand.filter((card) => card.suit === "spades"),
  };
}

function trumpStructure(trumps: Card[]): HumanTrumpStructure {
  const hasJack = trumps.some((card) => card.rank === "J");
  const hasNine = trumps.some((card) => card.rank === "9");
  if (trumps.length === 1 && hasNine) return "dry-nine";
  if (trumps.length === 2 && hasJack && hasNine) return "thirty-four";
  if (trumps.length === 3 && hasJack && hasNine) return "jack-nine-third";
  if (trumps.length >= 4) return "long-trump";
  return "ordinary";
}

function trumpControl(trumps: Card[]): HumanDoctrineHandEvaluation["trumpControl"] {
  const ranks = new Set(trumps.map((card) => card.rank));
  if (ranks.has("J") && ranks.has("9") && trumps.length >= 4) return "strong";
  if ((ranks.has("J") && ranks.has("9") && trumps.length >= 3) || (ranks.has("J") && trumps.length >= 4)) {
    return "partial";
  }
  if (ranks.has("J") || ranks.has("9")) return "fragile";
  return "none";
}

export function evaluateHumanDoctrineHand(
  hand: Card[],
  trump: Suit,
  options: HumanDoctrineOptions = HUMAN_DOCTRINE_DEFAULT_OPTIONS,
): HumanDoctrineHandEvaluation {
  const suits = cardsBySuit(hand);
  const trumps = suits[trump];
  const outsideSuits = SUITS.filter((suit) => suit !== trump);
  const outsideAces = hand.filter((card) => card.suit !== trump && card.rank === "A").length;
  const outsideTens = hand.filter((card) => card.suit !== trump && card.rank === "10").length;
  const protectedOutsideTens = outsideSuits.filter((suit) =>
    suits[suit].some((card) => card.rank === "A") && suits[suit].some((card) => card.rank === "10"),
  ).length;
  const longOutsideSuits = outsideSuits.filter((suit) => suits[suit].length >= 3);
  const singletonSuits = outsideSuits.filter((suit) => suits[suit].length === 1);
  const voidSuits = outsideSuits.filter((suit) => suits[suit].length === 0);
  const vulnerableToCuts = outsideSuits.filter((suit) => {
    const cards = suits[suit];
    return cards.length >= 2 && cards.some((card) => card.rank === "10") && !cards.some((card) => card.rank === "A");
  });
  const structure = trumpStructure(trumps);
  const legacyScore = evaluateLegacyHand(hand, trump).score;
  const trumpQuality = trumps.reduce((score, card) => score + TRUMP_QUALITY[card.rank], 0);

  const adjustments: HumanDoctrineAdjustments = {
    dryNine: options.structuralRules && structure === "dry-nine" ? -18 : 0,
    thirtyFour: options.structuralRules && structure === "thirty-four" ? -10 : 0,
    jackNineThird: options.structuralRules && structure === "jack-nine-third" ? 3 : 0,
    longTrump: options.structuralRules && structure === "long-trump" ? 4 : 0,
    outsideAces: options.outsideControls ? outsideAces * 3 : 0,
    protectedTens: options.outsideControls ? protectedOutsideTens * 2 : 0,
    longSuits: options.handShape ? longOutsideSuits.length * 2 : 0,
    voids: options.handShape ? voidSuits.length : 0,
    vulnerableToCuts: options.handShape ? -vulnerableToCuts.length * 4 : 0,
    partnerSupport: 0,
    opponentContract: 0,
    scoreGap: 0,
    firstSeat: 0,
  };
  const intrinsicScore = legacyScore + Object.values(adjustments).reduce((sum, value) => sum + value, 0);

  return {
    trump,
    structure,
    trumpQuality,
    trumpQuantity: trumps.length,
    trumpControl: trumpControl(trumps),
    outsideAces,
    outsideTens,
    protectedOutsideTens,
    longOutsideSuits,
    singletonSuits,
    voidSuits,
    vulnerableToCuts,
    legacyScore,
    intrinsicScore,
    doctrineScore: intrinsicScore,
    adjustments,
  };
}

function bidForScore(score: number, options: HumanDoctrineOptions): BidValue | null {
  if (options.thresholds === "legacy") {
    if (score < 54) return null;
    if (score < 70) return 80;
    if (score < 86) return 90;
    return options.allow110 && score >= 125 ? 110 : 100;
  }
  // The legacy bidder is deliberately cautious (54/70/86 for 80/90/100).
  // Doctrine adjustments add context, so slightly higher gates preserve that
  // caution instead of turning richer evaluation into automatic aggression.
  if (score < 60) return null;
  if (score < 76) return 80;
  if (score < 94) return 90;
  if (score < 125) return 100;
  return options.allow110 ? 110 : 100;
}

function lastPartnerBid(state: GameState) {
  const team = playerTeam(state.currentPlayerId);
  return [...state.bids].reverse().find(
    (bid) => bid.action === "bid" && playerTeam(bid.playerId) === team && bid.playerId !== state.currentPlayerId,
  );
}

export function chooseHumanDoctrineBid(
  state: GameState,
  options: HumanDoctrineOptions = HUMAN_DOCTRINE_DEFAULT_OPTIONS,
): HumanDoctrineBidDecision {
  if (state.phase !== "bidding") throw new Error("Human doctrine bidding requires the bidding phase.");
  const hand = state.hands[state.currentPlayerId];
  const contract = getCurrentContract(state);
  const evaluations = SUITS.map((trump) => evaluateHumanDoctrineHand(hand, trump, options));
  const partnerBid = lastPartnerBid(state);
  const ownTeam = playerTeam(state.currentPlayerId);
  const opponentTeam = ownTeam === 0 ? 1 : 0;
  const isOpeningFromFirstSeat = state.bids.length === 0 && state.currentPlayerId === state.startingPlayerId;

  for (const evaluation of evaluations) {
    if (options.partnerSupport && partnerBid?.action === "bid" && partnerBid.trump === evaluation.trump) {
      const support = evaluation.trumpQuantity >= 3 ? 5 : evaluation.trumpQuantity >= 2 ? 2 : 0;
      evaluation.adjustments.partnerSupport = support + evaluation.outsideAces * 2;
    }
    if (options.opponentContractPenalty && contract && contract.teamId !== ownTeam) {
      evaluation.adjustments.opponentContract = -Math.max(0, (contract.value - 80) / 10) * 3;
    }
    const scoreGap = state.totalScore[opponentTeam] - state.totalScore[ownTeam];
    if (options.scoreGapAdjustment && scoreGap >= 250) evaluation.adjustments.scoreGap = 2;
    if (isOpeningFromFirstSeat) evaluation.adjustments.firstSeat = 1;
    evaluation.doctrineScore = evaluation.intrinsicScore
      + evaluation.adjustments.partnerSupport
      + evaluation.adjustments.opponentContract
      + evaluation.adjustments.scoreGap
      + evaluation.adjustments.firstSeat;
  }

  const best = evaluations.sort((first, second) => second.doctrineScore - first.doctrineScore)[0];
  let wanted = bidForScore(best.doctrineScore, options);
  if (options.structuralRules && best.structure === "thirty-four" && best.outsideAces === 0 && best.protectedOutsideTens === 0) {
    wanted = wanted && wanted > 80 ? 80 : wanted;
  }
  if (options.structuralRules && best.structure === "dry-nine" && best.outsideAces === 0) wanted = null;

  const available = contract?.status === "normal" ? getAvailableBidValues(contract) : [];
  const value = wanted && (!contract || contract.status === "normal")
    ? (contract ? (wanted > contract.value && available.includes(wanted) ? wanted : undefined) : wanted)
    : undefined;
  if (!wanted || !value) {
    return {
      action: "pass",
      confidence: Math.min(1, Math.max(0, best.doctrineScore / 100)),
      reason: `Prudence doctrinale: ${best.structure}, controle ${best.trumpControl}.`,
      evaluation: best,
    };
  }

  return {
    action: "bid",
    trump: best.trump,
    value,
    confidence: Math.min(1, best.doctrineScore / 110),
    reason: `Structure ${best.structure}, ${best.trumpQuantity} atouts, ${best.outsideAces} As exterieur(s).`,
    evaluation: best,
  };
}

export type HumanCardDoctrineAnalysis = {
  ownHand: Card[];
  legalCards: Card[];
  playedTrumps: Card[];
  outsideTrumps: Card[];
  knownVoidSuits: Record<PlayerId, Suit[]>;
  preserveTrumpControlCandidates: Card[];
  longSuitCutCandidates: Card[];
  pointNowOrNeverCandidates: Card[];
  lastTrickPlanningCandidates: Card[];
  lastTrickBonus: 10;
  partnerSignals: {
    conventions: [];
    certainPublicSignals: Array<{ playerId: PlayerId; voidSuit: Suit }>;
  };
};

export function analyzeHumanCardDoctrine(state: GameState): HumanCardDoctrineAnalysis {
  if (state.phase !== "playing" || !state.trump) {
    throw new Error("Human card doctrine requires the playing phase.");
  }
  const ownHand = state.hands[state.currentPlayerId];
  const legalCards = playableCardsForCurrentPlayer(state);
  const playedTrumps = getPlayedTrumps(state);
  const known = new Set([...ownHand, ...state.currentTrick.cards.map((play) => play.card), ...state.completedTricks.flatMap((trick) => trick.cards.map((play) => play.card))].map(cardId));
  const outsideTrumps = createDeck().filter((card) => card.suit === state.trump && !known.has(cardId(card)));
  const ownTrumps = ownHand.filter((card) => card.suit === state.trump);
  const hasNineAndSmallTrump = ownTrumps.some((card) => card.rank === "9") && ownTrumps.some((card) => card.rank === "7" || card.rank === "8");
  const suitLengths = cardsBySuit(ownHand);
  const preserveTrumpControlCandidates = hasNineAndSmallTrump
    ? legalCards.filter((card) => card.suit !== state.trump)
    : [];
  const longSuitCutCandidates = state.currentTrick.cards.length === 0 && outsideTrumps.length > 0
    ? legalCards.filter((card) => card.suit !== state.trump && suitLengths[card.suit].length >= 3)
    : [];
  const pointNowOrNeverCandidates = ownHand.length <= 3 && outsideTrumps.length > 0
    ? legalCards.filter((card) => card.suit !== state.trump && (card.rank === "10" || card.rank === "A"))
    : [];
  const lastTrickPlanningCandidates = ownHand.length <= 3
    ? [...legalCards].sort((first, second) => cardPoints(first, state.trump!) - cardPoints(second, state.trump!))
    : [];
  const knownVoidSuits = inferVoidSuitsByPlayer(state);
  const certainPublicSignals = (Object.entries(knownVoidSuits) as Array<[string, Suit[]]>).flatMap(
    ([playerId, suits]) => suits.map((voidSuit) => ({ playerId: Number(playerId) as PlayerId, voidSuit })),
  );

  return {
    ownHand: [...ownHand],
    legalCards: [...legalCards],
    playedTrumps,
    outsideTrumps,
    knownVoidSuits,
    preserveTrumpControlCandidates,
    longSuitCutCandidates,
    pointNowOrNeverCandidates,
    lastTrickPlanningCandidates,
    lastTrickBonus: 10,
    partnerSignals: { conventions: [], certainPublicSignals },
  };
}
