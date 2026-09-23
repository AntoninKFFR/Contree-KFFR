import { describe, expect, it } from "vitest";
import { getContractProgress } from "@/engine/contractProgress";
import { playerTeam } from "@/engine/rules";
import { resolveGameRules } from "@/engine/rulesets/resolve";
import { isTrainingAxisId, trainingAxes } from "@/engine/training/axes";
import {
  beloteMoments, COUNTING_SERIES_LENGTH, gradeCountingAnswers, playedResult, stateAfterTricks,
} from "@/engine/training/counting";
import { generateTrainingPosition, generateTrainingRound, generatorVersion } from "@/engine/training/generator";
import { generateRoundCountSeries, ROUND_COUNT_LEVELS, roundCountAxis } from "@/engine/training/roundCount";
import {
  generateRunningScoreSeries, RUNNING_SCORE_LEVELS, RUNNING_SCORE_MAX_TRICKS, RUNNING_SCORE_MIN_TRICKS, runningScoreAxis,
} from "@/engine/training/runningScore";
import type { TeamId } from "@/engine/types";
import {
  COUNTING_AXIS_IDS, countingSeriesSeed, emptyTrainingProgress, isCountingAxisId, isCountingLevelUnlocked,
  parseCountingLevel, parseTrainingProgress, readTrainingProgress, recordCountingSeries, recordTrickValueSeries,
  saveTrainingProgress, TRAINING_PROGRESS_KEY,
} from "@/components/training/progress";

const round = (seed: number) => generateTrainingRound({ seed, generatorVersion });

describe("full training rounds", () => {
  it("plays a legal, deterministic, versioned round from its first card", () => {
    const first = round(900001);
    expect(first.start.phase).toBe("playing");
    expect(first.start.completedTricks).toHaveLength(0);
    expect(first.final.completedTricks).toHaveLength(8);
    expect(playedResult(first.final)).not.toBeNull();
    expect(JSON.stringify(first)).toBe(JSON.stringify(round(900001)));
    expect(first.final.completedTricks).not.toStrictEqual(round(900002).final.completedTricks);
    expect(() => generateTrainingRound({ seed: 1, generatorVersion: 2 })).toThrow();
    expect(() => generateTrainingRound({ seed: 1.5, generatorVersion })).toThrow();
  });

  it("keeps the 162-point invariant on 1 000 rounds, or the capot value", () => {
    for (let seed = 910000; seed < 911000; seed += 1) {
      const { final } = round(seed);
      const result = playedResult(final);
      if (!result) throw new Error(`Round ${seed} was not played.`);
      const scoring = resolveGameRules(final.settings).trickScoring;
      const total = final.completedTricks.reduce((sum, trick) => sum + trick.points, 0);
      expect(result.trickPointsByTeam[0] + result.trickPointsByTeam[1]).toBe(total);
      expect(total).toBe(result.capotTeam === null ? 162 : 162 - scoring.lastTrickBonus + scoring.capotLastTrickBonus);
    }
  });

  it("rebuilds the exact state after any number of tricks", () => {
    const sample = round(900010);
    expect(JSON.stringify(stateAfterTricks(sample, 8))).toBe(JSON.stringify(sample.final));
    for (let count = 0; count <= 8; count += 1) {
      const state = stateAfterTricks(sample, count);
      expect(state.completedTricks).toStrictEqual(sample.final.completedTricks.slice(0, count));
      const expected: Record<TeamId, number> = { 0: 0, 1: 0 };
      state.completedTricks.forEach((trick) => { expected[playerTeam(trick.winnerId)] += trick.points; });
      expect(state.trickPoints).toEqual(expected);
    }
    expect(() => stateAfterTricks(sample, 9)).toThrow();
    expect(() => stateAfterTricks(sample, -1)).toThrow();
  });

  it("announces belote then rebelote on the declaring player's trump King and Queen", () => {
    let announced = 0;
    for (let seed = 920000; seed < 920400; seed += 1) {
      const { final } = round(seed);
      const moments = beloteMoments(final);
      const belote = playedResult(final)!.belotePointsByTeam;
      if (moments.length === 0) {
        expect(belote[0] + belote[1]).toBe(0);
        continue;
      }
      announced += 1;
      expect(moments.map((moment) => moment.kind)).toEqual(["belote", "rebelote"]);
      expect(moments[0].trickIndex).toBeLessThan(moments[1].trickIndex);
      expect(moments[0].playerId).toBe(moments[1].playerId);
      expect(belote[moments[0].teamId]).toBeGreaterThan(0);
    }
    expect(announced).toBeGreaterThan(0);
  });
});

describe("round-count axis", () => {
  it("registers both counting axes", () => {
    expect(trainingAxes.resolve("round-count")).toBe(roundCountAxis);
    expect(trainingAxes.resolve("running-score")).toBe(runningScoreAxis);
    expect(isTrainingAxisId("round-count")).toBe(true);
    expect(isTrainingAxisId("running-score")).toBe(true);
  });

  it("builds deterministic series of full rounds whose answers come from the engine result", () => {
    for (const level of ROUND_COUNT_LEVELS) {
      const options = { seed: 1_000_000 + level * 100_000, generatorVersion, level };
      const series = generateRoundCountSeries(options);
      expect(series).toHaveLength(COUNTING_SERIES_LENGTH);
      expect(JSON.stringify(series)).toBe(JSON.stringify(generateRoundCountSeries(options)));
      expect(new Set(series.map((exercise) => exercise.seed)).size).toBe(COUNTING_SERIES_LENGTH);
      for (const exercise of series) {
        const { final } = round(exercise.seed);
        const result = playedResult(final)!;
        expect(exercise.generatorVersion).toBe(generatorVersion);
        expect(exercise.tricks).toStrictEqual(final.completedTricks);
        const { question } = exercise;
        if (question.kind === "team-tricks") expect(exercise.expected).toEqual([result.trickPointsByTeam[question.team]]);
        if (question.kind === "team-tricks-belote") {
          expect(exercise.expected).toEqual([result.trickPointsByTeam[question.team] + result.belotePointsByTeam[question.team]]);
        }
        if (question.kind === "round-score") expect(exercise.expected).toEqual([result.roundScore[0], result.roundScore[1]]);
        expect(question.kind).toBe(["team-tricks", "team-tricks-belote", "round-score"][level - 1]);
      }
    }
    expect(() => generateRoundCountSeries({ seed: 1, generatorVersion, level: 4 as 1 })).toThrow();
    expect(() => generateRoundCountSeries({ seed: 1, generatorVersion: 2, level: 1 })).toThrow();
  });

  it("asks level 2 only on rounds with an announced belote", () => {
    for (const seed of [1_200_000, 1_200_005, 1_200_010, 1_200_015]) {
      for (const exercise of generateRoundCountSeries({ seed, generatorVersion, level: 2 })) {
        expect(exercise.beloteMoments).toHaveLength(2);
        const belote = exercise.explanation.belotePointsByTeam;
        expect(belote[0] + belote[1]).toBeGreaterThan(0);
      }
    }
  });

  it("builds a level 1 exercise from any training position", () => {
    for (const seed of [380038, 380039, 380040]) {
      const exercise = roundCountAxis.createExercise(generateTrainingPosition({ seed, generatorVersion }));
      expect(exercise.tricks).toHaveLength(8);
      expect(exercise.level).toBe(1);
      expect(exercise.expected).toHaveLength(1);
    }
  });
});

describe("running-score axis", () => {
  it("stops mid-round and asks from the exact snapshot", () => {
    for (const level of RUNNING_SCORE_LEVELS) {
      const options = { seed: 2_000_000 + level * 100_000, generatorVersion, level };
      const series = generateRunningScoreSeries(options);
      expect(series).toHaveLength(COUNTING_SERIES_LENGTH);
      expect(JSON.stringify(series)).toBe(JSON.stringify(generateRunningScoreSeries(options)));
      for (const exercise of series) {
        expect(exercise.stopAfterTricks).toBeGreaterThanOrEqual(RUNNING_SCORE_MIN_TRICKS);
        expect(exercise.stopAfterTricks).toBeLessThanOrEqual(RUNNING_SCORE_MAX_TRICKS);
        const snapshot = stateAfterTricks(round(exercise.seed), exercise.stopAfterTricks);
        expect(exercise.tricks).toStrictEqual(snapshot.completedTricks);
        if (level === 1) expect(exercise.expected).toEqual([snapshot.trickPoints[0]]);
        if (level === 2) expect(exercise.expected).toEqual([snapshot.trickPoints[0], snapshot.trickPoints[1]]);
        if (level === 3) {
          const progress = getContractProgress(snapshot)!;
          expect(exercise.expected).toEqual([progress.pointsNeeded]);
          expect(progress.pointsNeeded).toBeGreaterThan(0);
          expect(exercise.question).toEqual({ kind: "points-needed", takerTeam: progress.takerTeam });
        }
      }
    }
    expect(() => generateRunningScoreSeries({ seed: 1, generatorVersion, level: 0 as 1 })).toThrow();
  });

  it("never shows a belote announcement that happens after the replay stops", () => {
    for (const level of RUNNING_SCORE_LEVELS) {
      for (const exercise of generateRunningScoreSeries({ seed: 2_500_000 + level, generatorVersion, level })) {
        expect(exercise.beloteMoments.every((moment) => moment.trickIndex < exercise.stopAfterTricks)).toBe(true);
      }
    }
  });

  it("builds a level 1 exercise from any training position, even before the first trick", () => {
    for (let seed = 380030; seed < 380060; seed += 1) {
      const position = generateTrainingPosition({ seed, generatorVersion });
      const exercise = runningScoreAxis.createExercise(position);
      expect(exercise.tricks.length).toBeGreaterThanOrEqual(1);
      expect(exercise.tricks.length).toBeGreaterThanOrEqual(position.state.completedTricks.length);
      expect(exercise.expected).toHaveLength(1);
    }
  });
});

describe("local progress for counting axes", () => {
  it("unlocks levels 2 and 3 in order at four out of five, half points included", () => {
    let progress = emptyTrainingProgress();
    for (const axisId of COUNTING_AXIS_IDS) {
      expect(isCountingLevelUnlocked(progress, axisId, 1)).toBe(true);
      expect(isCountingLevelUnlocked(progress, axisId, 2)).toBe(false);
      expect(isCountingLevelUnlocked(recordCountingSeries(progress, axisId, 1, 3.5), axisId, 2)).toBe(false);
      progress = recordCountingSeries(progress, axisId, 1, 4);
      expect(isCountingLevelUnlocked(progress, axisId, 2)).toBe(true);
      expect(isCountingLevelUnlocked(progress, axisId, 3)).toBe(false);
      // A perfect level 3 score cannot skip level 2.
      expect(isCountingLevelUnlocked(recordCountingSeries(progress, axisId, 3, 5), axisId, 3)).toBe(false);
      progress = recordCountingSeries(progress, axisId, 2, 4.5);
      expect(isCountingLevelUnlocked(progress, axisId, 3)).toBe(true);
      expect(progress.axes[axisId].levels[2]).toEqual({ bestScore: 4.5, completedSeries: 1 });
      // A worse replay keeps the best score and still counts the series.
      progress = recordCountingSeries(progress, axisId, 2, 1);
      expect(progress.axes[axisId].levels[2]).toEqual({ bestScore: 4.5, completedSeries: 2 });
    }
    expect(() => recordCountingSeries(progress, "round-count", 1, 4.25)).toThrow();
    expect(() => recordCountingSeries(progress, "round-count", 1, 6)).toThrow();
    expect(() => recordCountingSeries(progress, "round-count", 4 as 1, 1)).toThrow();
    expect(() => recordCountingSeries(progress, "trick-value" as "round-count", 1, 1)).toThrow();
  });

  it("keeps every axis when another one records a series", () => {
    const counting = recordCountingSeries(emptyTrainingProgress(), "round-count", 1, 4);
    const both = recordTrickValueSeries(counting, 1, 9);
    expect(both.axes["round-count"]).toEqual(counting.axes["round-count"]);
    expect(both.axes["trick-value"].levels[1]).toEqual({ bestScore: 9, completedSeries: 1 });
    const all = recordCountingSeries(both, "running-score", 1, 2);
    expect(all.axes["trick-value"]).toEqual(both.axes["trick-value"]);
    expect(all.axes["round-count"]).toEqual(counting.axes["round-count"]);
  });

  it("reads each axis on its own and derives unlocking from the scores", () => {
    const onlyCounting = parseTrainingProgress(JSON.stringify({
      version: 1,
      axes: { "round-count": { unlockedLevel: 3, levels: { 1: { bestScore: 4, completedSeries: 2 }, 2: { bestScore: 9, completedSeries: 1 } } } },
    }));
    expect(onlyCounting.axes["trick-value"]).toEqual(emptyTrainingProgress().axes["trick-value"]);
    expect(onlyCounting.axes["round-count"].levels[1]).toEqual({ bestScore: 4, completedSeries: 2 });
    // 9 is out of range for a five-exercise series: ignored, so level 3 stays locked despite the stored value.
    expect(onlyCounting.axes["round-count"].levels[2]).toEqual({ bestScore: 0, completedSeries: 1 });
    expect(onlyCounting.axes["round-count"].unlockedLevel).toBe(2);
    expect(onlyCounting.axes["running-score"]).toEqual(emptyTrainingProgress().axes["running-score"]);

    let key = "";
    let raw = "";
    const saved = recordCountingSeries(emptyTrainingProgress(), "running-score", 1, 4.5);
    saveTrainingProgress(saved, { setItem: (nextKey, value) => { key = nextKey; raw = value; } });
    expect(key).toBe(TRAINING_PROGRESS_KEY);
    expect(readTrainingProgress({ getItem: () => raw })).toEqual(saved);
  });

  it("parses levels strictly and spaces series seeds per axis and level", () => {
    expect(parseCountingLevel("1")).toBe(1);
    expect(parseCountingLevel("3")).toBe(3);
    expect(parseCountingLevel("4")).toBeNull();
    expect(parseCountingLevel(["1"])).toBeNull();
    expect(isCountingAxisId("round-count")).toBe(true);
    expect(isCountingAxisId("trick-value")).toBe(false);
    const initial = emptyTrainingProgress();
    const seeds = COUNTING_AXIS_IDS.flatMap((axisId) => ([1, 2, 3] as const).map((level) => countingSeriesSeed(initial, axisId, level)));
    expect(new Set(seeds).size).toBe(6);
    const after = recordCountingSeries(initial, "round-count", 1, 0);
    expect(countingSeriesSeed(after, "round-count", 1) - countingSeriesSeed(initial, "round-count", 1)).toBeGreaterThan(500);
    expect(countingSeriesSeed(after, "round-count", 2)).toBe(countingSeriesSeed(initial, "round-count", 2));
  });
});

describe("counting answers", () => {
  it("grades exact, partial, empty and malformed answers without throwing", () => {
    expect(gradeCountingAnswers([81], [81])).toBe(1);
    expect(gradeCountingAnswers([81], [80])).toBe(0);
    expect(gradeCountingAnswers([90, 72], [90, 72])).toBe(1);
    expect(gradeCountingAnswers([90, 72], [90, 0])).toBe(0.5);
    expect(gradeCountingAnswers([90, 72], [0, 72])).toBe(0.5);
    expect(gradeCountingAnswers([90, 72], [])).toBe(0);
    expect(gradeCountingAnswers([90, 72], [90])).toBe(0);
    expect(gradeCountingAnswers([90], [90, 1])).toBe(0);
    expect(gradeCountingAnswers([90], [Number.NaN])).toBe(0);
    expect(gradeCountingAnswers([90], ["90"])).toBe(0);
    expect(gradeCountingAnswers([90], [90.5])).toBe(0);
    expect(gradeCountingAnswers([], [])).toBe(0);
  });
});
