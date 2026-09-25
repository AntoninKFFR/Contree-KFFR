import { cardId, createDeck, RANKS, SUITS, SUIT_LABELS } from "@/engine/cards";
import { getMasterCardsStillOutBySuit, getPlayedCards, getRemainingCardsBySuit } from "@/engine/knowledge/tableKnowledge";
import { generateTrainingPosition, generatorVersion } from "@/engine/training/generator";
import type { Card, GameState, PlayedCard, PlayerId, Suit } from "@/engine/types";

export const MEMORY_AXIS_IDS = ["master-cards", "master-in-hand", "played-cards", "trick-recall"] as const;
export type MemoryAxisId = typeof MEMORY_AXIS_IDS[number];
export const MEMORY_LEVELS: Record<MemoryAxisId, number> = {
  "master-cards": 3, "master-in-hand": 2, "played-cards": 5, "trick-recall": 4,
};
export const MEMORY_LABELS: Record<MemoryAxisId, string> = {
  "master-cards": "Cartes maîtresses",
  "master-in-hand": "Maîtresses en main",
  "played-cards": "Cartes tombées",
  "trick-recall": "Mémoire d’un pli",
};
export const MEMORY_SERIES_LENGTH = 10;
const MAX_ATTEMPTS = 64;
const PLAYER_IDS: PlayerId[] = [0, 1, 2, 3];

export type MemoryExercise = {
  axisId: MemoryAxisId;
  level: number;
  seed: number;
  generatorVersion: typeof generatorVersion;
  question: string;
  candidates: Card[];
  expectedIds: string[];
  expectedPlayers: Partial<Record<string, PlayerId>>;
  requiresPlayers: boolean;
  maxSelections?: number;
  trump: Suit;
  observation: { completedTricks: PlayedCard[][]; currentCards: PlayedCard[]; ownHand?: Card[] };
  playerNames: Record<PlayerId, string>;
};

export type MemoryGrade = {
  correct: boolean;
  score: number;
  correctIds: string[];
  missedIds: string[];
  extraIds: string[];
  correctPlayers: number;
  wrongPlayers: string[];
};

export function isMemoryAxisId(value: string): value is MemoryAxisId {
  return MEMORY_AXIS_IDS.some((id) => id === value);
}

export function parseMemoryLevel(axisId: MemoryAxisId, value: unknown): number | null {
  if (typeof value !== "string" || !/^[1-9]\d*$/.test(value)) return null;
  const level = Number(value);
  return level <= MEMORY_LEVELS[axisId] ? level : null;
}

function suitCards(suit: Suit): Card[] {
  return RANKS.map((rank) => ({ suit, rank }));
}

function pickSuit(seed: number, suits: readonly Suit[]): Suit {
  return suits[(seed >>> 0) % suits.length];
}

function expectedFrom(candidates: Card[], correctCards: Card[]): string[] {
  const ids = new Set(correctCards.map(cardId));
  return candidates.map(cardId).filter((id) => ids.has(id));
}

export function createMemoryExercise(axisId: MemoryAxisId, level: number, state: GameState, seed: number,
  options: { trickIndex?: number } = {}): MemoryExercise {
  if (!Number.isInteger(level) || level < 1 || level > MEMORY_LEVELS[axisId]) throw new Error("Invalid memory level.");
  if (!state.trump || state.completedTricks.length < (axisId === "trick-recall" && level === 3 ? 2 : 1)) {
    throw new Error("Memory exercise requires a trump and completed tricks.");
  }
  const trump = state.trump;
  const nonTrump = SUITS.filter((suit) => suit !== trump);
  let candidates: Card[] = [];
  let expected: Card[] = [];
  let question = "";
  let requiresPlayers = false;
  let expectedPlayers: Partial<Record<string, PlayerId>> = {};

  if (axisId === "master-cards") {
    const masters = getMasterCardsStillOutBySuit(state, 0);
    const suit = level === 1 ? pickSuit(seed, nonTrump) : trump;
    candidates = level === 3 ? createDeck() : suitCards(suit);
    expected = (level === 3 ? SUITS : [suit]).flatMap((candidateSuit) => masters[candidateSuit] ? [masters[candidateSuit]] : []);
    question = level === 3 ? "Sélectionne les cartes maîtresses encore en jeu."
      : level === 2 ? "Quelle est la maîtresse à l’atout ?"
        : `Quelle est la carte maîtresse encore en jeu à ${SUIT_LABELS[suit].toLowerCase()} ?`;
  } else if (axisId === "master-in-hand") {
    const remaining = getRemainingCardsBySuit(state, 0);
    const hand = state.hands[0];
    const handIds = new Set(hand.map(cardId));
    const suitsInHand = SUITS.filter((suit) => hand.some((card) => card.suit === suit));
    const suit = pickSuit(seed, suitsInHand);
    candidates = level === 1 ? hand.filter((card) => card.suit === suit) : [...hand];
    expected = (level === 1 ? [suit] : SUITS).flatMap((candidateSuit) => {
      const cascade: Card[] = [];
      for (const card of remaining[candidateSuit]) {
        if (!handIds.has(cardId(card))) break;
        cascade.push(card);
      }
      return cascade;
    });
    question = level === 1 ? `Quelles cartes sont maîtresses à ${SUIT_LABELS[suit].toLowerCase()} ?` : "Sélectionne toutes tes cartes maîtresses.";
  } else if (axisId === "played-cards") {
    const remaining = getRemainingCardsBySuit(state, 0);
    const suit = level === 3 ? pickSuit(seed, nonTrump) : trump;
    candidates = level === 1 ? createDeck().filter((card) => card.rank === "A")
      : level === 2 ? createDeck().filter((card) => card.rank === "A" || card.rank === "10")
        : level === 5 ? createDeck() : suitCards(suit);
    expected = SUITS.flatMap((candidateSuit) => remaining[candidateSuit]);
    question = level === 1 ? "Quels As sont encore en jeu ?"
      : level === 2 ? "Quels As et 10 sont encore en jeu ?"
        : level === 3 ? `Quelles cartes de ${SUIT_LABELS[suit].toLowerCase()} sont encore en jeu ?`
          : level === 4 ? "Quels atouts sont encore en jeu ?" : "Quelles cartes sont encore en jeu ?";
  } else {
    const tricks = state.completedTricks;
    if (level === 4 && tricks.length < 3) throw new Error("Historical recall requires several completed tricks.");
    const trickIndex = options.trickIndex ?? (level === 3 ? tricks.length - 2 : level === 4 ? (seed >>> 0) % tricks.length : tricks.length - 1);
    if (!Number.isInteger(trickIndex) || trickIndex < 0 || trickIndex >= tricks.length) throw new Error("Invalid recalled trick.");
    const played = tricks[trickIndex].cards;
    candidates = createDeck();
    expected = played.map(({ card }) => card);
    requiresPlayers = level === 2 || level === 4;
    expectedPlayers = Object.fromEntries(played.map(({ card, playerId }) => [cardId(card), playerId]));
    question = `Reconstitue le pli n°${trickIndex + 1}${requiresPlayers ? " et attribue chaque carte à son joueur" : ""}.`;
  }

  return {
    axisId, level, seed, generatorVersion, question, candidates, expectedIds: expectedFrom(candidates, expected),
    expectedPlayers, requiresPlayers, maxSelections: axisId === "trick-recall" ? 4 : axisId === "master-cards" && level < 3 ? 1 : undefined,
    trump,
    observation: {
      completedTricks: state.completedTricks.map((trick) => trick.cards.map((played) => ({ ...played }))),
      currentCards: state.currentTrick.cards.map((played) => ({ ...played })),
      ...(axisId === "master-in-hand" ? { ownHand: [...state.hands[0]] } : {}),
    },
    playerNames: state.playerNames ?? { 0: "Joueur 1", 1: "Joueur 2", 2: "Joueur 3", 3: "Joueur 4" },
  };
}

export function gradeMemoryExercise(exercise: MemoryExercise, selectedIds: readonly string[], assignments: Partial<Record<string, PlayerId>> = {}): MemoryGrade {
  const candidates = new Set(exercise.candidates.map(cardId));
  const selected = new Set(selectedIds);
  if (selected.size !== selectedIds.length || [...selected].some((id) => !candidates.has(id))) throw new Error("Invalid card selection.");
  if (exercise.maxSelections !== undefined && selected.size > exercise.maxSelections) throw new Error("Too many cards selected.");
  if (exercise.axisId === "trick-recall" && selected.size !== 4) throw new Error("Select exactly four cards.");
  const expected = new Set(exercise.expectedIds);
  const correctIds = [...selected].filter((id) => expected.has(id));
  const missedIds = exercise.expectedIds.filter((id) => !selected.has(id));
  const extraIds = [...selected].filter((id) => !expected.has(id));
  const correctPlayers = exercise.requiresPlayers ? correctIds.filter((id) => assignments[id] === exercise.expectedPlayers[id]).length : 0;
  const wrongPlayers = exercise.requiresPlayers ? correctIds.filter((id) => assignments[id] !== exercise.expectedPlayers[id]) : [];
  const score = exercise.axisId === "trick-recall"
    ? (correctIds.length + correctPlayers) / (exercise.requiresPlayers ? 8 : 4)
    : Number(missedIds.length === 0 && extraIds.length === 0);
  return { correct: score === 1, score, correctIds, missedIds, extraIds, correctPlayers, wrongPlayers };
}

export function generateMemorySeries(options: { axisId: MemoryAxisId; level: number; seed: number; generatorVersion: number }): MemoryExercise[] {
  const { axisId, level, seed } = options;
  if (level < 1 || level > MEMORY_LEVELS[axisId] || !Number.isInteger(level)) throw new Error("Invalid memory level.");
  const exercises: MemoryExercise[] = [];
  for (let index = 0; index < MEMORY_SERIES_LENGTH; index += 1) {
    let found: MemoryExercise | null = null;
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
      const candidateSeed = seed + index + attempt * MEMORY_SERIES_LENGTH;
      const { state } = generateTrainingPosition({ seed: candidateSeed, generatorVersion: options.generatorVersion });
      const playedCount = getPlayedCards(state, 0).length;
      if (state.completedTricks.length < (axisId === "trick-recall" && level === 4 ? 3 : axisId === "trick-recall" && level === 3 ? 2 : 1)) continue;
      if (axisId !== "trick-recall" && playedCount < 8) continue;
      if (axisId === "master-in-hand" && state.hands[0].length === 0) continue;
      const exercise = createMemoryExercise(axisId, level, state, candidateSeed);
      if (axisId === "master-cards" && exercise.expectedIds.length === 0) continue;
      found = exercise;
      break;
    }
    if (!found) throw new Error(`Could not generate ${axisId} level ${level} exercise ${index + 1}.`);
    exercises.push(found);
  }
  return exercises;
}

export const MEMORY_PLAYERS = PLAYER_IDS;
