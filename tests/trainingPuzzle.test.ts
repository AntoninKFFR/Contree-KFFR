import { describe, expect, it } from "vitest";
import { playCard, playableCardsForCurrentPlayer } from "@/engine/game";
import { cardPoints, trickPoints } from "@/engine/rules";
import { generateTrainingPosition, generatorVersion } from "@/engine/training/generator";
import { trainingAxes, isTrainingAxisId } from "@/engine/training/axes";
import { createTrickValueExercise, generateTrickValueSeries, trickValueAxis } from "@/engine/training/trickValue";
import type { ContractMode } from "@/engine/types";
import {
  emptyTrainingProgress, parseTrainingProgress, readTrainingProgress, recordTrickValueSeries,
  saveTrainingProgress, TRAINING_PROGRESS_KEY, trickValueSeriesSeed,
} from "@/components/training/progress";

describe("trick-value training", () => {
  it("registers only the supported axis and handles unknown ids", () => {
    expect(trainingAxes.resolve("trick-value")).toBe(trickValueAxis);
    expect(isTrainingAxisId("trick-value")).toBe(true);
    expect(isTrainingAxisId("unknown")).toBe(false);
  });

  it("produces exactly ten deterministic complete tricks", () => {
    const first = generateTrickValueSeries(380038);
    expect(first).toHaveLength(10);
    expect(first.every((exercise) => exercise.cards.length === 4)).toBe(true);
    expect(JSON.stringify(first)).toBe(JSON.stringify(generateTrickValueSeries(380038)));
    expect(first).not.toStrictEqual(generateTrickValueSeries(380048));
    expect(first.every((exercise) => exercise.generatorVersion === generatorVersion)).toBe(true);
  });

  it("uses engine card and trick points in suit, no-trump, and all-trump modes", () => {
    const position = generateTrainingPosition({ seed: 380038, generatorVersion });
    const modes: ContractMode[] = [
      { kind: "suit", suit: "hearts" }, { kind: "no-trump" }, { kind: "all-trump" },
    ];
    for (const mode of modes) {
      const exercise = createTrickValueExercise({
        ...position,
        state: { ...position.state, contractMode: mode },
      });
      expect(exercise.contractMode).toEqual(mode);
      expect(exercise.answer).toBe(trickPoints(exercise.cards, mode, false));
      expect(exercise.answer).toBe(exercise.cards.reduce((sum, played) => sum + cardPoints(played.card, mode), 0));
    }
  });

  it("counts the last-trick bonus only for an actual eighth trick", () => {
    const position = generateTrainingPosition({ seed: 380039, generatorVersion });
    let state = position.state;
    while (state.phase === "playing") {
      state = playCard(state, state.currentPlayerId, playableCardsForCurrentPlayer(state)[0]);
    }
    expect(state.completedTricks).toHaveLength(8);
    const exercise = createTrickValueExercise({ ...position, state });
    expect(exercise.isLastTrick).toBe(true);
    expect(exercise.bonusPoints).toBeGreaterThan(0);
    expect(exercise.answer).toBe(state.completedTricks[7].points);
    const earlier = createTrickValueExercise({ ...position, state: { ...state, phase: "playing", completedTricks: state.completedTricks.slice(0, 7) } });
    expect(earlier.isLastTrick).toBe(false);
    expect(earlier.answer).toBe(trickPoints(earlier.cards, earlier.contractMode, false));
  });
});

describe("local training progress", () => {
  it("recovers from absent, invalid, partial, and inaccessible storage", () => {
    expect(parseTrainingProgress(null)).toEqual(emptyTrainingProgress());
    expect(parseTrainingProgress("{invalid")).toEqual(emptyTrainingProgress());
    expect(parseTrainingProgress('{"version":1,"axes":{}}')).toEqual(emptyTrainingProgress());
    expect(parseTrainingProgress('{"version":1,"axes":{"trick-value":{"bestScore":8}}}').axes["trick-value"])
      .toEqual({ bestScore: 8, completedSeries: 0, unlockedLevel: 2 });
    expect(readTrainingProgress({ getItem: () => { throw new Error("blocked"); } })).toEqual(emptyTrainingProgress());
    expect(() => saveTrainingProgress(emptyTrainingProgress(), { setItem: () => { throw new Error("blocked"); } })).not.toThrow();
  });

  it("saves a versioned value under the required key", () => {
    let key = "";
    let raw = "";
    const progress = recordTrickValueSeries(emptyTrainingProgress(), 8);
    saveTrainingProgress(progress, { setItem: (nextKey, value) => { key = nextKey; raw = value; } });
    expect(key).toBe(TRAINING_PROGRESS_KEY);
    expect(readTrainingProgress({ getItem: () => raw })).toEqual(progress);
  });

  it("unlocks at eight of ten, preserves the best score, and advances the series seed", () => {
    const seven = recordTrickValueSeries(emptyTrainingProgress(), 7);
    expect(seven.axes["trick-value"].unlockedLevel).toBe(1);
    const eight = recordTrickValueSeries(emptyTrainingProgress(), 8);
    expect(eight.axes["trick-value"].unlockedLevel).toBe(2);
    expect(recordTrickValueSeries(emptyTrainingProgress(), 10).axes["trick-value"].unlockedLevel).toBe(2);
    expect(recordTrickValueSeries(eight, 7).axes["trick-value"].bestScore).toBe(8);
    expect(trickValueSeriesSeed(1, eight.axes["trick-value"].completedSeries))
      .not.toBe(trickValueSeriesSeed(1, 0));
  });
});
