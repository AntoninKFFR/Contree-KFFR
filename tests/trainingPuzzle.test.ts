import { describe, expect, it } from "vitest";
import { playCard, playableCardsForCurrentPlayer } from "@/engine/game";
import { createSeededRandom } from "@/engine/random";
import { trickPoints } from "@/engine/rules";
import { resolveGameRules } from "@/engine/rulesets/resolve";
import { generateTrainingPosition, generatorVersion } from "@/engine/training/generator";
import { trainingAxes, isTrainingAxisId } from "@/engine/training/axes";
import {
  classifyTrickValueExercise, createTrickValueExercise, generateTrickValueSeries, TRICK_VALUE_LAST_TRICK_INDICES,
  TRICK_VALUE_LEVEL_SLOTS, TRICK_VALUE_SERIES_LENGTH, trickValueAxis,
} from "@/engine/training/trickValue";
import {
  emptyTrainingProgress, isTrickValueLevelUnlocked, parseTrainingProgress, parseTrickValueLevel,
  readTrainingProgress, recordTrickValueSeries, saveTrainingProgress, TRAINING_PROGRESS_KEY,
  trickValueSeriesSeed,
} from "@/components/training/progress";

const series = (level: 1 | 2, seed = 480038) => generateTrickValueSeries({ seed, generatorVersion, level });

describe("trick-value levels", () => {
  it("registers the axis and validates explicit level selection", () => {
    expect(trainingAxes.resolve("trick-value")).toBe(trickValueAxis);
    expect(isTrainingAxisId("trick-value")).toBe(true);
    expect(isTrainingAxisId("unknown")).toBe(false);
    expect(parseTrickValueLevel("1")).toBe(1);
    expect(parseTrickValueLevel("2")).toBe(2);
    expect(parseTrickValueLevel("3")).toBeNull();
    expect(parseTrickValueLevel(undefined)).toBeNull();
    expect(parseTrickValueLevel(["1", "2"])).toBeNull();
  });

  it("keeps both levels deterministic, versioned, and limited to suit contracts", () => {
    for (const level of [1, 2] as const) {
      const first = series(level);
      expect(first).toHaveLength(TRICK_VALUE_SERIES_LENGTH);
      expect(first.every((exercise) => exercise.cards.length === 4)).toBe(true);
      expect(first.every((exercise) => exercise.contractMode.kind === "suit")).toBe(true);
      expect(first.every((exercise) => exercise.generatorVersion === generatorVersion)).toBe(true);
      expect(JSON.stringify(first)).toBe(JSON.stringify(series(level)));
      expect(first).not.toStrictEqual(series(level, 480048));
    }
    expect(series(1)).not.toStrictEqual(series(2));
    expect(() => generateTrickValueSeries({ seed: 1, generatorVersion, level: 3 as 1 })).toThrow();
    expect(() => generateTrickValueSeries({ seed: 1, generatorVersion: 2, level: 1 })).toThrow();
  });

  it("uses only ordinary tricks without a last-trick bonus at level 1", () => {
    for (const exercise of series(1)) {
      expect(exercise.trickNumber).toBeLessThan(8);
      expect(exercise.isLastTrick).toBe(false);
      expect(exercise.bonusPoints).toBe(0);
      expect(exercise.answer).toBe(trickPoints(exercise.cards, exercise.contractMode, false));
    }
  });

  it("uses three real eighth tricks with the standard bonus and no capot at level 2", () => {
    const exercises = series(2);
    expect(exercises.flatMap((exercise, index) => exercise.isLastTrick ? [index] : []))
      .toEqual([...TRICK_VALUE_LAST_TRICK_INDICES]);
    for (const exercise of exercises) {
      expect(exercise.answer).toBe(trickPoints(exercise.cards, exercise.contractMode, exercise.isLastTrick, false));
      if (!exercise.isLastTrick) continue;
      expect(exercise.trickNumber).toBe(8);
      expect(exercise.isCapot).toBe(false);
      expect(exercise.bonusPoints).toBe(10);

      const random = createSeededRandom(exercise.seed ^ 0x4445524e);
      let state = generateTrainingPosition({ seed: exercise.seed, generatorVersion }).state;
      while (state.phase === "playing") {
        const legal = playableCardsForCurrentPlayer(state);
        state = playCard(state, state.currentPlayerId, legal[Math.floor(random() * legal.length)]);
      }
      const finalTrick = state.completedTricks[7];
      expect(state.completedTricks).toHaveLength(8);
      expect(exercise.cards).toStrictEqual(finalTrick.cards);
      expect(exercise.answer).toBe(finalTrick.points);
      expect(exercise.bonusPoints).toBe(resolveGameRules(state.settings).trickScoring.lastTrickBonus);
    }
  });

  it("derives a single exercise answer from engine scoring", () => {
    const position = generateTrainingPosition({ seed: 380038, generatorVersion });
    const exercise = createTrickValueExercise(position);
    expect(exercise.answer).toBe(trickPoints(exercise.cards, exercise.contractMode, false));
  });

  it("selects the pedagogical trump and cut mix from legal, deterministic plays across seeds", () => {
    expect(TRICK_VALUE_LEVEL_SLOTS[1].filter((kind) => kind === "has-trump")).toHaveLength(4);
    expect(TRICK_VALUE_LEVEL_SLOTS[1].filter((kind) => kind === "cut")).toHaveLength(2);
    expect(TRICK_VALUE_LEVEL_SLOTS[2].filter((kind) => kind === "trump-rich")).toHaveLength(3);
    expect(TRICK_VALUE_LEVEL_SLOTS[2].filter((kind) => kind === "cut")).toHaveLength(2);

    for (const seed of [380038, 380048, 380058, 480038, 480048, 580038, 580048]) {
      for (const level of [1, 2] as const) {
        const exercises = series(level, seed);
        expect(exercises).toStrictEqual(series(level, seed));
        expect(new Set(exercises.map((exercise) => exercise.seed)).size).toBe(10);
        expect(exercises.filter((exercise) => classifyTrickValueExercise(exercise).isCut).length).toBeGreaterThanOrEqual(2);
        expect(exercises.filter((exercise) => classifyTrickValueExercise(exercise).isLastTrick)).toHaveLength(level === 1 ? 0 : 3);
        expect(exercises.filter((exercise) => classifyTrickValueExercise(exercise).trumpCount >= 1).length).toBeGreaterThanOrEqual(level === 1 ? 6 : 5);

        exercises.forEach((exercise, index) => {
          const classification = classifyTrickValueExercise(exercise);
          const kind = TRICK_VALUE_LEVEL_SLOTS[level][index];
          if (kind === "ordinary") expect(classification.trumpCount).toBe(0);
          if (kind === "has-trump") expect(classification.trumpCount).toBeGreaterThanOrEqual(1);
          if (kind === "trump-rich") expect(classification.trumpCount).toBeGreaterThanOrEqual(2);
          if (kind === "cut") {
            expect(classification.isCut).toBe(true);
            if (exercise.contractMode.kind !== "suit") throw new Error("Expected a suit contract.");
            const trumpSuit = exercise.contractMode.suit;
            expect(exercise.cards[0].card.suit).not.toBe(trumpSuit);
            expect(exercise.cards.slice(1).some(({ card }) => card.suit === trumpSuit)).toBe(true);
          }
          expect(exercise.answer).toBe(trickPoints(exercise.cards, exercise.contractMode, exercise.isLastTrick, false));
          if (!exercise.isLastTrick) {
            expect(createTrickValueExercise(generateTrainingPosition({ seed: exercise.seed, generatorVersion })).cards).toStrictEqual(exercise.cards);
          } else {
            expect(exercise.isCapot).toBe(false);
            expect(exercise.bonusPoints).toBe(10);
          }
        });
      }
    }
  });
});

describe("local progress by level", () => {
  it("keeps level 1 open and locks level 2 until level 1 reaches eight", () => {
    const initial = emptyTrainingProgress();
    expect(isTrickValueLevelUnlocked(initial, 1)).toBe(true);
    expect(isTrickValueLevelUnlocked(initial, 2)).toBe(false);
    const seven = recordTrickValueSeries(initial, 1, 7);
    expect(isTrickValueLevelUnlocked(seven, 2)).toBe(false);
    const eight = recordTrickValueSeries(initial, 1, 8);
    expect(isTrickValueLevelUnlocked(eight, 1)).toBe(true);
    expect(isTrickValueLevelUnlocked(eight, 2)).toBe(true);
    expect(isTrickValueLevelUnlocked(recordTrickValueSeries(initial, 1, 10), 2)).toBe(true);
    expect(isTrickValueLevelUnlocked(recordTrickValueSeries(initial, 2, 10), 2)).toBe(false);
    expect(isTrickValueLevelUnlocked(recordTrickValueSeries(eight, 1, 0), 2)).toBe(true);
  });

  it("tracks best scores, series counts, and future seeds independently", () => {
    const initial = emptyTrainingProgress();
    const level1Seed = trickValueSeriesSeed(initial, 1);
    const level2Seed = trickValueSeriesSeed(initial, 2);
    const afterOne = recordTrickValueSeries(initial, 1, 8);
    expect(afterOne.axes["trick-value"].levels[1]).toEqual({ bestScore: 8, completedSeries: 1 });
    expect(afterOne.axes["trick-value"].levels[2]).toEqual({ bestScore: 0, completedSeries: 0 });
    expect(trickValueSeriesSeed(afterOne, 1)).not.toBe(level1Seed);
    expect(trickValueSeriesSeed(afterOne, 2)).toBe(level2Seed);
    const afterTwo = recordTrickValueSeries(afterOne, 2, 9);
    expect(afterTwo.axes["trick-value"].levels[1]).toEqual(afterOne.axes["trick-value"].levels[1]);
    expect(afterTwo.axes["trick-value"].levels[2]).toEqual({ bestScore: 9, completedSeries: 1 });
    expect(trickValueSeriesSeed(afterTwo, 1)).toBe(trickValueSeriesSeed(afterOne, 1));
    expect(trickValueSeriesSeed(afterTwo, 2)).not.toBe(level2Seed);
    const replayOne = recordTrickValueSeries(afterTwo, 1, 7);
    expect(replayOne.axes["trick-value"].levels[1].bestScore).toBe(8);
    expect(replayOne.axes["trick-value"].levels[2].bestScore).toBe(9);
    expect(replayOne.axes["trick-value"].levels[2].completedSeries).toBe(1);
  });

  it("recovers from invalid or partial storage and reads the earlier PR shape", () => {
    expect(parseTrainingProgress(null)).toEqual(emptyTrainingProgress());
    expect(parseTrainingProgress("{invalid")).toEqual(emptyTrainingProgress());
    expect(parseTrainingProgress('{"version":1,"axes":{}}')).toEqual(emptyTrainingProgress());
    const legacy = parseTrainingProgress('{"version":1,"axes":{"trick-value":{"bestScore":8,"completedSeries":3,"unlockedLevel":2}}}');
    expect(legacy.axes["trick-value"].levels[1]).toEqual({ bestScore: 8, completedSeries: 3 });
    expect(legacy.axes["trick-value"].levels[2]).toEqual({ bestScore: 0, completedSeries: 0 });
    expect(isTrickValueLevelUnlocked(legacy, 2)).toBe(true);
    expect(readTrainingProgress({ getItem: () => { throw new Error("blocked"); } })).toEqual(emptyTrainingProgress());
    expect(() => saveTrainingProgress(emptyTrainingProgress(), { setItem: () => { throw new Error("blocked"); } })).not.toThrow();
  });

  it("saves the per-level format under the required key", () => {
    let key = "";
    let raw = "";
    const progress = recordTrickValueSeries(emptyTrainingProgress(), 1, 8);
    saveTrainingProgress(progress, { setItem: (nextKey, value) => { key = nextKey; raw = value; } });
    expect(key).toBe(TRAINING_PROGRESS_KEY);
    expect(readTrainingProgress({ getItem: () => raw })).toEqual(progress);
  });
});
