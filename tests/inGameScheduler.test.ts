import { describe, expect, it } from "vitest";
import { createInitialGame, makeBid, playCard, playableCardsForCurrentPlayer } from "@/engine/game";
import { createTrainingAxisRegistry } from "@/engine/training/registry";
import { createTrickValueExercise } from "@/engine/training/trickValue";
import { trickValueInGame } from "@/engine/training/inGame";
import { detectInGameBoundary, emptyInGameSchedulerState, inGameQuestionSeed, plannedQuestionTricks, scheduleInGameQuestion,
  type InGameBoundary, type InGameConfiguration } from "@/lib/training/inGameScheduler";

function states() {
  let state = createInitialGame(() => 0.1);
  state = makeBid(state, 0, { action: "bid", value: 80, trump: "clubs" });
  for (let index = 0; index < 3; index += 1) state = makeBid(state, state.currentPlayerId, { action: "pass" });
  const firstTrickStart = state;
  while (state.completedTricks.length < 3) state = playCard(state, state.currentPlayerId, playableCardsForCurrentPlayer(state)[0]);
  return { firstTrickStart, state };
}

function boundary(key = "round:1:after-trick:3", roundNumber = 1, trickIndex = 3): InGameBoundary {
  return { key, roundNumber, trickIndex, moments: ["trick-end", "trick-start"], state: states().state };
}

const both: InGameConfiguration = { budgetPerRound: 3, axes: [
  { id: "trick-value", enabled: true, level: 1 },
  { id: "trick-recall", enabled: true, level: 1 },
] };

describe("in-game scheduler", () => {
  it("recognizes one stable window for trick end and next trick start", () => {
    const { firstTrickStart, state } = states();
    expect(detectInGameBoundary({ ...firstTrickStart, phase: "bidding" }, firstTrickStart)?.moments).toEqual(["trick-start"]);
    const previous = { ...state, completedTricks: state.completedTricks.slice(0, -1), currentTrick: { ...state.currentTrick, cards: [state.completedTricks[2].cards[0]] } };
    const detected = detectInGameBoundary(previous, state);
    expect(detected?.moments).toEqual(["trick-end", "trick-start"]);
    expect(detected?.key).toBe("round:1:after-trick:3");
    expect(detectInGameBoundary(state, state)).toBeNull();
  });

  it("asks nothing with no active axes, and never selects a disabled axis", () => {
    const empty = scheduleInGameQuestion(emptyInGameSchedulerState(), boundary(), { budgetPerRound: 3, axes: [] }, 7);
    expect(empty.question).toBeNull();
    const onlyRecall = scheduleInGameQuestion(emptyInGameSchedulerState(), boundary("late", 1, 8), { ...both,
      axes: both.axes.map((choice) => choice.id === "trick-value" ? { ...choice, enabled: false } : choice) }, 7);
    expect(onlyRecall.question?.axisId).toBe("trick-recall");
  });

  it("filters by moment and pure applicability", () => {
    const start = { ...boundary(), moments: ["trick-start"] as const };
    expect(scheduleInGameQuestion(emptyInGameSchedulerState(), { ...start, trickIndex: 8 }, both, 7).question).toBeNull();
    const registry = createTrainingAxisRegistry([{ id: "trick-value", label: "Test",
      createExercise: createTrickValueExercise,
      inGame: { ...trickValueInGame, isApplicable: () => false } }]);
    expect(scheduleInGameQuestion(emptyInGameSchedulerState(), boundary("late", 1, 8), { ...both, axes: [both.axes[0]] }, 7, registry).question).toBeNull();
  });

  it("asks at most once per boundary, even if the same key is observed again", () => {
    const first = scheduleInGameQuestion(emptyInGameSchedulerState(), boundary("late", 1, 8), both, 7);
    expect(first.question).not.toBeNull();
    const repeated = scheduleInGameQuestion(first.state, boundary("late", 1, 8), both, 7);
    expect(repeated.question).toBeNull();
    expect(repeated.state).toBe(first.state);
  });

  it("alternates fairly and deterministically between eligible axes", () => {
    let scheduler = emptyInGameSchedulerState();
    const asked: string[] = [];
    for (const trickIndex of plannedQuestionTricks(7, 1, 3)) {
      const next = scheduleInGameQuestion(scheduler, boundary(`round:1:after-trick:${trickIndex}`, 1, trickIndex), both, 7);
      scheduler = next.state;
      asked.push(next.question!.axisId);
    }
    expect(new Set(asked).size).toBe(2);
    expect(Object.values(scheduler.countsByAxis).sort()).toEqual([1, 2]);
  });

  it.each([1, 2, 3] as const)("respects a %i-question budget and the hard maximum of three", (budget) => {
    let scheduler = emptyInGameSchedulerState();
    let questions = 0;
    for (let trickIndex = 1; trickIndex <= 8; trickIndex += 1) {
      const next = scheduleInGameQuestion(scheduler, boundary(`round:1:after-trick:${trickIndex}`, 1, trickIndex), { ...both, budgetPerRound: budget }, 7);
      scheduler = next.state;
      questions += Number(next.question !== null);
    }
    expect(questions).toBe(budget);
    expect(scheduler.askedThisRound).toBe(budget);
  });

  it("includes round-end in the strict cap and resets only in a new round", () => {
    const registry = createTrainingAxisRegistry([{ id: "trick-value", label: "Test",
      createExercise: createTrickValueExercise,
      inGame: { ...trickValueInGame, moments: ["trick-end", "round-end"], isApplicable: () => true } }]);
    const config = { budgetPerRound: 1 as const, axes: [both.axes[0]] };
    const firstTrick = plannedQuestionTricks(7, 1, 1)[0];
    const first = scheduleInGameQuestion(emptyInGameSchedulerState(), boundary("first", 1, firstTrick), config, 7, registry);
    const normal = scheduleInGameQuestion(first.state, boundary("second", 1, firstTrick + 1), config, 7, registry);
    expect(normal.question).toBeNull();
    const roundEnd = scheduleInGameQuestion(normal.state, { ...boundary("last", 1, 8), moments: ["round-end"] }, config, 7, registry);
    expect(roundEnd.question).toBeNull();
    expect(roundEnd.state.askedThisRound).toBe(1);
    const nextTrick = plannedQuestionTricks(7, 2, 1)[0];
    const newRound = scheduleInGameQuestion(roundEnd.state, boundary("round-two", 2, nextTrick), config, 7, registry);
    expect(newRound.question).not.toBeNull();
    expect(newRound.state.askedThisRound).toBe(1);
  });

  it("spreads questions across the round and varies checkpoints between sessions", () => {
    const schedules = Array.from({ length: 16 }, (_, seed) => plannedQuestionTricks(seed, 1, 3));
    expect(new Set(schedules.map((slots) => slots.join(","))).size).toBeGreaterThan(4);
    for (const slots of schedules) {
      expect(slots[0]).toBeGreaterThanOrEqual(2);
      expect(slots[1] - slots[0]).toBeGreaterThanOrEqual(2);
      expect(slots[2] - slots[1]).toBeGreaterThanOrEqual(2);
      expect(slots[2]).toBeLessThanOrEqual(8);
    }
    let scheduler = emptyInGameSchedulerState();
    const seen: number[] = [];
    for (let trickIndex = 1; trickIndex <= 8; trickIndex += 1) {
      const next = scheduleInGameQuestion(scheduler, boundary(`window:${trickIndex}`, 1, trickIndex), both, 7);
      scheduler = next.state;
      if (next.question) seen.push(trickIndex);
    }
    expect(seen).toEqual(plannedQuestionTricks(7, 1, 3));
  });

  it("varies the first eligible axis between session seeds", () => {
    const selected = Array.from({ length: 32 }, (_, sessionSeed) => scheduleInGameQuestion(
      emptyInGameSchedulerState(), boundary("late", 1, 8), both, sessionSeed).question?.axisId);
    expect(new Set(selected)).toEqual(new Set(["trick-value", "trick-recall"]));
  });

  it("derives a stable seed from the session, boundary, axis and question index", () => {
    const event = boundary();
    const seed = inGameQuestionSeed(123, event, "trick-value", 2);
    expect(inGameQuestionSeed(123, event, "trick-value", 2)).toBe(seed);
    expect(inGameQuestionSeed(123, event, "trick-recall", 2)).not.toBe(seed);
    expect(inGameQuestionSeed(123, event, "trick-value", 3)).not.toBe(seed);
  });
});
