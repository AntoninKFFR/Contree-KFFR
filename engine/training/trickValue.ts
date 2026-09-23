import { resolveContractMode } from "@/engine/contractMode";
import { playCard, playableCardsForCurrentPlayer } from "@/engine/game";
import { createSeededRandom } from "@/engine/random";
import { playerTeam, trickPoints } from "@/engine/rules";
import { resolveGameRules } from "@/engine/rulesets/resolve";
import { generateTrainingPosition, generateTrainingSeries, generatorVersion, type TrainingPosition } from "@/engine/training/generator";
import type { TrainingAxis } from "@/engine/training/registry";
import type { ContractMode, GameState, PlayedCard } from "@/engine/types";

export type TrickValueLevel = 1 | 2;
export const TRICK_VALUE_SERIES_LENGTH = 10;
export const TRICK_VALUE_LAST_TRICK_INDICES = [2, 5, 8] as const;

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

export function createTrickValueExercise(position: TrainingPosition): TrickValueExercise {
  let state = position.state;
  if (state.phase !== "playing" && !(state.phase === "finished" && state.completedTricks.length === 8)) {
    throw new Error("A trick-value exercise requires a playing position or a completed round.");
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

function standardLastTrick(seed: number, requestedVersion: number): TrickValueExercise {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const candidateSeed = seed + attempt * TRICK_VALUE_SERIES_LENGTH;
    const position = generateTrainingPosition({ seed: candidateSeed, generatorVersion: requestedVersion });
    const state = finishRound(position);
    if (state.completedTricks.length !== 8) continue;
    const exercise = createTrickValueExercise({ ...position, state });
    const rules = resolveGameRules(state.settings);
    if (exercise.isCapot || exercise.bonusPoints !== rules.trickScoring.lastTrickBonus) continue;
    if (exercise.answer !== state.completedTricks[7].points) {
      throw new Error("Training answer differs from the game engine's completed trick.");
    }
    return exercise;
  }
  throw new Error(`Could not generate a standard last trick for seed ${seed}.`);
}

export function generateTrickValueSeries(options: TrickValueSeriesOptions): TrickValueExercise[] {
  const { seed, level, generatorVersion: requestedVersion } = options;
  if (level !== 1 && level !== 2) throw new Error(`Unknown trick-value level: ${level}`);
  const positions = generateTrainingSeries({ seed, generatorVersion: requestedVersion, count: TRICK_VALUE_SERIES_LENGTH });
  return positions.map((position, index) => {
    if (level === 2 && TRICK_VALUE_LAST_TRICK_INDICES.some((lastIndex) => lastIndex === index)) {
      return standardLastTrick(position.seed, requestedVersion);
    }
    const exercise = trickValueAxis.createExercise(position);
    if (exercise.isLastTrick) throw new Error("An ordinary exercise unexpectedly contains a last trick.");
    return exercise;
  });
}
