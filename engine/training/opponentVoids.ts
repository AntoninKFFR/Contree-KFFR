import { cardId, SUITS } from "@/engine/cards";
import { getRemainingTrumps, inferVoidSuitsByPlayer } from "@/engine/knowledge/tableKnowledge";
import { generateTrainingPosition, generatorVersion, type TrainingPosition } from "@/engine/training/generator";
import type { Card, GameState, PlayedCard, PlayerId, Suit } from "@/engine/types";

export const OPPONENT_VOIDS_LEVELS = 3;
export const OPPONENT_VOIDS_SERIES_LENGTH = 10;
export const OPPONENT_PLAYERS = [1, 2, 3] as const;
const MAX_ATTEMPTS = 512;

export function voidCellId(playerId: PlayerId, suit: Suit): string {
  return `${playerId}:${suit}`;
}

export type VoidProof = { trickNumber: number; playerId: PlayerId; suit: Suit };
export type OpponentVoidsExercise = {
  axisId: "opponent-voids";
  level: number;
  seed: number;
  generatorVersion: typeof generatorVersion;
  players: PlayerId[];
  suits: Suit[];
  expectedCells: string[];
  expectedTrumpCount: number | null;
  proofs: Record<string, VoidProof>;
  trump: Suit;
  observation: { completedTricks: PlayedCard[][]; currentCards: PlayedCard[]; ownHand?: Card[] };
  playerNames: Record<PlayerId, string>;
};

export type OpponentVoidsGrade = {
  correct: boolean;
  score: 0 | 1;
  correctCells: string[];
  missedCells: string[];
  unprovedCells: string[];
  trumpCountCorrect: boolean | null;
};

export function parseOpponentVoidsLevel(value: unknown): number | null {
  if (typeof value !== "string" || !/^[1-3]$/.test(value)) return null;
  return Number(value);
}

function publicProofs(state: GameState): Record<string, VoidProof> {
  const proofs: Record<string, VoidProof> = {};
  state.completedTricks.forEach((trick, trickIndex) => {
    const leadSuit = trick.cards[0]?.card.suit;
    if (!leadSuit) return;
    for (const played of trick.cards.slice(1)) {
      if (played.card.suit !== leadSuit) {
        const key = voidCellId(played.playerId, leadSuit);
        proofs[key] ??= { trickNumber: trickIndex + 1, playerId: played.playerId, suit: leadSuit };
      }
    }
  });
  return proofs;
}

export function createOpponentVoidsExercise(level: number, state: GameState, seed: number, targetProven?: boolean): OpponentVoidsExercise {
  if (!Number.isInteger(level) || level < 1 || level > OPPONENT_VOIDS_LEVELS) throw new Error("Invalid opponent-voids level.");
  if (!state.trump || state.completedTricks.length < 1 || state.currentTrick.cards.length !== 0) {
    throw new Error("Opponent-voids exercise requires a completed trick and a trick-start position.");
  }
  const inferred = inferVoidSuitsByPlayer(state, 0);
  const allCells = OPPONENT_PLAYERS.flatMap((playerId) => SUITS.map((suit) => voidCellId(playerId, suit)));
  const proven = new Set(OPPONENT_PLAYERS.flatMap((playerId) => inferred[playerId].map((suit) => voidCellId(playerId, suit))));
  const eligible = level === 1 && targetProven !== undefined ? allCells.filter((key) => proven.has(key) === targetProven) : allCells;
  if (eligible.length === 0) throw new Error("No matching player-suit pair in this position.");
  const chosen = eligible[(seed >>> 0) % eligible.length];
  const players = level === 1 ? [Number(chosen.split(":")[0]) as PlayerId] : [...OPPONENT_PLAYERS];
  const suits = level === 1 ? [chosen.split(":")[1] as Suit] : [...SUITS];
  const expectedCells = allCells.filter((key) => proven.has(key) && (level !== 1 || key === chosen));
  const ownTrumpIds = new Set(state.hands[0].filter((card) => card.suit === state.trump).map(cardId));
  const expectedTrumpCount = level === 3 ? getRemainingTrumps(state, 0).filter((card) => !ownTrumpIds.has(cardId(card))).length : null;
  const evidence = publicProofs(state);
  const proofs = Object.fromEntries(expectedCells.filter((key) => evidence[key]).map((key) => [key, evidence[key]]));
  return {
    axisId: "opponent-voids", level, seed, generatorVersion, players, suits, expectedCells, expectedTrumpCount, proofs,
    trump: state.trump,
    observation: {
      completedTricks: state.completedTricks.map((trick) => trick.cards.map((played) => ({ ...played }))),
      currentCards: [],
      ...(level === 3 ? { ownHand: [...state.hands[0]] } : {}),
    },
    playerNames: state.playerNames ?? { 0: "Joueur 1", 1: "Joueur 2", 2: "Joueur 3", 3: "Joueur 4" },
  };
}

export function gradeOpponentVoidsExercise(exercise: OpponentVoidsExercise, selectedCells: readonly string[], trumpCount: number | null): OpponentVoidsGrade {
  const expected = new Set(exercise.expectedCells);
  const selected = new Set(selectedCells);
  const allowed = new Set(exercise.players.flatMap((playerId) => exercise.suits.map((suit) => voidCellId(playerId, suit))));
  const correctCells = [...selected].filter((key) => expected.has(key));
  const missedCells = exercise.expectedCells.filter((key) => !selected.has(key));
  const unprovedCells = [...selected].filter((key) => !expected.has(key));
  const validSelection = selected.size === selectedCells.length && [...selected].every((key) => allowed.has(key));
  const trumpCountCorrect = exercise.level === 3 ? Number.isInteger(trumpCount) && trumpCount === exercise.expectedTrumpCount : null;
  const correct = validSelection && missedCells.length === 0 && unprovedCells.length === 0 && (trumpCountCorrect ?? true);
  return { correct, score: correct ? 1 : 0, correctCells, missedCells, unprovedCells, trumpCountCorrect };
}

export function generateOpponentVoidsSeries(options: { level: number; seed: number; generatorVersion: number }): OpponentVoidsExercise[] {
  if (!Number.isInteger(options.level) || options.level < 1 || options.level > OPPONENT_VOIDS_LEVELS) throw new Error("Invalid opponent-voids level.");
  const series: OpponentVoidsExercise[] = [];
  for (let index = 0; index < OPPONENT_VOIDS_SERIES_LENGTH; index += 1) {
    const targetProven = options.level === 1 ? index % 2 === 0 : undefined;
    let found: OpponentVoidsExercise | null = null;
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
      const candidateSeed = options.seed + index + attempt * OPPONENT_VOIDS_SERIES_LENGTH;
      const position: TrainingPosition = generateTrainingPosition({ seed: candidateSeed, generatorVersion: options.generatorVersion });
      const state = position.state;
      if (!state.trump || state.completedTricks.length === 0 || state.currentTrick.cards.length !== 0) continue;
      const inferred = inferVoidSuitsByPlayer(state, 0);
      const provenCount = OPPONENT_PLAYERS.reduce((count, playerId) => count + inferred[playerId].length, 0);
      if ((options.level >= 2 || targetProven) && provenCount === 0) continue;
      found = createOpponentVoidsExercise(options.level, state, candidateSeed, targetProven);
      break;
    }
    if (!found) throw new Error(`Could not generate opponent-voids level ${options.level} exercise ${index + 1}.`);
    series.push(found);
  }
  return series;
}

export const opponentVoidsAxis = {
  id: "opponent-voids", label: "Jeu des autres",
  createExercise: (position: TrainingPosition) => createOpponentVoidsExercise(1, position.state, position.seed),
};
