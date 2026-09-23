import { createSeededRandom } from "@/engine/random";
import {
  COUNTING_SERIES_LENGTH, countingReplay, MAX_COUNTING_ATTEMPTS, otherTeam, playedResult, playOn, seededTeam,
  type CountingReplay,
} from "@/engine/training/counting";
import { generateTrainingRound, generatorVersion, type TrainingPosition } from "@/engine/training/generator";
import type { TrainingAxis } from "@/engine/training/registry";
import type { GameState, TeamId } from "@/engine/types";

export type RoundCountLevel = 1 | 2 | 3;
export const ROUND_COUNT_LEVELS = [1, 2, 3] as const;
export const ROUND_COUNT_SERIES_LENGTH = COUNTING_SERIES_LENGTH;

export type RoundCountQuestion =
  | { kind: "team-tricks"; team: TeamId }
  | { kind: "team-tricks-belote"; team: TeamId }
  | { kind: "round-score" };

export type RoundCountExercise = CountingReplay & {
  seed: number;
  generatorVersion: typeof generatorVersion;
  level: RoundCountLevel;
  question: RoundCountQuestion;
  /** One value, or one value per team (team 0 first) for the marked score. */
  expected: number[];
  explanation: {
    takerTeam: TeamId;
    contractSucceeded: boolean;
    capotTeam: TeamId | null;
    trickPointsByTeam: Record<TeamId, number>;
    belotePointsByTeam: Record<TeamId, number>;
    roundScore: Record<TeamId, number>;
  };
};

export type RoundCountSeriesOptions = { seed: number; generatorVersion: number; level: RoundCountLevel };

type ExerciseSource = { seed: number; generatorVersion: typeof generatorVersion; final: GameState };

export function createRoundCountExercise(source: ExerciseSource, level: RoundCountLevel, team: TeamId): RoundCountExercise {
  const result = playedResult(source.final);
  if (!result) throw new Error("A round-count exercise requires a completed, played round.");
  const question: RoundCountQuestion = level === 1
    ? { kind: "team-tricks", team }
    : level === 2 ? { kind: "team-tricks-belote", team } : { kind: "round-score" };
  const expected = level === 1
    ? [result.trickPointsByTeam[team]]
    : level === 2
      ? [result.trickPointsByTeam[team] + result.belotePointsByTeam[team]]
      : [result.roundScore[0], result.roundScore[1]];
  return {
    ...countingReplay(source.final),
    seed: source.seed,
    generatorVersion: source.generatorVersion,
    level,
    question,
    expected,
    explanation: {
      takerTeam: result.contract.teamId,
      contractSucceeded: result.contractSucceeded,
      capotTeam: result.capotTeam,
      trickPointsByTeam: result.trickPointsByTeam,
      belotePointsByTeam: result.belotePointsByTeam,
      roundScore: result.roundScore,
    },
  };
}

function selectExercise(seed: number, requestedVersion: number, level: RoundCountLevel): RoundCountExercise {
  for (let attempt = 0; attempt < MAX_COUNTING_ATTEMPTS; attempt += 1) {
    const candidateSeed = seed + attempt * ROUND_COUNT_SERIES_LENGTH;
    const round = generateTrainingRound({ seed: candidateSeed, generatorVersion: requestedVersion });
    const result = playedResult(round.final);
    if (!result) continue;
    // Level 2 trains not forgetting the belote: only rounds where it was actually announced.
    const belote = result.belotePointsByTeam;
    if (level === 2 && belote[0] + belote[1] === 0) continue;
    const random = createSeededRandom(candidateSeed ^ 0x524f554e);
    // Mostly the belote team, sometimes the other one so that the belote is not added blindly.
    const beloteTeam: TeamId = belote[0] > 0 ? 0 : 1;
    const team = level === 2 ? (random() < 0.75 ? beloteTeam : otherTeam(beloteTeam)) : seededTeam(random);
    return createRoundCountExercise(round, level, team);
  }
  throw new Error(`Could not generate a level ${level} round-count exercise for seed ${seed}.`);
}

export function generateRoundCountSeries(options: RoundCountSeriesOptions): RoundCountExercise[] {
  const { seed, level, generatorVersion: requestedVersion } = options;
  if (!ROUND_COUNT_LEVELS.includes(level)) throw new Error(`Unknown round-count level: ${level}`);
  return Array.from({ length: ROUND_COUNT_SERIES_LENGTH }, (_, index) => selectExercise(seed + index, requestedVersion, level));
}

/** Registry entry point: finishes the round from any position and asks the level 1 question. */
export function createRoundCountExerciseFromPosition(position: TrainingPosition): RoundCountExercise {
  const final = playOn(position.state, position.seed);
  return createRoundCountExercise({ ...position, final }, 1, seededTeam(createSeededRandom(position.seed ^ 0x524f554e)));
}

export const roundCountAxis: TrainingAxis<RoundCountExercise> = {
  id: "round-count",
  label: "Compter une manche",
  createExercise: createRoundCountExerciseFromPosition,
};
