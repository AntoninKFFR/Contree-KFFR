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
  doctrineScore: number;
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

export function evaluateHumanDoctrineHand(hand: Card[], trump: Suit): HumanDoctrineHandEvaluation {
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

  let doctrineAdjustment = 0;
  if (structure === "dry-nine") doctrineAdjustment -= 18;
  if (structure === "thirty-four") doctrineAdjustment -= 10;
  if (structure === "jack-nine-third") doctrineAdjustment += 3;
  if (structure === "long-trump") doctrineAdjustment += 4;
  doctrineAdjustment += outsideAces * 3 + protectedOutsideTens * 2;
  doctrineAdjustment += longOutsideSuits.length * 2 + voidSuits.length;
  doctrineAdjustment -= vulnerableToCuts.length * 4;

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
    doctrineScore: legacyScore + doctrineAdjustment,
  };
}

function bidForScore(score: number): BidValue | null {
  // The legacy bidder is deliberately cautious (54/70/86 for 80/90/100).
  // Doctrine adjustments add context, so slightly higher gates preserve that
  // caution instead of turning richer evaluation into automatic aggression.
  if (score < 60) return null;
  if (score < 76) return 80;
  if (score < 94) return 90;
  if (score < 125) return 100;
  return 110;
}

function lastPartnerBid(state: GameState) {
  const team = playerTeam(state.currentPlayerId);
  return [...state.bids].reverse().find(
    (bid) => bid.action === "bid" && playerTeam(bid.playerId) === team && bid.playerId !== state.currentPlayerId,
  );
}

export function chooseHumanDoctrineBid(state: GameState): HumanDoctrineBidDecision {
  if (state.phase !== "bidding") throw new Error("Human doctrine bidding requires the bidding phase.");
  const hand = state.hands[state.currentPlayerId];
  const contract = getCurrentContract(state);
  const evaluations = SUITS.map((trump) => evaluateHumanDoctrineHand(hand, trump));
  const partnerBid = lastPartnerBid(state);
  const ownTeam = playerTeam(state.currentPlayerId);
  const opponentTeam = ownTeam === 0 ? 1 : 0;
  const isOpeningFromFirstSeat = state.bids.length === 0 && state.currentPlayerId === state.startingPlayerId;

  for (const evaluation of evaluations) {
    if (partnerBid?.action === "bid" && partnerBid.trump === evaluation.trump) {
      const support = evaluation.trumpQuantity >= 3 ? 5 : evaluation.trumpQuantity >= 2 ? 2 : 0;
      evaluation.doctrineScore += support + evaluation.outsideAces * 2;
    }
    if (contract && contract.teamId !== ownTeam) {
      evaluation.doctrineScore -= Math.max(0, (contract.value - 80) / 10) * 3;
    }
    const scoreGap = state.totalScore[opponentTeam] - state.totalScore[ownTeam];
    if (scoreGap >= 250) evaluation.doctrineScore += 2;
    if (isOpeningFromFirstSeat) evaluation.doctrineScore += 1;
  }

  const best = evaluations.sort((first, second) => second.doctrineScore - first.doctrineScore)[0];
  let wanted = bidForScore(best.doctrineScore);
  if (best.structure === "thirty-four" && best.outsideAces === 0 && best.protectedOutsideTens === 0) {
    wanted = wanted && wanted > 80 ? 80 : wanted;
  }
  if (best.structure === "dry-nine" && best.outsideAces === 0) wanted = null;
  if (best.outsideAces === 0 && best.trumpQuantity < 6 && wanted && wanted > 110) wanted = 110;

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
