import { getContractProgress } from "@/engine/contractProgress";
import { createSeededRandom } from "@/engine/random";
import {
  COUNTING_SERIES_LENGTH, countingReplay, MAX_COUNTING_ATTEMPTS, playOn, stateAfterTricks, type CountingReplay,
} from "@/engine/training/counting";
import { generateTrainingRound, generatorVersion, type TrainingPosition } from "@/engine/training/generator";
import type { TrainingAxis } from "@/engine/training/registry";
import type { GameState, TeamId } from "@/engine/types";

export type RunningScoreLevel = 1 | 2 | 3;
export const RUNNING_SCORE_LEVELS = [1, 2, 3] as const;
export const RUNNING_SCORE_SERIES_LENGTH = COUNTING_SERIES_LENGTH;
/** The replay stops mid-round: never before the second trick, never after the seventh. */
export const RUNNING_SCORE_MIN_TRICKS = 2;
export const RUNNING_SCORE_MAX_TRICKS = 7;

export type RunningScoreQuestion =
  | { kind: "own-team" }
  | { kind: "both-teams" }
  | { kind: "points-needed"; takerTeam: TeamId };

export type RunningScoreExercise = CountingReplay & {
  seed: number;
  generatorVersion: typeof generatorVersion;
  level: RunningScoreLevel;
  stopAfterTricks: number;
  question: RunningScoreQuestion;
  /** One value, or one value per team (team 0 first). */
  expected: number[];
  explanation: {
    trickPoints: Record<TeamId, number>;
    belotePointsByTeam: Record<TeamId, number>;
    takerTeam: TeamId;
    takerPoints: number;
    defenderPoints: number;
    target: number;
    pointsNeeded: number;
  };
};

export type RunningScoreSeriesOptions = { seed: number; generatorVersion: number; level: RunningScoreLevel };

type ExerciseSource = { seed: number; generatorVersion: typeof generatorVersion; snapshot: GameState };

/** Returns null when the snapshot cannot carry this level's question (e.g. nothing left to make at level 3). */
export function createRunningScoreExercise(source: ExerciseSource, level: RunningScoreLevel): RunningScoreExercise | null {
  const { snapshot } = source;
  const progress = getContractProgress(snapshot);
  if (!progress || snapshot.currentTrick.cards.length > 0 || snapshot.completedTricks.length === 0) return null;
  if (level === 3 && progress.pointsNeeded === 0) return null;
  const question: RunningScoreQuestion = level === 1
    ? { kind: "own-team" }
    : level === 2 ? { kind: "both-teams" } : { kind: "points-needed", takerTeam: progress.takerTeam };
  const expected = level === 1
    ? [snapshot.trickPoints[0]]
    : level === 2 ? [snapshot.trickPoints[0], snapshot.trickPoints[1]] : [progress.pointsNeeded];
  return {
    ...countingReplay(snapshot),
    seed: source.seed,
    generatorVersion: source.generatorVersion,
    level,
    stopAfterTricks: snapshot.completedTricks.length,
    question,
    expected,
    explanation: {
      trickPoints: snapshot.trickPoints,
      belotePointsByTeam: snapshot.belote?.pointsByTeam ?? { 0: 0, 1: 0 },
      takerTeam: progress.takerTeam,
      takerPoints: progress.takerPoints,
      defenderPoints: progress.defenderPoints,
      target: progress.target,
      pointsNeeded: progress.pointsNeeded,
    },
  };
}

function selectExercise(seed: number, requestedVersion: number, level: RunningScoreLevel): RunningScoreExercise {
  for (let attempt = 0; attempt < MAX_COUNTING_ATTEMPTS; attempt += 1) {
    const candidateSeed = seed + attempt * RUNNING_SCORE_SERIES_LENGTH;
    const round = generateTrainingRound({ seed: candidateSeed, generatorVersion: requestedVersion });
    const random = createSeededRandom(candidateSeed ^ 0x52554e53);
    const span = RUNNING_SCORE_MAX_TRICKS - RUNNING_SCORE_MIN_TRICKS + 1;
    const stopAfterTricks = RUNNING_SCORE_MIN_TRICKS + Math.floor(random() * span);
    if (stopAfterTricks > round.final.completedTricks.length) continue;
    const exercise = createRunningScoreExercise({ ...round, snapshot: stateAfterTricks(round, stopAfterTricks) }, level);
    if (exercise) return exercise;
  }
  throw new Error(`Could not generate a level ${level} running-score exercise for seed ${seed}.`);
}

export function generateRunningScoreSeries(options: RunningScoreSeriesOptions): RunningScoreExercise[] {
  const { seed, level, generatorVersion: requestedVersion } = options;
  if (!RUNNING_SCORE_LEVELS.includes(level)) throw new Error(`Unknown running-score level: ${level}`);
  return Array.from({ length: RUNNING_SCORE_SERIES_LENGTH }, (_, index) => selectExercise(seed + index, requestedVersion, level));
}

/** Registry entry point: completes the current trick (at least the first one) and asks the level 1 question. */
export function createRunningScoreExerciseFromPosition(position: TrainingPosition): RunningScoreExercise {
  const { state } = position;
  const target = Math.max(1, state.completedTricks.length + (state.currentTrick.cards.length > 0 ? 1 : 0));
  const snapshot = playOn(state, position.seed, target);
  const exercise = createRunningScoreExercise({ ...position, snapshot }, 1);
  if (!exercise) throw new Error("A running-score exercise requires a contract and at least one completed trick.");
  return exercise;
}

export const runningScoreAxis: TrainingAxis<RunningScoreExercise> = {
  id: "running-score",
  label: "Points en cours de donne",
  createExercise: createRunningScoreExerciseFromPosition,
};
