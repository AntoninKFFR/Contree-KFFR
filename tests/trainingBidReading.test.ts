import { describe, expect, it } from "vitest";
import { interpretAdvancedRulesBid } from "@/bots/strategy/advancedRulesBidReading";
import {
  bidReadingSeriesSeed, emptyTrainingProgress, isBidReadingLevelUnlocked, parseBidReadingLevel,
  parseTrainingProgress, recordBidReadingSeries,
} from "@/components/training/progress";
import { cardId } from "@/engine/cards";
import {
  BID_READING_AXIS_VERSION, BID_READING_LEVEL_SLOTS, BID_READING_MEANING_LABELS, BID_READING_SERIES_LENGTH,
  bidReadingAxis, generateBidReadingSeries, gradeBidReadingExercise, type BidReadingLevel,
} from "@/engine/training/bidReading";
import { trainingAxes } from "@/engine/training/axes";
import { generatorVersion } from "@/engine/training/generator";

const options = (level: BidReadingLevel, seed = 8_000_000_000 + level * 10_000_000) =>
  ({ level, seed, generatorVersion, axisVersion: BID_READING_AXIS_VERSION });

describe("doctrinal bid reading", () => {
  it("registers only a puzzle axis and parses precisely four levels", () => {
    expect(trainingAxes.resolve("bid-reading")).toBe(bidReadingAxis);
    expect(bidReadingAxis.inGame).toBeUndefined();
    for (const level of [1, 2, 3, 4] as const) expect(parseBidReadingLevel(String(level))).toBe(level);
    for (const value of ["0", "5", "01", undefined, 1, ["1"]]) expect(parseBidReadingLevel(value)).toBeNull();
  });

  it("builds ten seed-stable legal V4.1 actions per level from public auctions", () => {
    for (const level of [1, 2, 3, 4] as const) {
      expect(BID_READING_LEVEL_SLOTS[level]).toHaveLength(BID_READING_SERIES_LENGTH);
      const first = generateBidReadingSeries(options(level));
      expect(first).toHaveLength(10);
      expect(JSON.stringify(first)).toBe(JSON.stringify(generateBidReadingSeries(options(level))));
      expect(first).not.toEqual(generateBidReadingSeries(options(level, options(level).seed + 10_000)));
      expect(new Set(first.map((exercise) => JSON.stringify(exercise.publicBids))).size).toBeGreaterThanOrEqual(8);
      for (const [index, exercise] of first.entries()) {
        expect(exercise).toMatchObject({ axisId: "bid-reading", axisVersion: 1,
          doctrineId: "advanced_rules_v4", doctrineRevision: "4.1", level,
          generatorVersion: 1, slotFamily: BID_READING_LEVEL_SLOTS[level][index].family });
        expect(exercise.targetBidIndex).toBe(exercise.publicBids.length - 1);
        expect(exercise.targetBid).toEqual(exercise.publicBids[exercise.targetBidIndex]);
        expect(exercise.targetPlayerId).toBe(exercise.targetBid.playerId);
        expect(exercise.publicContext.bidsBefore).toEqual(exercise.publicBids.slice(0, -1));
        expect(exercise.publicContext.targetPlayerId).toBe(exercise.targetPlayerId);
        expect(exercise.publicContext).not.toHaveProperty("hands");
        expect(exercise.promise).toEqual(interpretAdvancedRulesBid(exercise.publicContext, exercise.targetBid));
        expect(exercise.illustrationHand).toHaveLength(8);
        expect(new Set(exercise.illustrationHand.map(cardId)).size).toBe(8);
        expect(exercise.assertionChoices.length).toBeGreaterThanOrEqual(5);
        expect(exercise.assertionChoices.length).toBeLessThanOrEqual(8);
        expect(new Set(exercise.assertionChoices).size).toBe(exercise.assertionChoices.length);
        expect(exercise.assertionChoices.some((id) => !exercise.promise.guaranteed.includes(id))).toBe(true);
        // The example hand is only an illustration; replacing it cannot change the public promise.
        const replaced = { ...exercise, illustrationHand: [] };
        expect(interpretAdvancedRulesBid(replaced.publicContext, replaced.targetBid)).toEqual(exercise.promise);
      }
    }
    expect(() => generateBidReadingSeries({ ...options(1), axisVersion: 2 })).toThrow("Unsupported bid-reading axis version");
    expect(() => generateBidReadingSeries({ ...options(1), generatorVersion: 2 })).toThrow("Unsupported training generator version");
    expect(() => generateBidReadingSeries({ ...options(1), level: 5 as BidReadingLevel })).toThrow("Unknown bid-reading level");
    expect(() => generateBidReadingSeries({ ...options(1), seed: NaN })).toThrow("Bid-reading seed");
  });

  it("grades exactly the offered guaranteed assertions and rejects malformed answers", () => {
    for (const level of [1, 2, 3, 4] as const) for (const exercise of generateBidReadingSeries(options(level))) {
      const expected = exercise.assertionChoices.filter((id) => exercise.promise.guaranteed.includes(id));
      expect(gradeBidReadingExercise(exercise, { selectedAssertionIds: [...expected].reverse() })).toEqual({ correct: true, score: 1 });
      const falseChoice = exercise.assertionChoices.find((id) => !exercise.promise.guaranteed.includes(id))!;
      expect(gradeBidReadingExercise(exercise, { selectedAssertionIds: [...expected, falseChoice] }).score).toBe(0);
      for (const malformed of [null, {}, { selectedAssertionIds: "has-jack" },
        { selectedAssertionIds: ["unknown"] }, { selectedAssertionIds: [falseChoice, falseChoice] },
        { selectedAssertionIds: expected, extra: true }]) {
        expect(gradeBidReadingExercise(exercise, malformed)).toEqual({ correct: false, score: 0 });
      }
    }
  });

  it("marks the level-four competitive fit as partner support in its correction", () => {
    const exercise = generateBidReadingSeries(options(4)).find((item) => item.slotFamily === "fit dans une compétition");
    expect(exercise).toBeDefined();
    expect(exercise!.promise.guaranteed).toContain("supports-partner-suit");
    expect(exercise!.promise.possibleMeanings).toContain("competitive-partner-support");
    expect(BID_READING_MEANING_LABELS["competitive-partner-support"])
      .toBe("un soutien de la couleur du partenaire dans une enchère compétitive");
    expect(exercise!.promise.guaranteed).not.toContain("strong-partner-fit");
  });

  it("keeps local bid-reading progress independent and resets only this axis on version change", () => {
    const base = emptyTrainingProgress();
    base.axes.bidding.levels[1] = { bestScore: 9, completedSeries: 2 };
    expect(isBidReadingLevelUnlocked(base, 2)).toBe(false);
    const failed = recordBidReadingSeries(base, 1, 7);
    expect(failed.axes["bid-reading"].unlockedLevel).toBe(1);
    const passed = recordBidReadingSeries(failed, 1, 8);
    expect(passed.axes["bid-reading"].unlockedLevel).toBe(2);
    expect(passed.axes["bid-reading"].levels[1]).toEqual({ bestScore: 8, completedSeries: 2 });
    expect(isBidReadingLevelUnlocked(passed, 2)).toBe(true);
    expect(bidReadingSeriesSeed(passed, 1)).toBe(bidReadingSeriesSeed(base, 1) + 20_000);
    expect(recordBidReadingSeries(passed, 1, 6).axes["bid-reading"].unlockedLevel).toBe(2);
    const stale = JSON.parse(JSON.stringify(passed));
    stale.axes["bid-reading"].axisVersion = 2;
    const parsed = parseTrainingProgress(JSON.stringify(stale));
    expect(parsed.axes["bid-reading"]).toEqual(emptyTrainingProgress().axes["bid-reading"]);
    expect(parsed.axes.bidding.levels).toEqual(base.axes.bidding.levels);
    expect(parsed.axes.bidding.unlockedLevel).toBe(2);
    expect(() => recordBidReadingSeries(base, 2, 8)).toThrow("Invalid bid-reading series result");
  });
});
