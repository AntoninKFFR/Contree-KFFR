import { chooseAdvancedRulesBidWithTrace, type AdvancedRulesBidReasonCode, type AdvancedRulesBidTrace } from "@/bots/strategy/advancedRulesBidding";
import { BID_VALUES } from "@/engine/bidding";
import { createDeck, formatCard, sortHand, SUITS, SUIT_SYMBOLS } from "@/engine/cards";
import { getCurrentContract, createInitialGame, makeBid } from "@/engine/game";
import { createSeededRandom, fisherYatesShuffle } from "@/engine/random";
import { CONTREE_KFFR_RULESET } from "@/engine/rulesets/presets";
import { resolveGameRules } from "@/engine/rulesets/resolve";
import { generatorVersion } from "@/engine/training/generator";
import type { TrainingAxis } from "@/engine/training/registry";
import type { Bid, BidValue, Card, Contract, GameState, PlayerId, Suit } from "@/engine/types";

export const BIDDING_AXIS_ID = "bidding" as const;
export const BIDDING_AXIS_VERSION = 1 as const;
export const BIDDING_DOCTRINE_ID = "advanced_rules_v4" as const;
export const BIDDING_DOCTRINE_REVISION = "4.1" as const;
export const BIDDING_LEVELS = 4 as const;
export const BIDDING_SERIES_LENGTH = 10 as const;
export type BiddingLevel = 1 | 2 | 3 | 4;

export const BIDDING_LEVEL_NAMES: Record<BiddingLevel, string> = {
  1: "Ouvrir", 2: "Réagir à l’adversaire", 3: "Répondre au partenaire", 4: "Enchère compétitive",
};

export type BiddingAnswer =
  | { action: "pass" }
  | { action: "bid"; value: BidValue; trump: Suit }
  | { action: "coinche" }
  | { action: "surcoinche" }
  | { action: "capot"; trump: Suit };

/** Public question only. The other three hands remain inside the generator. */
export type BiddingExercise = {
  axisId: typeof BIDDING_AXIS_ID;
  axisVersion: typeof BIDDING_AXIS_VERSION;
  doctrineId: typeof BIDDING_DOCTRINE_ID;
  doctrineRevision: typeof BIDDING_DOCTRINE_REVISION;
  level: BiddingLevel;
  seed: number;
  generatorVersion: typeof generatorVersion;
  rulesetId: "contree-kffr";
  rulesetVersion: 1;
  ownHand: Card[];
  playerNames: Record<PlayerId, string>;
  publicBids: Bid[];
  currentContract: Contract | null;
  startingPlayerId: PlayerId;
  question: string;
  expected: BiddingAnswer;
  trace: AdvancedRulesBidTrace;
};

type AuctionKey = "open" | "enemy-80" | "enemy-90" | "enemy-100" | "enemy-140" | "enemy-150" | "enemy-160"
  | "partner-80-spades" | "partner-80-clubs" | "partner-80-hearts" | "partner-90-hearts"
  | "rebid" | "rebid-competitive" | "own-overcall" | "partnership-competition" | "high-competition" | "doubled";
type HandKey = "weak" | "weak-long" | "probe-nine" | "probe-jack" | "autonomous-100" | "autonomous-110"
  | "classic" | "side-controls" | "trump-lock" | "small-fit" | "strong-fit" | "no-fit" | "override" | "masters";
export type BiddingSlot = {
  family: string;
  auction: AuctionKey;
  hand: HandKey;
  reasonCode: AdvancedRulesBidReasonCode;
  action: BiddingAnswer["action"];
  value?: BidValue;
  overbidEvidence?: "side-controls" | "trump-lock" | "combined";
};

// Explicit teaching plan. Every candidate is still accepted only when V4.1
// returns the named branch and its action is legal in the engine.
export const BIDDING_LEVEL_SLOTS: Record<BiddingLevel, readonly BiddingSlot[]> = {
  1: [
    { family: "fondation insuffisante", auction: "open", hand: "weak", reasonCode: "weak-trump-foundation", action: "pass" },
    { family: "sonde avec le 9", auction: "open", hand: "probe-nine", reasonCode: "single-major-probe", action: "bid", value: 80 },
    { family: "longueur faible avec contrôles", auction: "open", hand: "weak-long", reasonCode: "weak-long-trump-show-80", action: "bid", value: 80 },
    { family: "ouverture autonome à 100", auction: "open", hand: "autonomous-100", reasonCode: "autonomous-opening", action: "bid", value: 100 },
    { family: "sonde avec le Valet", auction: "open", hand: "probe-jack", reasonCode: "single-major-probe", action: "bid", value: 80 },
    { family: "ouverture autonome à 110", auction: "open", hand: "autonomous-110", reasonCode: "autonomous-opening", action: "bid", value: 110 },
    { family: "contrôles sans fondation d’atout", auction: "open", hand: "side-controls", reasonCode: "pass-ceiling-too-low", action: "pass" },
    { family: "autre sonde à 80", auction: "open", hand: "probe-nine", reasonCode: "single-major-probe", action: "bid", value: 80 },
    { family: "autre longueur plafonnée à 80", auction: "open", hand: "weak-long", reasonCode: "weak-long-trump-show-80", action: "bid", value: 80 },
    { family: "autre ouverture autonome", auction: "open", hand: "autonomous-100", reasonCode: "autonomous-opening", action: "bid", value: 100 },
  ],
  2: [
    { family: "overcall après 80", auction: "enemy-80", hand: "probe-nine", reasonCode: "competitive-overcall", action: "bid", value: 90 },
    { family: "plafond insuffisant après 100", auction: "enemy-100", hand: "probe-nine", reasonCode: "pass-ceiling-too-low", action: "pass" },
    { family: "Coinche classique", auction: "enemy-140", hand: "classic", reasonCode: "coinche-strong-trump-control", action: "coinche" },
    { family: "Coinche par contrôles extérieurs", auction: "enemy-150", hand: "side-controls", reasonCode: "coinche-obvious-overbid", action: "coinche", overbidEvidence: "side-controls" },
    { family: "Coinche par maîtrise de l’atout", auction: "enemy-160", hand: "trump-lock", reasonCode: "coinche-obvious-overbid", action: "coinche", overbidEvidence: "trump-lock" },
    { family: "contrat haut mais défense insuffisante", auction: "enemy-160", hand: "weak", reasonCode: "weak-trump-foundation", action: "pass" },
    { family: "overcall après 90", auction: "enemy-90", hand: "autonomous-100", reasonCode: "competitive-overcall", action: "bid", value: 100 },
    { family: "longueur faible sans palier légal", auction: "enemy-80", hand: "weak-long", reasonCode: "weak-trump-foundation", action: "pass" },
    { family: "contrat 150 sans Coinche facile", auction: "enemy-150", hand: "autonomous-110", reasonCode: "pass-ceiling-too-low", action: "pass" },
    { family: "Coinche combinée", auction: "enemy-160", hand: "strong-fit", reasonCode: "coinche-obvious-overbid", action: "coinche", overbidEvidence: "combined" },
  ],
  3: [
    { family: "majeure manquante du partenaire", auction: "partner-80-spades", hand: "small-fit", reasonCode: "partner-fit", action: "bid", value: 90 },
    { family: "fit fort", auction: "partner-80-clubs", hand: "autonomous-100", reasonCode: "strong-partner-fit", action: "bid", value: 100 },
    { family: "respect de la couleur sans soutien", auction: "partner-80-clubs", hand: "no-fit", reasonCode: "partner-suit-respected", action: "pass" },
    { family: "changement exceptionnel de couleur", auction: "partner-80-clubs", hand: "override", reasonCode: "partner-suit-override", action: "bid", value: 90 },
    { family: "fit fort à cœur", auction: "partner-80-hearts", hand: "probe-nine", reasonCode: "strong-partner-fit", action: "bid", value: 100 },
    { family: "plafond faible malgré le partenaire", auction: "partner-90-hearts", hand: "weak-long", reasonCode: "weak-trump-foundation", action: "pass" },
    { family: "autre majeure manquante", auction: "partner-80-spades", hand: "probe-jack", reasonCode: "partner-fit", action: "bid", value: 90 },
    { family: "autre changement exceptionnel", auction: "partner-80-spades", hand: "autonomous-110", reasonCode: "partner-suit-override", action: "bid", value: 90 },
    { family: "pas de fit utile", auction: "partner-80-clubs", hand: "weak", reasonCode: "partner-suit-respected", action: "pass" },
    { family: "soutien après 90", auction: "partner-90-hearts", hand: "strong-fit", reasonCode: "strong-partner-fit", action: "bid", value: 110 },
  ],
  4: [
    { family: "rebid après soutien", auction: "rebid", hand: "probe-nine", reasonCode: "rebid-after-support", action: "bid", value: 100 },
    { family: "rebid compétitif soutenu", auction: "rebid-competitive", hand: "strong-fit", reasonCode: "rebid-after-support", action: "bid", value: 120 },
    { family: "overcall après notre ouverture", auction: "own-overcall", hand: "probe-nine", reasonCode: "competitive-overcall", action: "bid", value: 100 },
    { family: "Coinche après plusieurs annonces", auction: "high-competition", hand: "trump-lock", reasonCode: "coinche-obvious-overbid", action: "coinche", overbidEvidence: "trump-lock" },
    { family: "Surcoinche après notre contrat", auction: "doubled", hand: "masters", reasonCode: "surcoinche-large-margin", action: "surcoinche" },
    { family: "passe sur contrat contré", auction: "doubled", hand: "weak", reasonCode: "pass-contract-blocked", action: "pass" },
    { family: "fit dans une compétition", auction: "partnership-competition", hand: "strong-fit", reasonCode: "strong-partner-fit", action: "bid", value: 110 },
    { family: "partenaire sans marge compétitive", auction: "partnership-competition", hand: "side-controls", reasonCode: "pass-ceiling-too-low", action: "pass" },
    { family: "contrat haut à respecter", auction: "high-competition", hand: "weak", reasonCode: "weak-trump-foundation", action: "pass" },
    { family: "Coinche avec contrôles extérieurs", auction: "high-competition", hand: "side-controls", reasonCode: "coinche-obvious-overbid", action: "coinche", overbidEvidence: "side-controls" },
  ],
};

const c = (rank: Card["rank"], suit: Suit): Card => ({ rank, suit });
// Stable reference hands illustrate concepts away from incidental random thresholds.
const HANDS: Record<HandKey, readonly Card[]> = {
  weak: [c("7", "hearts"), c("8", "hearts"), c("Q", "hearts"), c("K", "hearts"), c("7", "clubs"), c("8", "clubs"), c("7", "diamonds"), c("8", "diamonds")],
  "weak-long": [c("7", "hearts"), c("8", "hearts"), c("Q", "hearts"), c("K", "hearts"), c("A", "clubs"), c("10", "clubs"), c("A", "diamonds"), c("10", "diamonds")],
  "probe-nine": [c("9", "hearts"), c("A", "hearts"), c("7", "hearts"), c("10", "spades"), c("10", "diamonds"), c("K", "diamonds"), c("7", "diamonds"), c("8", "clubs")],
  "probe-jack": [c("J", "spades"), c("A", "hearts"), c("K", "hearts"), c("Q", "hearts"), c("K", "diamonds"), c("Q", "diamonds"), c("8", "clubs"), c("7", "clubs")],
  "autonomous-100": [c("J", "clubs"), c("9", "clubs"), c("10", "clubs"), c("A", "hearts"), c("10", "hearts"), c("J", "spades"), c("9", "spades"), c("7", "diamonds")],
  "autonomous-110": [c("J", "diamonds"), c("9", "diamonds"), c("A", "diamonds"), c("K", "diamonds"), c("Q", "diamonds"), c("A", "hearts"), c("A", "clubs"), c("K", "spades")],
  classic: [c("J", "hearts"), c("9", "hearts"), c("A", "clubs"), c("10", "clubs"), c("A", "diamonds"), c("10", "diamonds"), c("A", "spades"), c("10", "spades")],
  "side-controls": [c("7", "hearts"), c("8", "hearts"), c("A", "clubs"), c("10", "clubs"), c("A", "diamonds"), c("10", "diamonds"), c("A", "spades"), c("10", "spades")],
  "trump-lock": [c("J", "hearts"), c("9", "hearts"), c("A", "hearts"), c("10", "hearts"), c("7", "clubs"), c("8", "clubs"), c("7", "diamonds"), c("8", "diamonds")],
  "small-fit": [c("9", "spades"), c("A", "hearts"), c("K", "hearts"), c("Q", "hearts"), c("K", "diamonds"), c("Q", "diamonds"), c("8", "clubs"), c("7", "clubs")],
  "strong-fit": [c("J", "hearts"), c("9", "hearts"), c("A", "hearts"), c("K", "hearts"), c("A", "clubs"), c("10", "clubs"), c("K", "spades"), c("7", "diamonds")],
  "no-fit": [c("K", "hearts"), c("Q", "hearts"), c("8", "hearts"), c("7", "hearts"), c("7", "clubs"), c("K", "diamonds"), c("Q", "diamonds"), c("8", "spades")],
  override: [c("J", "hearts"), c("9", "hearts"), c("A", "hearts"), c("K", "hearts"), c("A", "diamonds"), c("7", "clubs"), c("8", "clubs"), c("7", "spades")],
  masters: [c("J", "hearts"), c("9", "hearts"), c("A", "hearts"), c("10", "hearts"), c("K", "hearts"), c("A", "clubs"), c("A", "diamonds"), c("A", "spades")],
};

type AuctionStep = Parameters<typeof makeBid>[2];
const pass: AuctionStep = { action: "pass" };
const bid = (value: BidValue, trump: Suit): AuctionStep => ({ action: "bid", value, trump });
const AUCTIONS: Record<AuctionKey, { start: PlayerId; actions: readonly AuctionStep[] }> = {
  open: { start: 0, actions: [] },
  "enemy-80": { start: 3, actions: [bid(80, "hearts")] },
  "enemy-90": { start: 3, actions: [bid(90, "hearts")] },
  "enemy-100": { start: 3, actions: [bid(100, "hearts")] },
  "enemy-140": { start: 3, actions: [bid(140, "hearts")] },
  "enemy-150": { start: 3, actions: [bid(150, "hearts")] },
  "enemy-160": { start: 3, actions: [bid(160, "hearts")] },
  "partner-80-spades": { start: 2, actions: [bid(80, "spades"), pass] },
  "partner-80-clubs": { start: 2, actions: [bid(80, "clubs"), pass] },
  "partner-80-hearts": { start: 2, actions: [bid(80, "hearts"), pass] },
  "partner-90-hearts": { start: 2, actions: [bid(90, "hearts"), pass] },
  rebid: { start: 0, actions: [bid(80, "hearts"), pass, bid(90, "hearts"), pass] },
  "rebid-competitive": { start: 0, actions: [bid(80, "hearts"), bid(90, "clubs"), bid(100, "hearts"), pass] },
  "own-overcall": { start: 0, actions: [bid(80, "hearts"), pass, pass, bid(90, "clubs")] },
  "partnership-competition": { start: 1, actions: [bid(80, "clubs"), bid(90, "hearts"), bid(100, "diamonds")] },
  "high-competition": { start: 1, actions: [bid(80, "clubs"), pass, bid(150, "hearts")] },
  doubled: { start: 0, actions: [bid(120, "hearts"), { action: "coinche" }, pass, pass] },
};

export type BiddingSeriesOptions = { seed: number; level: BiddingLevel; generatorVersion: number; axisVersion: number };
export const BIDDING_MAX_ATTEMPTS = 4;

function rotateSuit(suit: Suit, shift: number): Suit {
  return SUITS[(SUITS.indexOf(suit) + shift) % SUITS.length];
}

function rotateAction(action: AuctionStep, shift: number): AuctionStep {
  if (action.action === "bid" || action.action === "capot" || action.action === "generale") {
    const mode = "trump" in action && action.trump ? { trump: rotateSuit(action.trump, shift) } : {};
    return { ...action, ...mode };
  }
  return action;
}

function makePosition(seed: number, slot: BiddingSlot, shift: number): GameState {
  const random = createSeededRandom(seed);
  const auction = AUCTIONS[slot.auction];
  let firstDraw = true;
  const initial = createInitialGame(() => {
    if (firstDraw) { firstDraw = false; return (auction.start + 0.1) / 4; }
    return random();
  }, { ruleset: CONTREE_KFFR_RULESET });
  const ownHand = sortHand(HANDS[slot.hand].map((card) => ({ ...card, suit: rotateSuit(card.suit, shift) })));
  const ownIds = new Set(ownHand.map(formatCard));
  if (ownHand.length !== 8 || ownIds.size !== 8) throw new Error(`Invalid bidding hand template: ${slot.hand}`);
  const remaining = fisherYatesShuffle(createDeck().filter((card) => !ownIds.has(formatCard(card))), random);
  let state: GameState = { ...initial, hands: {
    0: ownHand, 1: remaining.slice(0, 8), 2: remaining.slice(8, 16), 3: remaining.slice(16, 24),
  } };
  for (const action of auction.actions) state = makeBid(state, state.currentPlayerId, rotateAction(action, shift));
  if (state.phase !== "bidding" || state.currentPlayerId !== 0) throw new Error(`Invalid bidding auction: ${slot.auction}`);
  return state;
}

function toBiddingAnswer(bid: ReturnType<typeof chooseAdvancedRulesBidWithTrace>["bid"]): BiddingAnswer {
  if (bid.action === "pass" || bid.action === "coinche" || bid.action === "surcoinche") return { action: bid.action };
  if (bid.action === "generale") throw new Error("Générale is unsupported in bidding axis v1.");
  if (bid.action === "capot") {
    const trump = bid.contractMode.kind === "suit" ? bid.contractMode.suit : undefined;
    if (!trump) throw new Error("A suit decision is required in bidding axis v1.");
    return { action: "capot", trump };
  }
  if (bid.action === "bid" && "value" in bid) {
    const trump = bid.contractMode?.kind === "suit" ? bid.contractMode.suit : bid.trump;
    if (!trump) throw new Error("A suit decision is required in bidding axis v1.");
    return { action: "bid", value: bid.value, trump };
  }
  throw new Error("Unsupported bidding action for training axis v1.");
}

export function assertBiddingDoctrineVersion(trace: Pick<AdvancedRulesBidTrace, "doctrineId" | "doctrineRevision">): void {
  if (trace.doctrineId !== BIDDING_DOCTRINE_ID || trace.doctrineRevision !== BIDDING_DOCTRINE_REVISION) {
    throw new Error("Unsupported bidding doctrine revision for training axis v1.");
  }
}

function buildExercise(state: GameState, seed: number, level: BiddingLevel): BiddingExercise {
  if (JSON.stringify(resolveGameRules(state.settings)) !== JSON.stringify(CONTREE_KFFR_RULESET)) {
    throw new Error("Bidding axis v1 requires contree-kffr ruleset version 1.");
  }
  const decision = chooseAdvancedRulesBidWithTrace(state);
  assertBiddingDoctrineVersion(decision.trace);
  return {
    axisId: BIDDING_AXIS_ID, axisVersion: BIDDING_AXIS_VERSION,
    doctrineId: BIDDING_DOCTRINE_ID, doctrineRevision: BIDDING_DOCTRINE_REVISION,
    level, seed, generatorVersion, rulesetId: "contree-kffr", rulesetVersion: 1,
    ownHand: [...state.hands[0]], playerNames: {
      0: state.playerNames?.[0] ?? "Toi", 1: state.playerNames?.[1] ?? "Adversaire gauche",
      2: state.playerNames?.[2] ?? "Partenaire", 3: state.playerNames?.[3] ?? "Adversaire droite",
    },
    publicBids: state.bids.map((bid) => ({ ...bid })), currentContract: getCurrentContract(state),
    startingPlayerId: state.startingPlayerId, question: "Quelle annonce fais-tu ?",
    expected: toBiddingAnswer(decision.bid), trace: decision.trace,
  };
}

function matchesSlot(exercise: BiddingExercise, slot: BiddingSlot): boolean {
  return exercise.trace.reasonCode === slot.reasonCode
    && exercise.expected.action === slot.action
    && (slot.value === undefined || (exercise.expected.action === "bid" && exercise.expected.value === slot.value))
    && (slot.overbidEvidence === undefined || exercise.trace.overbidEvidence === slot.overbidEvidence);
}

/** Exported for engine tests; the browser receives only buildExercise's public projection. */
export function selectBiddingPosition(seed: number, slot: BiddingSlot, level: BiddingLevel): { state: GameState; exercise: BiddingExercise } {
  if (!Number.isSafeInteger(seed)) throw new Error("Bidding seed must be a safe integer.");
  const rotation = Math.floor(createSeededRandom(seed ^ 0x42494444)() * SUITS.length);
  for (let attempt = 0; attempt < BIDDING_MAX_ATTEMPTS; attempt += 1) {
    const candidateSeed = seed + attempt;
    const state = makePosition(candidateSeed, slot, (rotation + attempt) % SUITS.length);
    const exercise = buildExercise(state, candidateSeed, level);
    if (!matchesSlot(exercise, slot)) continue;
    // Never expose a decision that the real bidding engine would reject.
    makeBid(state, 0, exercise.expected);
    return { state, exercise };
  }
  throw new Error(`No V4.1 bidding position for ${slot.family} after ${BIDDING_MAX_ATTEMPTS} attempts (seed ${seed}).`);
}

export function generateBiddingSeries(options: BiddingSeriesOptions): BiddingExercise[] {
  const { seed, level, generatorVersion: requestedVersion, axisVersion } = options;
  if (requestedVersion !== generatorVersion) throw new Error(`Unsupported training generator version: ${requestedVersion}`);
  if (axisVersion !== BIDDING_AXIS_VERSION) throw new Error(`Unsupported bidding axis version: ${axisVersion}`);
  if (level !== 1 && level !== 2 && level !== 3 && level !== 4) throw new Error(`Unknown bidding level: ${level}`);
  if (!Number.isSafeInteger(seed)) throw new Error("Bidding seed must be a safe integer.");
  return BIDDING_LEVEL_SLOTS[level].map((slot, index) => selectBiddingPosition(seed + index * 1_000, slot, level).exercise);
}

export function formatBiddingAnswer(answer: BiddingAnswer): string {
  switch (answer.action) {
    case "pass": return "Passe";
    case "coinche": return "Coinche";
    case "surcoinche": return "Surcoinche";
    case "capot": return `Capot ${SUIT_SYMBOLS[answer.trump]}`;
    case "bid": return `${answer.value} ${SUIT_SYMBOLS[answer.trump]}`;
  }
}

function parseAnswer(value: unknown): BiddingAnswer | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const candidate = value as Record<string, unknown>;
  const keys = Object.keys(candidate).sort().join(",");
  if ((candidate.action === "pass" || candidate.action === "coinche" || candidate.action === "surcoinche") && keys === "action") {
    return { action: candidate.action };
  }
  if (candidate.action === "capot" && keys === "action,trump" && SUITS.includes(candidate.trump as Suit)) {
    return { action: "capot", trump: candidate.trump as Suit };
  }
  if (candidate.action === "bid" && keys === "action,trump,value" && BID_VALUES.includes(candidate.value as BidValue)
    && SUITS.includes(candidate.trump as Suit)) {
    return { action: "bid", value: candidate.value as BidValue, trump: candidate.trump as Suit };
  }
  return null;
}

export function gradeBiddingExercise(exercise: BiddingExercise, answer: unknown): { correct: boolean; score: 0 | 1 } {
  const parsed = parseAnswer(answer);
  const correct = parsed !== null && JSON.stringify(parsed) === JSON.stringify(exercise.expected);
  return { correct, score: correct ? 1 : 0 };
}

export const biddingAxis: TrainingAxis<BiddingExercise> = {
  id: BIDDING_AXIS_ID, label: "Faire son annonce",
  createExercise: (position) => {
    if (position.state.phase !== "bidding" || position.state.currentPlayerId !== 0) {
      throw new Error("A bidding exercise requires seat 0 to be speaking.");
    }
    return buildExercise(position.state, position.seed, 1);
  },
};
