import { resolveContractMode } from "@/engine/contractMode";
import { playCard, playableCardsForCurrentPlayer } from "@/engine/game";
import { createSeededRandom } from "@/engine/random";
import { playerTeam, trickPoints } from "@/engine/rules";
import { resolveGameRules } from "@/engine/rulesets/resolve";
import { generateTrainingPosition, generatorVersion, type TrainingPosition } from "@/engine/training/generator";
import type { TrainingAxis } from "@/engine/training/registry";
import type { ContractMode, GameState, PlayedCard } from "@/engine/types";

export type TrickValueLevel = 1 | 2;
export const TRICK_VALUE_SERIES_LENGTH = 10;
export const TRICK_VALUE_LAST_TRICK_INDICES = [2, 5, 8] as const;
const MAX_CANDIDATE_ATTEMPTS = 100;
type OrdinaryKind = "ordinary" | "has-trump" | "trump-rich" | "cut";
export type TrickValueSlotKind = OrdinaryKind | "last-trick";

// Each slot has its own seed lane. The categories are deliberately separate slots:
// cuts also contain trump, so levels 1 and 2 get at least six and five trump situations respectively.
export const TRICK_VALUE_LEVEL_SLOTS: Record<TrickValueLevel, readonly TrickValueSlotKind[]> = {
  1: ["has-trump", "cut", "ordinary", "has-trump", "ordinary", "cut", "has-trump", "ordinary", "has-trump", "ordinary"],
  2: ["trump-rich", "cut", "last-trick", "ordinary", "trump-rich", "last-trick", "cut", "ordinary", "last-trick", "trump-rich"],
};

export type TrickValueExercise = {
  seed: number;
  generatorVersion: typeof generatorVersion;
  cards: PlayedCard[];
  contractMode: ContractMode;
  trickNumber: number;
  isLastTrick: boolean;
  isCapot: boolean;
  bonusPoints: number;
  answer: number;
};

export type TrickValueSeriesOptions = {
  seed: number;
  generatorVersion: number;
  level: TrickValueLevel;
};

export function classifyTrickValueExercise(exercise: TrickValueExercise): { trumpCount: number; isCut: boolean; isLastTrick: boolean } {
  if (exercise.contractMode.kind !== "suit") return { trumpCount: 0, isCut: false, isLastTrick: exercise.isLastTrick };
  const trump = exercise.contractMode.suit;
  const trumpCount = exercise.cards.filter(({ card }) => card.suit === trump).length;
  return {
    trumpCount,
    isCut: exercise.cards[0].card.suit !== trump && exercise.cards.slice(1).some(({ card }) => card.suit === trump),
    isLastTrick: exercise.isLastTrick,
  };
}

export function createTrickValueExercise(position: TrainingPosition): TrickValueExercise {
  let state = position.state;
  if (state.phase !== "playing" && !((state.phase === "finished" || state.phase === "game-over") && state.completedTricks.length > 0)) {
    throw new Error("A trick-value exercise requires a playing position or a completed trick.");
  }
  const mode = resolveContractMode(state);
  if (!mode) throw new Error("A trick-value exercise requires a contract mode.");

  if (state.completedTricks.length === 0) {
    const random = createSeededRandom(position.seed ^ 0x54524943);
    while (state.completedTricks.length === 0) {
      const legalCards = playableCardsForCurrentPlayer(state);
      state = playCard(state, state.currentPlayerId, legalCards[Math.floor(random() * legalCards.length)]);
    }
  }

  const trick = state.completedTricks.at(-1)!;
  const trickNumber = state.completedTricks.length;
  const isLastTrick = trickNumber === 8;
  const rules = resolveGameRules(state.settings);
  const isCapot = isLastTrick
    && rules.trickScoring.capotLastTrickBonus !== rules.trickScoring.lastTrickBonus
    && state.completedTricks.slice(0, -1).every((played) => playerTeam(played.winnerId) === playerTeam(trick.winnerId));
  return {
    seed: position.seed,
    generatorVersion: position.generatorVersion,
    cards: trick.cards,
    contractMode: mode,
    trickNumber,
    isLastTrick,
    isCapot,
    bonusPoints: isLastTrick ? (isCapot ? rules.trickScoring.capotLastTrickBonus : rules.trickScoring.lastTrickBonus) : 0,
    answer: trickPoints(trick.cards, mode, isLastTrick, isCapot, rules.trickScoring),
  };
}

export const trickValueAxis: TrainingAxis<TrickValueExercise> = {
  id: "trick-value",
  label: "Valeur d’un pli",
  createExercise: createTrickValueExercise,
};

function finishRound(position: TrainingPosition): GameState {
  const random = createSeededRandom(position.seed ^ 0x4445524e);
  let state = position.state;
  while (state.phase === "playing") {
    const legalCards = playableCardsForCurrentPlayer(state);
    state = playCard(state, state.currentPlayerId, legalCards[Math.floor(random() * legalCards.length)]);
  }
  return state;
}

function matchesSlot(exercise: TrickValueExercise, kind: TrickValueSlotKind): boolean {
  const classification = classifyTrickValueExercise(exercise);
  if (kind === "last-trick") return exercise.isLastTrick && !exercise.isCapot && exercise.bonusPoints === 10;
  if (exercise.isLastTrick) return false;
  if (kind === "cut") return classification.isCut;
  if (kind === "trump-rich") return classification.trumpCount >= 2;
  if (kind === "has-trump") return classification.trumpCount >= 1;
  return classification.trumpCount === 0;
}

export function selectTrickValueExercise(seed: number, requestedVersion: number, kind: TrickValueSlotKind): TrickValueExercise {
  for (let attempt = 0; attempt < MAX_CANDIDATE_ATTEMPTS; attempt += 1) {
    const candidateSeed = seed + attempt * TRICK_VALUE_SERIES_LENGTH;
    const position = generateTrainingPosition({ seed: candidateSeed, generatorVersion: requestedVersion });
    if (kind === "last-trick") {
      const state = finishRound(position);
      if (state.completedTricks.length !== 8) continue;
      const exercise = createTrickValueExercise({ ...position, state });
      if (!matchesSlot(exercise, kind)) continue;
      if (exercise.answer !== state.completedTricks[7].points) {
        throw new Error("Training answer differs from the game engine's completed trick.");
      }
      return exercise;
    }
    const exercise = createTrickValueExercise(position);
    if (matchesSlot(exercise, kind)) return exercise;
  }
  throw new Error(`Could not generate a ${kind} trick-value exercise for seed ${seed} after ${MAX_CANDIDATE_ATTEMPTS} attempts.`);
}

export function generateTrickValueSeries(options: TrickValueSeriesOptions): TrickValueExercise[] {
  const { seed, level, generatorVersion: requestedVersion } = options;
  if (level !== 1 && level !== 2) throw new Error(`Unknown trick-value level: ${level}`);
  return TRICK_VALUE_LEVEL_SLOTS[level].map((kind, index) => selectTrickValueExercise(seed + index, requestedVersion, kind));
}
