import { describe, expect, it } from "vitest";
import { createInitialGame, makeBid, playCard, playableCardsForCurrentPlayer } from "@/engine/game";
import { createTrainingAxisRegistry } from "@/engine/training/registry";
import { createTrickValueExercise } from "@/engine/training/trickValue";
import { trickValueInGame } from "@/engine/training/inGame";
import { detectInGameBoundary, emptyInGameSchedulerState, inGameQuestionSeed, scheduleInGameQuestion,
  type InGameBoundary, type InGameConfiguration } from "@/lib/training/inGameScheduler";

function states() {
  let state = createInitialGame(() => 0.1);
  state = makeBid(state, 0, { action: "bid", value: 80, trump: "clubs" });
  for (let index = 0; index < 3; index += 1) state = makeBid(state, state.currentPlayerId, { action: "pass" });
  const firstTrickStart = state;
  while (state.completedTricks.length < 3) state = playCard(state, state.currentPlayerId, playableCardsForCurrentPlayer(state)[0]);
  return { firstTrickStart, state };
}

function boundary(key = "round:1:after-trick:3", roundNumber = 1): InGameBoundary {
  return { key, roundNumber, trickIndex: 3, moments: ["trick-end", "trick-start"], state: states().state };
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
    const onlyRecall = scheduleInGameQuestion(emptyInGameSchedulerState(), boundary(), { ...both,
      axes: both.axes.map((choice) => choice.id === "trick-value" ? { ...choice, enabled: false } : choice) }, 7);
    expect(onlyRecall.question?.axisId).toBe("trick-recall");
  });

  it("filters by moment and pure applicability", () => {
    const start = { ...boundary(), moments: ["trick-start"] as const };
    expect(scheduleInGameQuestion(emptyInGameSchedulerState(), start, both, 7).question).toBeNull();
    const registry = createTrainingAxisRegistry([{ id: "trick-value", label: "Test",
      createExercise: createTrickValueExercise,
      inGame: { ...trickValueInGame, isApplicable: () => false } }]);
    expect(scheduleInGameQuestion(emptyInGameSchedulerState(), boundary(), { ...both, axes: [both.axes[0]] }, 7, registry).question).toBeNull();
  });

  it("asks at most once per boundary, even if the same key is observed again", () => {
    const first = scheduleInGameQuestion(emptyInGameSchedulerState(), boundary(), both, 7);
    expect(first.question).not.toBeNull();
    const repeated = scheduleInGameQuestion(first.state, boundary(), both, 7);
    expect(repeated.question).toBeNull();
    expect(repeated.state).toBe(first.state);
  });

  it("alternates fairly and deterministically between eligible axes", () => {
    let scheduler = emptyInGameSchedulerState();
    const asked: string[] = [];
    for (let index = 0; index < 3; index += 1) {
      const next = scheduleInGameQuestion(scheduler, boundary(`round:1:after-trick:${index + 1}`), both, 7);
      scheduler = next.state;
      asked.push(next.question!.axisId);
    }
    expect(asked).toEqual(["trick-value", "trick-recall", "trick-value"]);
    expect(scheduler.countsByAxis).toMatchObject({ "trick-value": 2, "trick-recall": 1 });
  });

  it.each([1, 2, 3] as const)("respects a %i-question budget and the hard maximum of three", (budget) => {
    let scheduler = emptyInGameSchedulerState();
    let questions = 0;
    for (let index = 0; index < 6; index += 1) {
      const next = scheduleInGameQuestion(scheduler, boundary(`round:1:after-trick:${index + 1}`), { ...both, budgetPerRound: budget }, 7);
      scheduler = next.state;
      questions += Number(next.question !== null);
    }
    expect(questions).toBe(budget);
    expect(scheduler.askedThisRound).toBe(budget);
  });

  it("allows round-end outside the budget and resets the budget in a new round", () => {
    const registry = createTrainingAxisRegistry([{ id: "trick-value", label: "Test",
      createExercise: createTrickValueExercise,
      inGame: { ...trickValueInGame, moments: ["trick-end", "round-end"], isApplicable: () => true } }]);
    const config = { budgetPerRound: 1 as const, axes: [both.axes[0]] };
    const first = scheduleInGameQuestion(emptyInGameSchedulerState(), boundary("first"), config, 7, registry);
    const normal = scheduleInGameQuestion(first.state, boundary("second"), config, 7, registry);
    expect(normal.question).toBeNull();
    const roundEnd = scheduleInGameQuestion(normal.state, { ...boundary("last"), moments: ["round-end"] }, config, 7, registry);
    expect(roundEnd.question?.moment).toBe("round-end");
    expect(roundEnd.state.askedThisRound).toBe(1);
    const newRound = scheduleInGameQuestion(roundEnd.state, boundary("round-two", 2), config, 7, registry);
    expect(newRound.question).not.toBeNull();
    expect(newRound.state.askedThisRound).toBe(1);
  });

  it("derives a stable seed from the session, boundary, axis and question index", () => {
    const event = boundary();
    const seed = inGameQuestionSeed(123, event, "trick-value", 2);
    expect(inGameQuestionSeed(123, event, "trick-value", 2)).toBe(seed);
    expect(inGameQuestionSeed(123, event, "trick-recall", 2)).not.toBe(seed);
    expect(inGameQuestionSeed(123, event, "trick-value", 3)).not.toBe(seed);
  });
});
