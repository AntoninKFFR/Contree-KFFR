import { describe, expect, it } from "vitest";
import { createInitialGame, makeBid, playCard, playableCardsForCurrentPlayer } from "@/engine/game";
import { createSeededRandom } from "@/engine/random";
import { trainingAxes } from "@/engine/training/axes";
import type { InGameAnswer, InGameAxisId, InGameExercise, TriggerMoment } from "@/engine/training/inGame";
import type { GameState } from "@/engine/types";

function publicPosition(): GameState {
  let state = createInitialGame(() => 0.1);
  state = makeBid(state, 0, { action: "bid", value: 80, trump: "clubs" });
  for (let index = 0; index < 3; index += 1) state = makeBid(state, state.currentPlayerId, { action: "pass" });
  while (state.completedTricks.length < 3) state = playCard(state, state.currentPlayerId, playableCardsForCurrentPlayer(state)[0]);
  return state;
}

function applicablePosition(axisId: InGameAxisId, level: number, moment: TriggerMoment) {
  const capability = trainingAxes.resolve(axisId).inGame!;
  for (let gameSeed = 1; gameSeed <= 40; gameSeed += 1) {
    let state = createInitialGame(createSeededRandom(gameSeed));
    while (state.currentPlayerId !== 0) state = makeBid(state, state.currentPlayerId, { action: "pass" });
    state = makeBid(state, 0, { action: "bid", value: 80, trump: "clubs" });
    for (let index = 0; index < 3; index += 1) state = makeBid(state, state.currentPlayerId, { action: "pass" });
    while (state.phase === "playing") {
      state = playCard(state, state.currentPlayerId, playableCardsForCurrentPlayer(state)[0]);
      if (state.currentTrick.cards.length !== 0) continue;
      for (let seed = 1; seed <= 16; seed += 1) {
        if (capability.isApplicable(state, { viewerId: 0, level, seed, moment })) return { state, seed };
      }
    }
  }
  throw new Error(`No applicable ${axisId} level ${level} position found.`);
}

function correctAnswer(exercise: InGameExercise): InGameAnswer {
  if (exercise.kind === "number") return { kind: "number", value: exercise.data.answer };
  if (exercise.kind === "cards") return { kind: "cards", selectedIds: exercise.data.expectedIds,
    assignments: exercise.data.expectedPlayers };
  if (exercise.kind === "boolean") return { kind: "boolean", value: exercise.data.expectedIds.length > 0 };
  return { kind: "voids", selectedCells: exercise.data.expectedCells,
    trumpCount: exercise.data.expectedTrumpCount };
}

const inGameAxes: InGameAxisId[] = [
  "trick-value", "master-cards", "master-in-hand", "played-cards", "trick-recall", "opponent-voids",
];

describe("in-game question knowledge boundary", () => {
  it.each(inGameAxes)("does not reveal hidden bot hands for %s at any shipped level", (axisId) => {
    const capability = trainingAxes.resolve(axisId).inGame!;
    expect(capability).toBeDefined();
    for (let level = 1; level <= capability.levelCount; level += 1) {
      const moment: TriggerMoment = capability.moments[0];
      const { state, seed } = applicablePosition(axisId, level, moment);
      const hiddenSwap = structuredClone(state);
      [hiddenSwap.hands[1], hiddenSwap.hands[2], hiddenSwap.hands[3]] =
        [state.hands[2], state.hands[3], state.hands[1]];
      const context = { viewerId: 0 as const, level, seed, moment };
      expect(capability.isApplicable(hiddenSwap, context)).toBe(true);
      const original = capability.buildExercise(state, context);
      const swapped = capability.buildExercise(hiddenSwap, context);
      expect(swapped).toEqual(original);
      const answer = correctAnswer(original);
      expect(capability.grade(swapped, answer)).toEqual(capability.grade(original, answer));
      if (axisId === "opponent-voids" && original.kind === "voids") {
        expect(Object.keys(original.data.proofs).every((key) => original.data.expectedCells.includes(key))).toBe(true);
        expect(Object.keys(original.data.proofs).every((key) => original.data.proofs[key].trickNumber <= state.completedTricks.length)).toBe(true);
      }
    }
  });

  it("uses the actual completed trick's engine points and keeps pile-count puzzle only", () => {
    const state = publicPosition();
    const capability = trainingAxes.resolve("trick-value").inGame!;
    const exercise = capability.buildExercise(state, { viewerId: 0, level: 1, seed: 17, moment: "trick-end" });
    expect(exercise.kind).toBe("number");
    if (exercise.kind === "number") expect(exercise.data.answer).toBe(state.completedTricks.at(-1)!.points);
    expect(trainingAxes.resolve("pile-count").inGame).toBeUndefined();
  });

  it("keeps the eighth-trick bonus out of trick-value level 1", () => {
    let state = publicPosition();
    while (state.phase === "playing") state = playCard(state, state.currentPlayerId, playableCardsForCurrentPlayer(state)[0]);
    const capability = trainingAxes.resolve("trick-value").inGame!;
    expect(capability.isApplicable(state, { viewerId: 0, level: 1, seed: 1, moment: "trick-end" })).toBe(false);
    expect(capability.isApplicable(state, { viewerId: 0, level: 2, seed: 1, moment: "trick-end" })).toBe(true);
  });

  it("asks in-game mastery as yes/no and excludes empty or one-choice card selections", () => {
    const first = trainingAxes.resolve("master-in-hand").inGame!;
    const levelOne = applicablePosition("master-in-hand", 1, "trick-start");
    const binary = first.buildExercise(levelOne.state, { viewerId: 0, level: 1, seed: levelOne.seed, moment: "trick-start" });
    expect(binary.kind).toBe("boolean");
    if (binary.kind === "boolean") {
      expect(binary.data.question).toMatch(/^As-tu la maîtrise à /);
      expect(binary.data.candidates.length).toBeGreaterThan(1);
      const correct = binary.data.expectedIds.length > 0;
      expect(first.grade(binary, { kind: "boolean", value: correct }).correct).toBe(true);
      expect(first.grade(binary, { kind: "boolean", value: !correct }).correct).toBe(false);
    }
    const levelTwo = applicablePosition("master-in-hand", 2, "trick-start");
    const advanced = first.buildExercise(levelTwo.state, { viewerId: 0, level: 2, seed: levelTwo.seed, moment: "trick-start" });
    expect(advanced.kind).toBe("cards");
    if (advanced.kind === "cards") {
      expect(advanced.data.candidates.length).toBeGreaterThanOrEqual(3);
      expect(advanced.data.expectedIds.length).toBeGreaterThan(0);
      expect(advanced.data.expectedIds.length).toBeLessThan(advanced.data.candidates.length);
    }
  });

  it("only asks played-card selections with real alternatives", () => {
    const capability = trainingAxes.resolve("played-cards").inGame!;
    const { state, seed } = applicablePosition("played-cards", 1, "trick-start");
    const exercise = capability.buildExercise(state, { viewerId: 0, level: 1, seed, moment: "trick-start" });
    expect(exercise.kind).toBe("cards");
    if (exercise.kind === "cards") {
      expect(exercise.data.candidates.length).toBeGreaterThanOrEqual(4);
      expect(exercise.data.expectedIds.length).toBeGreaterThan(0);
      expect(exercise.data.expectedIds.length).toBeLessThan(exercise.data.candidates.length);
    }
  });

  it("varies the historical trick in in-game recall", () => {
    let state = publicPosition();
    while (state.completedTricks.length < 6) state = playCard(state, state.currentPlayerId, playableCardsForCurrentPlayer(state)[0]);
    const capability = trainingAxes.resolve("trick-recall").inGame!;
    const questions = Array.from({ length: 12 }, (_, index) => capability.buildExercise(state,
      { viewerId: 0, level: 1, seed: index + 1, moment: "trick-end" }));
    const names = questions.map((exercise) => exercise.kind === "cards" ? exercise.data.question : "");
    expect(new Set(names).size).toBeGreaterThan(1);
    expect(names.every((name) => !name.includes("pli n°6"))).toBe(true);
  });

  it("requires prior public play for level-one color proof", () => {
    let state = createInitialGame(() => 0.1);
    state = makeBid(state, 0, { action: "bid", value: 80, trump: "clubs" });
    for (let index = 0; index < 3; index += 1) state = makeBid(state, state.currentPlayerId, { action: "pass" });
    const capability = trainingAxes.resolve("opponent-voids").inGame!;
    const context = { viewerId: 0 as const, level: 1, seed: 1, moment: "trick-start" as const };
    expect(capability.isApplicable(state, context)).toBe(false);
    while (state.completedTricks.length < 1) state = playCard(state, state.currentPlayerId, playableCardsForCurrentPlayer(state)[0]);
    expect(capability.isApplicable(state, context)).toBe(false);
  });
});
