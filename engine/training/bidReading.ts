import { chooseAdvancedRulesBidWithTrace } from "@/bots/strategy/advancedRulesBidding";
import {
  interpretAdvancedRulesBid, type AdvancedRulesBidPromise, type BidPromiseAssertion,
  type PublicBidReadingContext,
} from "@/bots/strategy/advancedRulesBidReading";
import { cardId } from "@/engine/cards";
import { makeBid } from "@/engine/game";
import { createSeededRandom, fisherYatesShuffle } from "@/engine/random";
import { BIDDING_LEVEL_SLOTS, selectBiddingPosition, type BiddingLevel } from "@/engine/training/bidding";
import { generatorVersion } from "@/engine/training/generator";
import type { TrainingAxis } from "@/engine/training/registry";
import type { Bid, Card, GameState, PlayerId } from "@/engine/types";

export const BID_READING_AXIS_ID = "bid-reading" as const;
export const BID_READING_AXIS_VERSION = 1 as const;
export const BID_READING_DOCTRINE_ID = "advanced_rules_v4" as const;
export const BID_READING_DOCTRINE_REVISION = "4.1" as const;
export const BID_READING_LEVELS = 4 as const;
export const BID_READING_SERIES_LENGTH = 10 as const;
export type BidReadingLevel = 1 | 2 | 3 | 4;

export const BID_READING_LEVEL_NAMES: Record<BidReadingLevel, string> = {
  1: "Lire une ouverture", 2: "Lire le partenaire", 3: "Lire la compétition", 4: "Lire une séquence",
};

export const BID_READING_ASSERTION_LABELS: Record<BidPromiseAssertion, string> = {
  "shows-suit": "Cette annonce montre cette couleur",
  "has-jack": "Il possède forcément le Valet de cette couleur",
  "has-nine": "Il possède forcément le 9 de cette couleur",
  "has-at-least-one-major": "Il possède au moins une majeure d’atout, Valet ou 9",
  "has-both-majors": "Il possède forcément Valet et 9",
  "at-least-two-trumps": "Il possède au moins deux cartes de cette couleur",
  "at-least-three-trumps": "Il possède au moins trois cartes de cette couleur",
  "at-least-four-trumps": "Il possède au moins quatre cartes de cette couleur",
  "at-least-five-trumps": "Il possède au moins cinq cartes de cette couleur",
  "at-least-one-outside-ace": "Il possède au moins un As hors de cette couleur",
  "at-least-two-outside-aces": "Il possède au moins deux As hors de cette couleur",
  "supports-partner-suit": "Il soutient la couleur annoncée par son partenaire",
  "strong-partner-fit": "Il apporte un fit fort à la couleur de son partenaire",
  "exceptional-suit-override": "Cette nouvelle couleur est exceptionnellement autonome",
  "classical-defensive-control": "Cette Coinche repose sur la voie classique de contrôle",
  "defensive-control": "La doctrine estime la défense assez forte pour Coincher",
  "exceptional-surcoinche-margin": "La doctrine exige une marge exceptionnelle pour Surcoincher",
  "capot-level-control": "La doctrine juge le contrôle suffisant pour demander Capot",
};

export const BID_READING_MEANING_LABELS: Record<AdvancedRulesBidPromise["possibleMeanings"][number], string> = {
  "single-major-probe": "une sonde avec une seule majeure",
  "weak-long-80": "une longueur sans Valet ni 9, plafonnée à 80",
  "autonomous-opening": "une ouverture soutenue par la main",
  "partner-major-support": "une majeure utile au soutien du partenaire",
  "strong-partner-support": "un soutien fort de la couleur partenaire",
  "rebid-after-support": "une relance après le soutien du partenaire",
  "competitive-overcall": "une surenchère au plus petit palier utile",
  "partner-suit-override": "un changement exceptionnel de la couleur du partenaire",
  "classical-coinche": "une Coinche par maîtrise classique de l’atout",
  "side-controls-coinche": "une Coinche par contrôles extérieurs",
  "trump-lock-coinche": "une Coinche par séquence maîtresse dans l’atout adverse",
  "combined-coinche": "une Coinche par contrôles combinés",
  surcoinche: "une Surcoinche à marge exceptionnelle",
  "personal-capot": "un Capot contrôlé par la main seule",
  "partner-supported-capot": "un Capot complété par l’annonce du partenaire",
  "pass-or-no-higher-bid": "une limite de main ou un choix de conversation",
};

export type BidReadingAnswer = { selectedAssertionIds: BidPromiseAssertion[] };
export type BidReadingExercise = {
  axisId: typeof BID_READING_AXIS_ID;
  axisVersion: typeof BID_READING_AXIS_VERSION;
  doctrineId: typeof BID_READING_DOCTRINE_ID;
  doctrineRevision: typeof BID_READING_DOCTRINE_REVISION;
  level: BidReadingLevel;
  seed: number;
  generatorVersion: typeof generatorVersion;
  publicContext: PublicBidReadingContext;
  publicBids: Bid[];
  targetBidIndex: number;
  targetPlayerId: PlayerId;
  targetBid: Bid;
  playerNames: Record<PlayerId, string>;
  promise: AdvancedRulesBidPromise;
  assertionChoices: BidPromiseAssertion[];
  illustrationHand: Card[];
  slotFamily: string;
};

type Variant = "plain" | "opening-90" | "opening-110-five-one" | "opening-110-four-two" | "coinche-120" | "coinche-130";
export type BidReadingSlot = { family: string; sourceLevel: BiddingLevel; sourceSlot: number; targetSeat: PlayerId; variant?: Variant };

// Each reference hand and auction comes from the V4.1 bidding axis. A target
// action is kept only after the forward bot actually chooses and legally bids it.
export const BID_READING_LEVEL_SLOTS: Record<BidReadingLevel, readonly BidReadingSlot[]> = {
  1: [
    { family: "80 sonde au 9", sourceLevel: 1, sourceSlot: 1, targetSeat: 2 },
    { family: "80 longueur faible", sourceLevel: 1, sourceSlot: 2, targetSeat: 1 },
    { family: "ouverture 90", sourceLevel: 1, sourceSlot: 3, targetSeat: 3, variant: "opening-90" },
    { family: "ouverture 100", sourceLevel: 1, sourceSlot: 3, targetSeat: 2 },
    { family: "ouverture 110 avec cinq atouts", sourceLevel: 1, sourceSlot: 5, targetSeat: 1, variant: "opening-110-five-one" },
    { family: "ouverture 110 avec quatre atouts", sourceLevel: 1, sourceSlot: 5, targetSeat: 3, variant: "opening-110-four-two" },
    { family: "80 sonde au Valet", sourceLevel: 1, sourceSlot: 4, targetSeat: 2 },
    { family: "autre 80 sonde", sourceLevel: 1, sourceSlot: 7, targetSeat: 1 },
    { family: "autre ouverture 100", sourceLevel: 1, sourceSlot: 9, targetSeat: 3 },
    { family: "autre 80 plafonné", sourceLevel: 1, sourceSlot: 8, targetSeat: 2 },
  ],
  2: Array.from({ length: 10 }, (_, sourceSlot) => ({
    family: BIDDING_LEVEL_SLOTS[3][sourceSlot].family,
    sourceLevel: 3 as const, sourceSlot, targetSeat: 2 as const,
  })),
  3: [
    { family: "overcall après 80", sourceLevel: 2, sourceSlot: 0, targetSeat: 1 },
    { family: "overcall après 90", sourceLevel: 2, sourceSlot: 6, targetSeat: 3 },
    { family: "contrat haut : passe", sourceLevel: 2, sourceSlot: 5, targetSeat: 1 },
    { family: "Coinche classique à 120", sourceLevel: 2, sourceSlot: 2, targetSeat: 3, variant: "coinche-120" },
    { family: "Coinche classique à 130", sourceLevel: 2, sourceSlot: 2, targetSeat: 1, variant: "coinche-130" },
    { family: "Coinche classique à 140", sourceLevel: 2, sourceSlot: 2, targetSeat: 3 },
    { family: "Coinche à contrôles extérieurs", sourceLevel: 2, sourceSlot: 3, targetSeat: 1 },
    { family: "Coinche à verrou d’atout", sourceLevel: 2, sourceSlot: 4, targetSeat: 3 },
    { family: "Coinche combinée", sourceLevel: 2, sourceSlot: 9, targetSeat: 1 },
    { family: "Surcoinche", sourceLevel: 4, sourceSlot: 4, targetSeat: 3 },
  ],
  4: Array.from({ length: 10 }, (_, sourceSlot) => ({
    family: BIDDING_LEVEL_SLOTS[4][sourceSlot].family,
    sourceLevel: 4 as const, sourceSlot, targetSeat: (sourceSlot % 2 === 0 ? 2 : 1) as PlayerId,
  })),
};

const ASSERTION_PRIORITY: readonly BidPromiseAssertion[] = [
  "has-jack", "has-nine", "at-least-four-trumps", "at-least-one-outside-ace",
  "supports-partner-suit", "strong-partner-fit", "exceptional-suit-override",
  "classical-defensive-control", "defensive-control", "exceptional-surcoinche-margin",
  "capot-level-control", "has-at-least-one-major", "at-least-two-trumps",
  "at-least-three-trumps", "has-both-majors", "shows-suit",
];
const DISTRACTOR_PRIORITY: readonly BidPromiseAssertion[] = [
  "has-jack", "has-nine", "has-both-majors", "at-least-four-trumps",
  "at-least-five-trumps", "at-least-two-outside-aces", "at-least-one-outside-ace",
  "strong-partner-fit", "classical-defensive-control", "exceptional-suit-override",
  "supports-partner-suit", "defensive-control", "capot-level-control",
];

function rotatePlayer(playerId: PlayerId, shift: PlayerId): PlayerId {
  return ((playerId + shift) % 4) as PlayerId;
}

function rotateState(state: GameState, shift: PlayerId): GameState {
  if (shift === 0) return state;
  const hands = {} as GameState["hands"];
  const names = {} as NonNullable<GameState["playerNames"]>;
  for (const playerId of [0, 1, 2, 3] as PlayerId[]) {
    hands[rotatePlayer(playerId, shift)] = state.hands[playerId];
    names[rotatePlayer(playerId, shift)] = state.playerNames?.[playerId] ?? `Joueur ${playerId + 1}`;
  }
  const swapTeams = shift % 2 === 1;
  const score = swapTeams ? { 0: state.totalScore[1], 1: state.totalScore[0] } : state.totalScore;
  return { ...state, hands, playerNames: names,
    startingPlayerId: rotatePlayer(state.startingPlayerId, shift),
    currentPlayerId: rotatePlayer(state.currentPlayerId, shift),
    bids: state.bids.map((bid) => ({ ...bid, playerId: rotatePlayer(bid.playerId, shift) })),
    totalScore: score,
  };
}

function findOpeningVariant(state: GameState, variant: Variant): GameState {
  const original = state.hands[0];
  const hidden = [1, 2, 3] as PlayerId[];
  for (const out of original) for (const seat of hidden) for (const incoming of state.hands[seat]) {
    if (cardId(out) === cardId(incoming)) continue;
    const hand = original.filter((card) => cardId(card) !== cardId(out)).concat(incoming);
    const candidate = { ...state, hands: { ...state.hands, 0: hand,
      [seat]: state.hands[seat].filter((card) => cardId(card) !== cardId(incoming)).concat(out) } };
    const bid = chooseAdvancedRulesBidWithTrace(candidate).bid;
    if (bid.action !== "bid") continue;
    const trump = bid.contractMode?.kind === "suit" ? bid.contractMode.suit : bid.trump;
    if (!trump || bid.value !== (variant === "opening-90" ? 90 : 110)) continue;
    const trumps = hand.filter((card) => card.suit === trump).length;
    const outsideAces = hand.filter((card) => card.suit !== trump && card.rank === "A").length;
    if (variant === "opening-110-five-one" && (trumps < 5 || outsideAces !== 1)) continue;
    if (variant === "opening-110-four-two" && (trumps !== 4 || outsideAces < 2)) continue;
    makeBid(candidate, 0, bid);
    return candidate;
  }
  throw new Error(`No V4.1 bid-reading opening variant ${variant} for this seed.`);
}

function sourceState(seed: number, slot: BidReadingSlot): GameState {
  let state = selectBiddingPosition(seed, BIDDING_LEVEL_SLOTS[slot.sourceLevel][slot.sourceSlot], slot.sourceLevel).state;
  if (slot.variant === "opening-90" || slot.variant === "opening-110-five-one" || slot.variant === "opening-110-four-two") {
    state = findOpeningVariant(state, slot.variant);
  } else if (slot.variant === "coinche-120" || slot.variant === "coinche-130") {
    const first = state.bids[0];
    if (first.action !== "bid") throw new Error("Expected a public suit contract before Coinche.");
    const clean = { ...state, bids: [], currentPlayerId: state.startingPlayerId };
    state = makeBid(clean, clean.currentPlayerId, { action: "bid", value: slot.variant === "coinche-120" ? 120 : 130,
      trump: first.trump, contractMode: first.contractMode });
  }
  return state;
}

function choicesFor(promise: AdvancedRulesBidPromise, seed: number): BidPromiseAssertion[] {
  const trueChoices = ASSERTION_PRIORITY.filter((id) => promise.guaranteed.includes(id)).slice(0, 4);
  const falseChoices = DISTRACTOR_PRIORITY.filter((id) => !promise.guaranteed.includes(id)).slice(0, 8 - trueChoices.length);
  const choices = [...trueChoices, ...falseChoices];
  if (choices.length < 5 || falseChoices.length === 0) throw new Error("Bid-reading slot has no useful distractors.");
  return fisherYatesShuffle(choices, createSeededRandom(seed));
}

export function createBidReadingExercise(seed: number, level: BidReadingLevel, slot: BidReadingSlot): BidReadingExercise {
  if (!Number.isSafeInteger(seed)) throw new Error("Bid-reading seed must be a safe integer.");
  const state = rotateState(sourceState(seed, slot), slot.targetSeat);
  const decision = chooseAdvancedRulesBidWithTrace(state);
  if (decision.trace.doctrineId !== BID_READING_DOCTRINE_ID || decision.trace.doctrineRevision !== BID_READING_DOCTRINE_REVISION) {
    throw new Error("Unsupported bidding doctrine revision for bid-reading axis v1.");
  }
  const targetBidIndex = state.bids.length;
  const finished = makeBid(state, state.currentPlayerId, decision.bid);
  const targetBid = finished.bids[targetBidIndex];
  if (!targetBid) {
    throw new Error("Bid-reading target was not produced by V4.1.");
  }
  const publicContext: PublicBidReadingContext = {
    startingPlayerId: state.startingPlayerId, totalScore: { ...state.totalScore },
    bidsBefore: state.bids.map((bid) => ({ ...bid })), targetPlayerId: state.currentPlayerId,
    rulesetId: "contree-kffr", rulesetVersion: 1,
  };
  const promise = interpretAdvancedRulesBid(publicContext, targetBid);
  return {
    axisId: BID_READING_AXIS_ID, axisVersion: BID_READING_AXIS_VERSION,
    doctrineId: BID_READING_DOCTRINE_ID, doctrineRevision: BID_READING_DOCTRINE_REVISION,
    level, seed, generatorVersion, publicContext,
    publicBids: finished.bids.map((bid) => ({ ...bid })), targetBidIndex,
    targetPlayerId: state.currentPlayerId, targetBid: { ...targetBid },
    playerNames: state.playerNames ?? { 0: "Toi", 1: "Adversaire droite", 2: "Partenaire", 3: "Adversaire gauche" },
    promise, assertionChoices: choicesFor(promise, seed),
    illustrationHand: [...state.hands[state.currentPlayerId]], slotFamily: slot.family,
  };
}

export type BidReadingSeriesOptions = { seed: number; level: BidReadingLevel; generatorVersion: number; axisVersion: number };

export function generateBidReadingSeries(options: BidReadingSeriesOptions): BidReadingExercise[] {
  if (options.generatorVersion !== generatorVersion) throw new Error(`Unsupported training generator version: ${options.generatorVersion}`);
  if (options.axisVersion !== BID_READING_AXIS_VERSION) throw new Error(`Unsupported bid-reading axis version: ${options.axisVersion}`);
  if (options.level !== 1 && options.level !== 2 && options.level !== 3 && options.level !== 4) {
    throw new Error(`Unknown bid-reading level: ${options.level}`);
  }
  if (!Number.isSafeInteger(options.seed)) throw new Error("Bid-reading seed must be a safe integer.");
  return BID_READING_LEVEL_SLOTS[options.level].map((slot, index) =>
    createBidReadingExercise(options.seed + index * 1_000, options.level, slot));
}

export function gradeBidReadingExercise(exercise: BidReadingExercise, answer: unknown): { correct: boolean; score: 0 | 1 } {
  if (!answer || typeof answer !== "object" || Array.isArray(answer)) return { correct: false, score: 0 };
  const candidate = answer as Record<string, unknown>;
  if (Object.keys(candidate).length !== 1 || !Array.isArray(candidate.selectedAssertionIds)) return { correct: false, score: 0 };
  const selected = candidate.selectedAssertionIds;
  if (!selected.every((id) => typeof id === "string" && exercise.assertionChoices.includes(id as BidPromiseAssertion))
    || new Set(selected).size !== selected.length) return { correct: false, score: 0 };
  const expected = exercise.assertionChoices.filter((id) => exercise.promise.guaranteed.includes(id));
  const correct = selected.length === expected.length && selected.every((id) => expected.includes(id as BidPromiseAssertion));
  return { correct, score: correct ? 1 : 0 };
}

export const bidReadingAxis: TrainingAxis<BidReadingExercise> = {
  id: BID_READING_AXIS_ID, label: "Lire les enchères",
  createExercise: (position) => createBidReadingExercise(position.seed, 1, BID_READING_LEVEL_SLOTS[1][0]),
};
