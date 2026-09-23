import { describe, expect, it } from "vitest";
import { playCard, playableCardsForCurrentPlayer } from "@/engine/game";
import { createSeededRandom } from "@/engine/random";
import { trickPoints } from "@/engine/rules";
import { generateTrainingPosition, generatorVersion } from "@/engine/training/generator";
import { classifyTrickValueExercise } from "@/engine/training/trickValue";
import {
  applyChallengeOutcome, BLITZ_CORRECT_BONUS_MS, BLITZ_INITIAL_MS, BLITZ_STREAK_BONUS_MS,
  BLITZ_WRONG_PENALTIES_MS, challengeDifficulty, challengeRunSeed, expireChallenge,
  generateChallengeExercise, getBlitzWrongPenalty, getSurvivalQuestionDuration,
  initialChallengeState, nextChallengeQuestion, parseTrickValueChallengeMode,
  SURVIVAL_INITIAL_LIVES, survivalTier,
} from "@/engine/training/trickValueChallenge";
import {
  emptyTrainingProgress, isTrickValueChallengeUnlocked, parseTrainingProgress,
  recordTrickValueChallengeRun, recordTrickValueSeries, trainingChallengeRunSeed,
} from "@/components/training/progress";

describe("Survie rules", () => {
  it("starts with three lives and applies correct, wrong and timeout exactly once", () => {
    const initial = initialChallengeState("survival");
    expect(initial).toMatchObject({ lives: SURVIVAL_INITIAL_LIVES, correctAnswers: 0, remainingMs: 9_000, finished: false });
    const correct = applyChallengeOutcome(initial, "correct", 4_000).state;
    expect(correct).toMatchObject({ lives: 3, correctAnswers: 1, finished: false });
    const wrong = applyChallengeOutcome(correct, "wrong", 4_000).state;
    expect(wrong).toMatchObject({ lives: 2, correctAnswers: 1, finished: false });
    const timeout = applyChallengeOutcome(wrong, "timeout", 0).state;
    expect(timeout).toMatchObject({ lives: 1, correctAnswers: 1, finished: false });
    const dead = applyChallengeOutcome(timeout, "wrong", 2_000).state;
    expect(dead).toMatchObject({ lives: 0, correctAnswers: 1, finished: true });
    expect(nextChallengeQuestion(dead)).toBe(dead);
    expect(applyChallengeOutcome(dead, "correct", 2_000).state).toBe(dead);
    expect(expireChallenge(dead)).toBe(dead);
    expect(applyChallengeOutcome(initial, "correct", 0).state.lives).toBe(2);
  });

  it("reduces question duration every five correct answers to a 3s floor", () => {
    for (const count of [0, 4]) expect(getSurvivalQuestionDuration(count)).toBe(9_000);
    expect(getSurvivalQuestionDuration(5)).toBe(8_250);
    expect(getSurvivalQuestionDuration(10)).toBe(7_500);
    expect(getSurvivalQuestionDuration(35)).toBe(3_750);
    expect(getSurvivalQuestionDuration(40)).toBe(3_000);
    expect(getSurvivalQuestionDuration(100)).toBe(3_000);
    expect(survivalTier(0)).toBe(1);
    expect(survivalTier(4)).toBe(1);
    expect(survivalTier(5)).toBe(2);
    expect(survivalTier(47)).toBe(10);
    expect(applyChallengeOutcome({ ...initialChallengeState("survival"), correctAnswers: 4 }, "correct", 1_000).state.remainingMs).toBe(8_250);
  });
});

describe("Blitz rules", () => {
  it("starts at 60s, adds capped bonuses and rewards every fifth consecutive correct answer", () => {
    const initial = initialChallengeState("blitz");
    expect(initial.remainingMs).toBe(BLITZ_INITIAL_MS);
    expect(BLITZ_CORRECT_BONUS_MS).toBe(1_500);
    expect(BLITZ_STREAK_BONUS_MS).toBe(3_000);
    expect(applyChallengeOutcome(initial, "correct", 59_000)).toMatchObject({ state: { correctAnswers: 1, correctStreak: 1, bestStreak: 1, remainingMs: 60_000 }, timeChangeMs: 1_500 });
    const fifth = applyChallengeOutcome({ ...initial, correctAnswers: 4, correctStreak: 4, bestStreak: 4 }, "correct", 50_000);
    expect(fifth).toMatchObject({ state: { correctAnswers: 5, correctStreak: 5, bestStreak: 5, remainingMs: 54_500 }, timeChangeMs: 4_500 });
    expect(applyChallengeOutcome({ ...initial, correctStreak: 9 }, "correct", 10_000).timeChangeMs).toBe(4_500);
  });

  it("applies escalating penalties, resets streaks and ends at zero without a negative clock", () => {
    expect(BLITZ_WRONG_PENALTIES_MS).toEqual([8_000, 16_000, 28_000, 45_000]);
    for (const [streak, penalty] of [8_000, 16_000, 28_000, 45_000, 45_000].entries()) {
      expect(getBlitzWrongPenalty(streak + 1)).toBe(penalty);
    }
    let state = initialChallengeState("blitz");
    state = applyChallengeOutcome(state, "wrong", 60_000).state;
    expect(state).toMatchObject({ remainingMs: 52_000, wrongStreak: 1, correctStreak: 0 });
    state = applyChallengeOutcome(state, "wrong", 52_000).state;
    expect(state).toMatchObject({ remainingMs: 36_000, wrongStreak: 2 });
    state = applyChallengeOutcome(state, "wrong", 36_000).state;
    expect(state).toMatchObject({ remainingMs: 8_000, wrongStreak: 3 });
    state = applyChallengeOutcome(state, "wrong", 8_000).state;
    expect(state).toMatchObject({ remainingMs: 0, wrongStreak: 4, finished: true });
    expect(applyChallengeOutcome(state, "correct", 8_000).state).toBe(state);
    expect(getBlitzWrongPenalty(5)).toBe(45_000);
    const recovered = applyChallengeOutcome({ ...initialChallengeState("blitz"), wrongStreak: 2 }, "correct", 30_000).state;
    expect(recovered.wrongStreak).toBe(0);
    expect(applyChallengeOutcome(recovered, "wrong", 31_500).timeChangeMs).toBe(-8_000);
    expect(applyChallengeOutcome({ ...initialChallengeState("blitz"), correctStreak: 4 }, "wrong", 50_000).state.correctStreak).toBe(0);
    expect(expireChallenge(initialChallengeState("blitz"))).toMatchObject({ remainingMs: 0, finished: true });
    expect(applyChallengeOutcome(initialChallengeState("blitz"), "correct", 0).state).toMatchObject({ correctAnswers: 0, finished: true });
  });
});

describe("challenge progression and deterministic legal exercises", () => {
  it("unlocks both modes only after an 8/10 record at Confirmé and preserves old progress", () => {
    const initial = emptyTrainingProgress();
    expect(isTrickValueChallengeUnlocked(initial)).toBe(false);
    const level1 = recordTrickValueSeries(initial, 1, 8);
    expect(isTrickValueChallengeUnlocked(level1)).toBe(false);
    const seven = recordTrickValueSeries(level1, 2, 7);
    expect(isTrickValueChallengeUnlocked(seven)).toBe(false);
    const eight = recordTrickValueSeries(seven, 2, 8);
    expect(isTrickValueChallengeUnlocked(eight)).toBe(true);
    expect(isTrickValueChallengeUnlocked(recordTrickValueSeries(eight, 2, 0))).toBe(true);
    const old = parseTrainingProgress('{"version":1,"axes":{"trick-value":{"unlockedLevel":2,"levels":{"1":{"bestScore":8,"completedSeries":1},"2":{"bestScore":8,"completedSeries":2}}}}}');
    expect(old.axes["trick-value"].levels[2]).toEqual({ bestScore: 8, completedSeries: 2 });
    expect(old.axes["trick-value"].challenges).toEqual(initial.axes["trick-value"].challenges);
    expect(parseTrainingProgress("corrupt")).toEqual(initial);
  });

  it("records finished runs only, independently by mode and without touching level records", () => {
    const initial = recordTrickValueSeries(recordTrickValueSeries(emptyTrainingProgress(), 1, 8), 2, 8);
    const survivalSeed = trainingChallengeRunSeed(initial, "survival");
    const blitzSeed = trainingChallengeRunSeed(initial, "blitz");
    expect(() => recordTrickValueChallengeRun(initial, initialChallengeState("survival"))).toThrow();
    const survival = recordTrickValueChallengeRun(initial, { ...initialChallengeState("survival"), finished: true, correctAnswers: 47 });
    expect(survival.axes["trick-value"].challenges.survival).toEqual({ bestScore: 47, bestStreak: 0, completedRuns: 1 });
    expect(trainingChallengeRunSeed(survival, "survival")).not.toBe(survivalSeed);
    expect(trainingChallengeRunSeed(survival, "blitz")).toBe(blitzSeed);
    const blitz = recordTrickValueChallengeRun(survival, { ...initialChallengeState("blitz"), finished: true, correctAnswers: 21, bestStreak: 9 });
    expect(blitz.axes["trick-value"].challenges.blitz).toEqual({ bestScore: 21, bestStreak: 9, completedRuns: 1 });
    expect(trainingChallengeRunSeed(blitz, "survival")).toBe(trainingChallengeRunSeed(survival, "survival"));
    expect(blitz.axes["trick-value"].levels).toEqual(initial.axes["trick-value"].levels);
    expect(recordTrickValueChallengeRun(blitz, { ...initialChallengeState("blitz"), finished: true, correctAnswers: 5, bestStreak: 3 }).axes["trick-value"].challenges.blitz)
      .toEqual({ bestScore: 21, bestStreak: 9, completedRuns: 2 });
    expect(parseTrainingProgress(JSON.stringify(blitz))).toEqual(blitz);
  });

  it("validates modes and uses distinct deterministic seed lanes", () => {
    expect(parseTrickValueChallengeMode("survival")).toBe("survival");
    expect(parseTrickValueChallengeMode("blitz")).toBe("blitz");
    expect(parseTrickValueChallengeMode("unknown")).toBeNull();
    expect(parseTrickValueChallengeMode(["survival"])).toBeNull();
    expect(challengeRunSeed("survival", 0)).not.toBe(challengeRunSeed("blitz", 0));
    expect(challengeRunSeed("survival", 1)).not.toBe(challengeRunSeed("survival", 0));
  });

  it("increases survival difficulty and makes most Blitz exercises use trump", () => {
    expect(challengeDifficulty("survival", 0, 0)).toBe("has-trump");
    expect(challengeDifficulty("survival", 0, 10)).toBe("trump-rich");
    expect(challengeDifficulty("survival", 2, 25)).toBe("last-trick");
    expect(challengeDifficulty("blitz", 4, 0)).toBe("last-trick");
    for (const mode of ["survival", "blitz"] as const) {
      for (const runOrdinal of [0, 1, 3, 7]) {
        const runSeed = challengeRunSeed(mode, runOrdinal);
        const exercises = Array.from({ length: 20 }, (_, exerciseIndex) => {
          const correctAnswers = mode === "survival" ? exerciseIndex * 2 : 0;
          const difficulty = challengeDifficulty(mode, exerciseIndex, correctAnswers);
          const options = { runSeed, exerciseIndex, generatorVersion, difficulty };
          const exercise = generateChallengeExercise(options);
          expect(exercise).toStrictEqual(generateChallengeExercise(options));
          expect(exercise.answer).toBe(trickPoints(exercise.cards, exercise.contractMode, exercise.isLastTrick, false));
          const classification = classifyTrickValueExercise(exercise);
          if (difficulty === "cut") expect(classification.isCut).toBe(true);
          if (difficulty === "trump-rich") expect(classification.trumpCount).toBeGreaterThanOrEqual(2);
          if (difficulty === "last-trick") {
            expect(exercise.trickNumber).toBe(8);
            expect(exercise.isCapot).toBe(false);
            expect(exercise.bonusPoints).toBe(10);
            const random = createSeededRandom(exercise.seed ^ 0x4445524e);
            let state = generateTrainingPosition({ seed: exercise.seed, generatorVersion }).state;
            while (state.phase === "playing") {
              const legal = playableCardsForCurrentPlayer(state);
              state = playCard(state, state.currentPlayerId, legal[Math.floor(random() * legal.length)]);
            }
            expect(exercise.cards).toStrictEqual(state.completedTricks[7].cards);
            expect(exercise.answer).toBe(state.completedTricks[7].points);
          }
          return exercise;
        });
        expect(new Set(exercises.map((exercise) => exercise.seed)).size).toBe(exercises.length);
        expect(exercises.filter((exercise) => classifyTrickValueExercise(exercise).trumpCount > 0).length).toBeGreaterThanOrEqual(12);
        expect(exercises.some((exercise) => classifyTrickValueExercise(exercise).isCut)).toBe(true);
        expect(exercises.some((exercise) => classifyTrickValueExercise(exercise).trumpCount >= 2)).toBe(true);
        expect(exercises.some((exercise) => exercise.isLastTrick)).toBe(true);
      }
    }
  });
});
