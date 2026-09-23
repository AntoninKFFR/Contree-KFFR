import { selectTrickValueExercise, type TrickValueExercise, type TrickValueSlotKind } from "@/engine/training/trickValue";

export type TrickValueChallengeMode = "survival" | "blitz";
export type ChallengeOutcome = "correct" | "wrong" | "timeout";

export const CHALLENGE_ADVANCE_MS = 190;
export const SURVIVAL_INITIAL_LIVES = 3;
export const SURVIVAL_INITIAL_QUESTION_MS = 9_000;
export const SURVIVAL_STEP_EVERY_CORRECT = 5;
export const SURVIVAL_STEP_DECREASE_MS = 750;
export const SURVIVAL_MIN_QUESTION_MS = 3_000;
export const BLITZ_INITIAL_MS = 60_000;
export const BLITZ_CORRECT_BONUS_MS = 1_500;
export const BLITZ_STREAK_EVERY_CORRECT = 5;
export const BLITZ_STREAK_BONUS_MS = 3_000;
export const BLITZ_WRONG_PENALTIES_MS = [8_000, 16_000, 28_000, 45_000] as const;

export type ChallengeState = {
  mode: TrickValueChallengeMode;
  finished: boolean;
  exerciseIndex: number;
  correctAnswers: number;
  lives: number;
  correctStreak: number;
  bestStreak: number;
  wrongStreak: number;
  remainingMs: number;
};

export function parseTrickValueChallengeMode(value: unknown): TrickValueChallengeMode | null {
  return value === "survival" || value === "blitz" ? value : null;
}

export function survivalTier(correctAnswers: number): number {
  return Math.floor(correctAnswers / SURVIVAL_STEP_EVERY_CORRECT) + 1;
}

export function getSurvivalQuestionDuration(correctAnswers: number): number {
  return Math.max(SURVIVAL_MIN_QUESTION_MS,
    SURVIVAL_INITIAL_QUESTION_MS - Math.floor(correctAnswers / SURVIVAL_STEP_EVERY_CORRECT) * SURVIVAL_STEP_DECREASE_MS);
}

export function getBlitzWrongPenalty(wrongStreak: number): number {
  if (!Number.isInteger(wrongStreak) || wrongStreak < 1) throw new Error("Wrong streak must be positive.");
  return BLITZ_WRONG_PENALTIES_MS[Math.min(wrongStreak, BLITZ_WRONG_PENALTIES_MS.length) - 1];
}

export function initialChallengeState(mode: TrickValueChallengeMode): ChallengeState {
  return {
    mode, finished: false, exerciseIndex: 0, correctAnswers: 0, lives: SURVIVAL_INITIAL_LIVES,
    correctStreak: 0, bestStreak: 0, wrongStreak: 0,
    remainingMs: mode === "survival" ? SURVIVAL_INITIAL_QUESTION_MS : BLITZ_INITIAL_MS,
  };
}

export function expireChallenge(state: ChallengeState): ChallengeState {
  if (state.finished) return state;
  if (state.mode === "survival") return applyChallengeOutcome(state, "timeout", 0).state;
  return { ...state, remainingMs: 0, finished: true };
}

export function applyChallengeOutcome(state: ChallengeState, outcome: ChallengeOutcome, remainingMs: number): { state: ChallengeState; timeChangeMs: number } {
  if (state.finished) return { state, timeChangeMs: 0 };
  const remaining = Math.max(0, remainingMs);
  if (state.mode === "survival") {
    const effectiveOutcome = remaining === 0 ? "timeout" : outcome;
    const correctAnswers = state.correctAnswers + Number(effectiveOutcome === "correct");
    const lives = Math.max(0, state.lives - Number(effectiveOutcome !== "correct"));
    return {
      state: {
        ...state, correctAnswers, lives, finished: lives === 0,
        remainingMs: getSurvivalQuestionDuration(correctAnswers),
      },
      timeChangeMs: 0,
    };
  }
  if (remaining === 0 || outcome === "timeout") return { state: { ...state, remainingMs: 0, finished: true }, timeChangeMs: 0 };
  if (outcome === "correct") {
    const correctStreak = state.correctStreak + 1;
    const bonus = BLITZ_CORRECT_BONUS_MS + Number(correctStreak % BLITZ_STREAK_EVERY_CORRECT === 0) * BLITZ_STREAK_BONUS_MS;
    const nextRemaining = Math.min(BLITZ_INITIAL_MS, remaining + bonus);
    return {
      state: {
        ...state, correctAnswers: state.correctAnswers + 1, correctStreak,
        bestStreak: Math.max(state.bestStreak, correctStreak), wrongStreak: 0,
        remainingMs: nextRemaining,
      },
      timeChangeMs: nextRemaining - remaining,
    };
  }
  const wrongStreak = state.wrongStreak + 1;
  const penalty = getBlitzWrongPenalty(wrongStreak);
  const nextRemaining = Math.max(0, remaining - penalty);
  return {
    state: {
      ...state, wrongStreak, correctStreak: 0, remainingMs: nextRemaining,
      finished: nextRemaining === 0,
    },
    timeChangeMs: -penalty,
  };
}

export function nextChallengeQuestion(state: ChallengeState): ChallengeState {
  if (state.finished) return state;
  return { ...state, exerciseIndex: state.exerciseIndex + 1 };
}

const EARLY_SURVIVAL: readonly TrickValueSlotKind[] = ["has-trump", "ordinary", "cut", "has-trump", "ordinary"];
const MID_SURVIVAL: readonly TrickValueSlotKind[] = ["trump-rich", "cut", "has-trump", "trump-rich", "cut"];
const LATE_SURVIVAL: readonly TrickValueSlotKind[] = ["trump-rich", "cut", "last-trick", "trump-rich", "cut"];
const BLITZ_SLOTS: readonly TrickValueSlotKind[] = [
  "trump-rich", "cut", "has-trump", "trump-rich", "last-trick", "cut", "ordinary", "trump-rich", "cut", "has-trump",
];

export function challengeDifficulty(mode: TrickValueChallengeMode, exerciseIndex: number, correctAnswers: number): TrickValueSlotKind {
  if (mode === "blitz") return BLITZ_SLOTS[exerciseIndex % BLITZ_SLOTS.length];
  const slots = correctAnswers < 10 ? EARLY_SURVIVAL : correctAnswers < 25 ? MID_SURVIVAL : LATE_SURVIVAL;
  return slots[exerciseIndex % slots.length];
}

export function challengeRunSeed(mode: TrickValueChallengeMode, completedRuns: number): number {
  if (!Number.isSafeInteger(completedRuns) || completedRuns < 0) throw new Error("Invalid completed challenge run count.");
  return ((mode === "survival" ? 0x3b9aca00 : 0x77359400) ^ Math.imul(completedRuns, 0x9e3779b1)) >>> 0;
}

const KIND_SALTS: Record<TrickValueSlotKind, number> = {
  ordinary: 0x1f123bb5, "has-trump": 0x6ac690c5, "trump-rich": 0x3f84d5b5, cut: 0x5be0cd19, "last-trick": 0x27d4eb2f,
};

export function generateChallengeExercise(options: {
  runSeed: number;
  exerciseIndex: number;
  generatorVersion: number;
  difficulty: TrickValueSlotKind;
}): TrickValueExercise {
  const { runSeed, exerciseIndex, generatorVersion, difficulty } = options;
  if (!Number.isSafeInteger(runSeed) || !Number.isSafeInteger(exerciseIndex) || exerciseIndex < 0) {
    throw new Error("Invalid challenge exercise coordinates.");
  }
  // A stable lane per run, exercise, version and difficulty; candidate search remains bounded in trickValue.ts.
  let seed = (runSeed ^ Math.imul(exerciseIndex + 1, 0x9e3779b1) ^ Math.imul(generatorVersion, 0x85ebca6b) ^ KIND_SALTS[difficulty]) >>> 0;
  seed = Math.imul(seed ^ (seed >>> 16), 0x7feb352d) >>> 0;
  seed = Math.imul(seed ^ (seed >>> 15), 0x846ca68b) >>> 0;
  seed = (seed ^ (seed >>> 16)) >>> 0;
  return selectTrickValueExercise(seed, generatorVersion, difficulty);
}
