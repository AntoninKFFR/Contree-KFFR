import { describe, expect, it } from "vitest";
import { chooseAdvancedRulesBidWithTrace } from "@/bots/strategy/advancedRulesBidding";
import {
  biddingSeriesSeed, emptyTrainingProgress, isBiddingLevelUnlocked, parseBiddingLevel,
  parseTrainingProgress, recordBiddingSeries, TRAINING_PROGRESS_KEY,
} from "@/components/training/progress";
import { cardId } from "@/engine/cards";
import { makeBid } from "@/engine/game";
import { CONTREE_KFFR_RULESET } from "@/engine/rulesets/presets";
import {
  assertBiddingDoctrineVersion, BIDDING_AXIS_VERSION, BIDDING_DOCTRINE_ID, BIDDING_DOCTRINE_REVISION,
  BIDDING_LEVEL_SLOTS, BIDDING_MAX_ATTEMPTS, BIDDING_SERIES_LENGTH, biddingAxis,
  formatBiddingAnswer, generateBiddingSeries, gradeBiddingExercise, selectBiddingPosition,
  type BiddingAnswer, type BiddingLevel,
} from "@/engine/training/bidding";
import { explainBiddingTrace } from "@/engine/training/biddingFeedback";
import { generatorVersion } from "@/engine/training/generator";
import { trainingAxes } from "@/engine/training/axes";
import type { PlayerId } from "@/engine/types";

const options = (level: BiddingLevel, seed = 7_000_000_000 + level * 10_000_000) =>
  ({ level, seed, generatorVersion, axisVersion: BIDDING_AXIS_VERSION });

describe("doctrinal bidding generator", () => {
  it("registers only a puzzle capability and pins the source doctrine", () => {
    expect(trainingAxes.resolve("bidding")).toBe(biddingAxis);
    expect(trainingAxes.resolve("bidding").inGame).toBeUndefined();
    expect(parseBiddingLevel("1")).toBe(1);
    expect(parseBiddingLevel("4")).toBe(4);
    for (const invalid of ["0", "5", "01", undefined, ["1"], 1]) expect(parseBiddingLevel(invalid)).toBeNull();
    expect(() => assertBiddingDoctrineVersion({ doctrineId: BIDDING_DOCTRINE_ID, doctrineRevision: BIDDING_DOCTRINE_REVISION })).not.toThrow();
    expect(() => assertBiddingDoctrineVersion({ doctrineId: BIDDING_DOCTRINE_ID, doctrineRevision: "4.2" as "4.1" }))
      .toThrow("Unsupported bidding doctrine revision for training axis v1.");
    const { state } = selectBiddingPosition(options(1).seed, BIDDING_LEVEL_SLOTS[1][0], 1);
    const custom = { ...state, settings: { ...state.settings, ruleset: {
      ...CONTREE_KFFR_RULESET, bidding: { ...CONTREE_KFFR_RULESET.bidding, allowNoTrump: true },
    } } };
    expect(() => biddingAxis.createExercise({ seed: 1, generatorVersion, state: custom }))
      .toThrow("requires contree-kffr ruleset version 1");
  });

  it("generates ten distinct public situations at every level, deterministically and within a bounded search", () => {
    const startedAt = performance.now();
    for (const level of [1, 2, 3, 4] as const) {
      expect(BIDDING_LEVEL_SLOTS[level]).toHaveLength(BIDDING_SERIES_LENGTH);
      const first = generateBiddingSeries(options(level));
      expect(first).toHaveLength(BIDDING_SERIES_LENGTH);
      expect(JSON.stringify(first)).toBe(JSON.stringify(generateBiddingSeries(options(level))));
      expect(first).not.toEqual(generateBiddingSeries(options(level, options(level).seed + 10_000)));
      expect(new Set(first.map((exercise) => JSON.stringify([exercise.ownHand, exercise.publicBids]))).size).toBeGreaterThanOrEqual(8);
      for (const [index, exercise] of first.entries()) {
        expect(exercise).toMatchObject({ axisId: "bidding", axisVersion: 1, doctrineId: "advanced_rules_v4",
          doctrineRevision: "4.1", generatorVersion: 1, rulesetId: "contree-kffr", rulesetVersion: 1, level });
        expect(exercise.ownHand).toHaveLength(8);
        expect(exercise.trace.reasonCode).toBe(BIDDING_LEVEL_SLOTS[level][index].reasonCode);
        expect(exercise.trace.decisionBranch).toBe(exercise.expected.action === "coinche"
          ? BIDDING_LEVEL_SLOTS[level][index].overbidEvidence ? "coinche-overbid" : "coinche-control"
          : exercise.trace.decisionBranch);
        expect(exercise.expected.action).toBe(BIDDING_LEVEL_SLOTS[level][index].action);
        expect(exercise.trace.overbidEvidence).toBe(BIDDING_LEVEL_SLOTS[level][index].overbidEvidence);
      }
    }
    expect(BIDDING_MAX_ATTEMPTS).toBeLessThanOrEqual(16);
    expect(() => generateBiddingSeries({ ...options(1), level: 5 as BiddingLevel })).toThrow("Unknown bidding level");
    expect(() => generateBiddingSeries({ ...options(1), generatorVersion: 2 })).toThrow("Unsupported training generator version");
    expect(() => generateBiddingSeries({ ...options(1), axisVersion: 2 })).toThrow("Unsupported bidding axis version");
    expect(() => generateBiddingSeries({ ...options(1), seed: NaN })).toThrow("Bidding seed");
    expect(() => selectBiddingPosition(10, { ...BIDDING_LEVEL_SLOTS[1][0], reasonCode: "capot-full-control" }, 1))
      .toThrow(`after ${BIDDING_MAX_ATTEMPTS} attempts`);
    expect(performance.now() - startedAt).toBeLessThan(2_000);
  });

  it("uses legal complete auctions, unique cards, seat zero and only the public projection", () => {
    for (const level of [1, 2, 3, 4] as const) {
      for (const [index, slot] of BIDDING_LEVEL_SLOTS[level].entries()) {
        const { state, exercise } = selectBiddingPosition(options(level).seed + index * 1_000, slot, level);
        expect(state.phase).toBe("bidding");
        expect(state.currentPlayerId).toBe(0);
        expect(state.settings.ruleset).toEqual(CONTREE_KFFR_RULESET);
        expect(Object.values(state.hands).flat().map(cardId)).toHaveLength(32);
        expect(new Set(Object.values(state.hands).flat().map(cardId)).size).toBe(32);
        expect(() => makeBid(state, 0, exercise.expected)).not.toThrow();
        expect(exercise.publicBids).toEqual(state.bids);
        expect(exercise.currentContract).toEqual(exercise.trace.currentContract);
        expect(Object.keys(exercise).sort()).toEqual([
          "axisId", "axisVersion", "currentContract", "doctrineId", "doctrineRevision", "expected", "generatorVersion",
          "level", "ownHand", "playerNames", "publicBids", "question", "rulesetId", "rulesetVersion", "seed", "startingPlayerId", "trace",
        ].sort());
        for (const id of [1, 2, 3] as PlayerId[]) {
          expect(JSON.stringify(exercise)).not.toContain(JSON.stringify(state.hands[id]));
        }
        expect(exercise.publicBids.every((bid) => bid.action !== "generale")).toBe(true);
        expect(exercise.publicBids.every((bid) => bid.action !== "bid" || bid.contractMode?.kind !== "no-trump" && bid.contractMode?.kind !== "all-trump")).toBe(true);
      }
    }
  });

  it("always takes expected and the pedagogical trace from V4.1, independent of hidden hands", () => {
    for (const level of [1, 2, 3, 4] as const) for (const [index, slot] of BIDDING_LEVEL_SLOTS[level].entries()) {
      const { state, exercise } = selectBiddingPosition(options(level).seed + index * 1_000, slot, level);
      const decision = chooseAdvancedRulesBidWithTrace(state);
      expect(exercise.trace).toEqual(decision.trace);
      expect(exercise.expected.action).toBe(decision.bid.action);
      if (exercise.expected.action === "bid" && decision.bid.action === "bid" && "value" in decision.bid) {
        expect(exercise.expected.value).toBe(decision.bid.value);
        expect(exercise.expected.trump).toBe(decision.bid.trump ?? (decision.bid.contractMode?.kind === "suit" ? decision.bid.contractMode.suit : undefined));
      }
      const shuffled = { ...state, hands: { ...state.hands,
        1: state.hands[2], 2: state.hands[3], 3: state.hands[1] } };
      expect(chooseAdvancedRulesBidWithTrace(shuffled)).toEqual(decision);
    }
  });

  it("keeps the four levels' slot categories and public auction shapes", () => {
    const first = generateBiddingSeries(options(1));
    expect(first.every((exercise) => exercise.publicBids.length === 0 && exercise.startingPlayerId === 0)).toBe(true);
    expect(new Set(first.map((exercise) => exercise.trace.reasonCode))).toEqual(new Set([
      "weak-trump-foundation", "single-major-probe", "weak-long-trump-show-80", "autonomous-opening", "pass-ceiling-too-low",
    ]));
    const second = generateBiddingSeries(options(2));
    expect(second.every((exercise) => exercise.publicBids.length === 1 && exercise.publicBids[0].playerId === 3)).toBe(true);
    expect(new Set(second.filter((exercise) => exercise.expected.action === "coinche").map((exercise) =>
      exercise.trace.overbidEvidence ?? "classical"))).toEqual(new Set(["classical", "side-controls", "trump-lock", "combined"]));
    expect(second.some((exercise) => exercise.currentContract?.value === 160 && exercise.expected.action === "pass")).toBe(true);
    const third = generateBiddingSeries(options(3));
    expect(third.every((exercise) => exercise.publicBids.length === 2 && exercise.publicBids[0].playerId === 2
      && exercise.publicBids[1].playerId === 3)).toBe(true);
    expect(new Set(third.map((exercise) => exercise.trace.reasonCode))).toEqual(new Set([
      "partner-fit", "strong-partner-fit", "partner-suit-respected", "partner-suit-override", "weak-trump-foundation",
    ]));
    const fourth = generateBiddingSeries(options(4));
    expect(fourth.every((exercise) => exercise.publicBids.length >= 3)).toBe(true);
    for (const reason of ["rebid-after-support", "competitive-overcall", "pass-contract-blocked", "coinche-obvious-overbid", "surcoinche-large-margin"]) {
      expect(fourth.some((exercise) => exercise.trace.reasonCode === reason)).toBe(true);
    }
  });
});

describe("bidding correction and local progression", () => {
  const base = generateBiddingSeries(options(1))[0];
  it("grades exact value and suit with no partial credit, plus every special action", () => {
    const ninety = { ...base, expected: { action: "bid", value: 90, trump: "hearts" } as const };
    expect(gradeBiddingExercise(ninety, { action: "bid", value: 90, trump: "hearts" })).toEqual({ correct: true, score: 1 });
    for (const wrong of [{ action: "bid", value: 100, trump: "hearts" }, { action: "bid", value: 90, trump: "spades" }, { action: "pass" }]) {
      expect(gradeBiddingExercise(ninety, wrong)).toEqual({ correct: false, score: 0 });
    }
    for (const expected of [{ action: "pass" }, { action: "coinche" }, { action: "surcoinche" }, { action: "capot", trump: "hearts" }] as BiddingAnswer[]) {
      expect(gradeBiddingExercise({ ...base, expected }, expected)).toEqual({ correct: true, score: 1 });
      expect(gradeBiddingExercise({ ...base, expected }, { action: "bid", value: 80, trump: "hearts" })).toEqual({ correct: false, score: 0 });
    }
    expect(gradeBiddingExercise({ ...base, expected: { action: "capot", trump: "hearts" } },
      { action: "capot", trump: "spades" })).toEqual({ correct: false, score: 0 });
    for (const invalid of [null, {}, [], { action: "bid", value: "90", trump: "hearts" },
      { action: "bid", value: 90, trump: "no-trump" }, { action: "pass", extra: true }, { action: "capot" }]) {
      expect(gradeBiddingExercise(ninety, invalid)).toEqual({ correct: false, score: 0 });
    }
    expect(formatBiddingAnswer({ action: "pass" })).toBe("Passe");
    expect(formatBiddingAnswer({ action: "bid", value: 80, trump: "hearts" })).toBe("80 ♥");
    expect(formatBiddingAnswer({ action: "coinche" })).toBe("Coinche");
    expect(formatBiddingAnswer({ action: "surcoinche" })).toBe("Surcoinche");
    expect(formatBiddingAnswer({ action: "capot", trump: "spades" })).toBe("Capot ♠");
  });

  it("rephrases every teaching branch without exposing technical scores or keys", () => {
    const traces = [1, 2, 3, 4].flatMap((level) => generateBiddingSeries(options(level as BiddingLevel)).map((exercise) => exercise.trace));
    for (const trace of traces) {
      const explanation = explainBiddingTrace(trace);
      expect(explanation.length).toBeGreaterThan(40);
      expect(explanation).not.toMatch(/intrinsicHandStrength|estimateDefensiveTricks|autonomyScore|reasonCode|4\.65|3\.95|3\.10/);
    }
    const overbid = traces.filter((trace) => trace.reasonCode === "coinche-obvious-overbid");
    expect(new Set(overbid.map((trace) => trace.overbidEvidence))).toEqual(new Set(["side-controls", "trump-lock", "combined"]));
    expect(explainBiddingTrace(overbid.find((trace) => trace.overbidEvidence === "trump-lock")!)).toContain("atout adverse");
    for (const reasonCode of ["weak-trump-foundation", "weak-long-trump-show-80", "single-major-probe",
      "autonomous-opening", "partner-fit", "strong-partner-fit", "rebid-after-support", "competitive-overcall",
      "partner-suit-respected", "partner-suit-override", "coinche-strong-trump-control",
      "surcoinche-large-margin", "capot-full-control", "capot-partner-supported", "pass-ceiling-too-low",
      "pass-contract-blocked"] as const) {
      const explanation = explainBiddingTrace({ ...base.trace, reasonCode });
      expect(explanation.length).toBeGreaterThan(40);
      expect(explanation).not.toMatch(/intrinsicHandStrength|estimateDefensiveTricks|autonomyScore|reasonCode|4\.65|3\.95|3\.10/);
    }
  });

  it("preserves old axes and resets only bidding when its local doctrine version changes", () => {
    const previous = emptyTrainingProgress();
    previous.axes["trick-value"].levels[1].bestScore = 9;
    const oldStorage = JSON.stringify({ ...previous, axes: { ...previous.axes, bidding: undefined } });
    expect(parseTrainingProgress(oldStorage).axes["trick-value"].levels[1].bestScore).toBe(9);
    expect(parseTrainingProgress(oldStorage).axes.bidding).toEqual(emptyTrainingProgress().axes.bidding);
    const recorded = recordBiddingSeries(previous, 1, 8);
    expect(parseTrainingProgress(JSON.stringify(recorded)).axes.bidding).toEqual(recorded.axes.bidding);
    const changed = parseTrainingProgress(JSON.stringify({ ...recorded, axes: {
      ...recorded.axes, bidding: { ...recorded.axes.bidding, axisVersion: 99 },
    } }));
    expect(changed.axes.bidding).toEqual(emptyTrainingProgress().axes.bidding);
    expect(changed.axes["trick-value"].levels[1].bestScore).toBe(9);
    expect(TRAINING_PROGRESS_KEY).toBe("coinche:training-progress:v1");
  });

  it("unlocks at 8/10, retains records and counts series through level four", () => {
    const empty = emptyTrainingProgress();
    expect(isBiddingLevelUnlocked(empty, 1)).toBe(true);
    expect(isBiddingLevelUnlocked(empty, 2)).toBe(false);
    expect(recordBiddingSeries(empty, 1, 7).axes.bidding.unlockedLevel).toBe(1);
    let progress = recordBiddingSeries(empty, 1, 8);
    expect(progress.axes.bidding.unlockedLevel).toBe(2);
    const firstSeed = biddingSeriesSeed(progress, 1);
    progress = recordBiddingSeries(progress, 1, 5);
    expect(progress.axes.bidding.levels[1]).toEqual({ bestScore: 8, completedSeries: 2 });
    expect(biddingSeriesSeed(progress, 1)).toBe(firstSeed + 10_000);
    progress = recordBiddingSeries(progress, 2, 8);
    progress = recordBiddingSeries(progress, 3, 8);
    progress = recordBiddingSeries(progress, 4, 10);
    expect(progress.axes.bidding.unlockedLevel).toBe(4);
    expect(progress.axes.bidding.levels[4]).toEqual({ bestScore: 10, completedSeries: 1 });
    expect(() => recordBiddingSeries(empty, 2, 10)).toThrow();
    expect(() => recordBiddingSeries(empty, 1, 11)).toThrow();
  });
});
