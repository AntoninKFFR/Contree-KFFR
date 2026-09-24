import { describe, expect, it } from "vitest";
import { resolveContractMode } from "@/engine/contractMode";
import { cardPoints, playerTeam } from "@/engine/rules";
import { isTrainingAxisId, trainingAxes } from "@/engine/training/axes";
import { generateTrainingPosition, generatorVersion } from "@/engine/training/generator";
import {
  createPileCountExercise, generatePileCountSeries, parsePileCountMode, PILE_COUNT_SERIES_LENGTH, pileCountAxis,
  pileGeneratorVersion, playBotRound,
} from "@/engine/training/pileCount";
import {
  emptyTrainingProgress, isPileCountModeUnlocked, parseTrainingProgress, pileCountSeriesSeed, readTrainingProgress,
  recordPileCountSeries, recordTrickValueChallengeRun, recordTrickValueSeries, saveTrainingProgress,
} from "@/components/training/progress";
import { formatDuration } from "@/components/training/pileCountCopy";

const series = (seed: number) => generatePileCountSeries({ seed, generatorVersion: pileGeneratorVersion });

describe("bot-played rounds", () => {
  it("replays the same round for the same seed and plays all eight tricks", () => {
    const first = playBotRound(3_000_000);
    expect(first).not.toBeNull();
    expect(first!.completedTricks).toHaveLength(8);
    expect(first!.result?.kind).toBe("played");
    expect(JSON.stringify(first)).toBe(JSON.stringify(playBotRound(3_000_000)));
    expect(first!.completedTricks).not.toStrictEqual(playBotRound(3_000_001)!.completedTricks);
    expect(() => playBotRound(1.5)).toThrow();
  });

  it("keeps a reference series stable: a change here means the bot or the deal changed", () => {
    // If this fails after a bot change, bump pileGeneratorVersion and update the reference.
    expect(series(3_000_000).map((exercise) => [exercise.seed, exercise.trickCount, exercise.answer])).toEqual([
      [3000000, 5, 69], [3000001, 5, 93], [3000002, 4, 92], [3000003, 5, 107], [3000004, 6, 139],
      [3000005, 6, 130], [3000006, 7, 146], [3000007, 6, 143], [3000008, 3, 63], [3000009, 6, 126],
    ]);
  });
});

describe("pile-count exercises", () => {
  it("builds deterministic, versioned series of ten piles", () => {
    const first = series(3_000_000);
    expect(first).toHaveLength(PILE_COUNT_SERIES_LENGTH);
    expect(JSON.stringify(first)).toBe(JSON.stringify(series(3_000_000)));
    expect(new Set(first.map((exercise) => exercise.seed)).size).toBe(PILE_COUNT_SERIES_LENGTH);
    expect(first.every((exercise) => exercise.generatorVersion === pileGeneratorVersion)).toBe(true);
    expect(() => generatePileCountSeries({ seed: 1, generatorVersion: pileGeneratorVersion + 1 })).toThrow();
    expect(() => generatePileCountSeries({ seed: 1.5, generatorVersion: pileGeneratorVersion })).toThrow();
  });

  it("shows exactly the team's won tricks and reads the total from the engine, on 200 piles", () => {
    for (let seed = 3_100_000; seed < 3_100_000 + 20 * 1000; seed += 1000) {
      for (const exercise of series(seed)) {
        const final = playBotRound(exercise.seed)!;
        const result = final.result!;
        if (result.kind !== "played") throw new Error("Expected a played round.");
        const won = final.completedTricks.filter((trick) => playerTeam(trick.winnerId) === 0);
        const mode = resolveContractMode(final)!;
        expect(exercise.cards).toStrictEqual(won.flatMap((trick) => trick.cards.map(({ card }) => card)));
        expect(exercise.cards).toHaveLength(4 * exercise.trickCount);
        expect(exercise.trickCount).toBeGreaterThanOrEqual(1);
        expect(exercise.cardPoints).toBe(exercise.cards.reduce((sum, card) => sum + cardPoints(card, mode), 0));
        // The after-answer detail: one engine value per card, adding up to the card points.
        expect(exercise.cardValues).toEqual(exercise.cards.map((card) => cardPoints(card, mode)));
        expect(exercise.cardValues.reduce((sum, value) => sum + value, 0)).toBe(exercise.cardPoints);
        expect(exercise.hasTenDeDer).toBe(playerTeam(final.completedTricks[7].winnerId) === 0);
        expect(exercise.tenDeDerPoints).toBe(exercise.hasTenDeDer ? 10 : 0);
        expect(exercise.hasBelote).toBe(exercise.belotePoints > 0);
        expect(exercise.answer).toBe(exercise.cardPoints + exercise.tenDeDerPoints + exercise.belotePoints);
        expect(exercise.answer).toBe(result.trickPointsByTeam[0] + result.belotePointsByTeam[0]);
        // The invariant behind the "162 minus the other pile" tip: capot rounds are kept out.
        expect(result.capotTeam).toBeNull();
        expect(exercise.teamTrickPoints + exercise.otherTeamTrickPoints).toBe(162);
        expect(exercise.trump).toBe(mode.kind === "suit" ? mode.suit : null);
      }
    }
  });

  it("covers piles with and without the ten de der and the belote", () => {
    const piles = [3_000_000, 3_001_000, 3_002_000, 3_003_000, 3_004_000].flatMap(series);
    expect(piles.some((exercise) => exercise.hasTenDeDer)).toBe(true);
    expect(piles.some((exercise) => !exercise.hasTenDeDer)).toBe(true);
    expect(piles.some((exercise) => exercise.hasBelote && exercise.belotePoints === 20)).toBe(true);
    expect(piles.some((exercise) => !exercise.hasBelote)).toBe(true);
  });

  it("refuses capot rounds", () => {
    let checked = 0;
    for (let seed = 4_000_000; seed < 4_003_000 && checked < 3; seed += 1) {
      const final = playBotRound(seed);
      if (final?.result?.kind !== "played" || final.result.capotTeam === null) continue;
      checked += 1;
      expect(createPileCountExercise(seed, final)).toBeNull();
    }
    expect(checked).toBeGreaterThan(0);
  });

  it("registers the axis and parses modes strictly", () => {
    expect(trainingAxes.resolve("pile-count")).toBe(pileCountAxis);
    expect(isTrainingAxisId("pile-count")).toBe(true);
    expect(pileCountAxis.createExercise(generateTrainingPosition({ seed: 380038, generatorVersion })).cards.length).toBeGreaterThan(0);
    expect(parsePileCountMode("beginner")).toBe("beginner");
    expect(parsePileCountMode("free")).toBe("free");
    expect(parsePileCountMode("expert")).toBeNull();
    expect(parsePileCountMode(["normal"])).toBeNull();
  });
});

describe("pile-count progress", () => {
  it("opens beginner and free, and unlocks normal at eight out of ten in beginner", () => {
    const initial = emptyTrainingProgress();
    expect(isPileCountModeUnlocked(initial, "beginner")).toBe(true);
    expect(isPileCountModeUnlocked(initial, "free")).toBe(true);
    expect(isPileCountModeUnlocked(initial, "normal")).toBe(false);
    expect(isPileCountModeUnlocked(recordPileCountSeries(initial, "beginner", 7), "normal")).toBe(false);
    const unlocked = recordPileCountSeries(initial, "beginner", 8);
    expect(isPileCountModeUnlocked(unlocked, "normal")).toBe(true);
    expect(unlocked.axes["pile-count"].modes.beginner).toEqual({ bestScore: 8, completedSeries: 1 });
    const replay = recordPileCountSeries(unlocked, "beginner", 3);
    expect(replay.axes["pile-count"].modes.beginner).toEqual({ bestScore: 8, completedSeries: 2 });
  });

  it("keeps no best score in free mode, only a series count for fresh piles", () => {
    const free = recordPileCountSeries(emptyTrainingProgress(), "free", 10);
    expect(free.axes["pile-count"].modes.free).toEqual({ completedSeries: 1 });
    expect(isPileCountModeUnlocked(free, "normal")).toBe(false);
  });

  it("never erases another axis when one records", () => {
    const pile = recordPileCountSeries(emptyTrainingProgress(), "beginner", 9);
    const withTrickValue = recordTrickValueSeries(pile, 1, 8);
    expect(withTrickValue.axes["pile-count"]).toEqual(pile.axes["pile-count"]);
    const withChallenge = recordTrickValueChallengeRun(withTrickValue, {
      mode: "survival", finished: true, correctAnswers: 4, bestStreak: 4,
    } as Parameters<typeof recordTrickValueChallengeRun>[1]);
    expect(withChallenge.axes["pile-count"]).toEqual(pile.axes["pile-count"]);
    expect(recordPileCountSeries(withChallenge, "normal", 5).axes["trick-value"]).toEqual(withChallenge.axes["trick-value"]);
  });

  it("reads a save holding only this axis without wiping it, and round-trips", () => {
    const onlyPile = parseTrainingProgress(JSON.stringify({
      version: 1,
      axes: { "pile-count": { modes: { beginner: { bestScore: 9, completedSeries: 2 }, normal: { bestScore: 11, completedSeries: 1 } } } },
    }));
    expect(onlyPile.axes["pile-count"].modes.beginner).toEqual({ bestScore: 9, completedSeries: 2 });
    // 11 is not a valid score out of ten: ignored.
    expect(onlyPile.axes["pile-count"].modes.normal).toEqual({ bestScore: 0, completedSeries: 1 });
    expect(onlyPile.axes["pile-count"].modes.free).toEqual({ completedSeries: 0 });
    expect(onlyPile.axes["trick-value"]).toEqual(emptyTrainingProgress().axes["trick-value"]);

    let raw = "";
    const saved = recordPileCountSeries(emptyTrainingProgress(), "free", 2);
    saveTrainingProgress(saved, { setItem: (_key, value) => { raw = value; } });
    expect(readTrainingProgress({ getItem: () => raw })).toEqual(saved);
  });

  it("records a manual time only with a perfect series, and keeps the fastest one", () => {
    const initial = emptyTrainingProgress();
    expect(isPileCountModeUnlocked(initial, "manual")).toBe(true);
    expect(() => recordPileCountSeries(initial, "manual", 10)).toThrow();
    expect(() => recordPileCountSeries(initial, "manual", 10, 0)).toThrow();
    const imperfect = recordPileCountSeries(initial, "manual", 9, 40_000);
    expect(imperfect.axes["pile-count"].modes.manual).toEqual({ completedSeries: 1, bestTimeMs: null });
    const first = recordPileCountSeries(imperfect, "manual", 10, 65_300.4);
    expect(first.axes["pile-count"].modes.manual).toEqual({ completedSeries: 2, bestTimeMs: 65_300 });
    const slower = recordPileCountSeries(first, "manual", 10, 70_000);
    expect(slower.axes["pile-count"].modes.manual.bestTimeMs).toBe(65_300);
    const faster = recordPileCountSeries(slower, "manual", 10, 50_000);
    expect(faster.axes["pile-count"].modes.manual).toEqual({ completedSeries: 4, bestTimeMs: 50_000 });
    // The other modes are untouched.
    expect(faster.axes["pile-count"].modes.beginner).toEqual(initial.axes["pile-count"].modes.beginner);
    const parsed = parseTrainingProgress(JSON.stringify({ version: 1, axes: { "pile-count": { modes: { manual: { completedSeries: 3, bestTimeMs: -5 } } } } }));
    expect(parsed.axes["pile-count"].modes.manual).toEqual({ completedSeries: 3, bestTimeMs: null });
    expect(parsePileCountMode("manual")).toBe("manual");
  });

  it("formats pile times in French", () => {
    expect(formatDuration(0)).toBe("0,0 s");
    expect(formatDuration(8_440)).toBe("8,4 s");
    expect(formatDuration(59_960)).toBe("1 min 00,0 s");
    expect(formatDuration(65_300)).toBe("1 min 05,3 s");
  });

  it("uses distinct seeds per mode that move forward after each series, and rejects bad input", () => {
    const initial = emptyTrainingProgress();
    const seeds = (["beginner", "normal", "free", "manual"] as const).map((mode) => pileCountSeriesSeed(initial, mode));
    expect(new Set(seeds).size).toBe(4);
    const after = recordPileCountSeries(initial, "beginner", 0);
    expect(pileCountSeriesSeed(after, "beginner") - pileCountSeriesSeed(initial, "beginner")).toBeGreaterThanOrEqual(1000);
    expect(pileCountSeriesSeed(after, "normal")).toBe(pileCountSeriesSeed(initial, "normal"));
    expect(() => recordPileCountSeries(initial, "beginner", 11)).toThrow();
    expect(() => recordPileCountSeries(initial, "beginner", 7.5)).toThrow();
    expect(() => recordPileCountSeries(initial, "expert" as "free", 1)).toThrow();
    expect(() => pileCountSeriesSeed(initial, "expert" as "free")).toThrow();
  });
});
