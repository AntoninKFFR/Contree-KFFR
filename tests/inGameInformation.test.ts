import { describe, expect, it } from "vitest";
import { createInitialGame, makeBid, playCard, playableCardsForCurrentPlayer } from "@/engine/game";
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

function correctAnswer(exercise: InGameExercise): InGameAnswer {
  if (exercise.kind === "number") return { kind: "number", value: exercise.data.answer };
  if (exercise.kind === "cards") return { kind: "cards", selectedIds: exercise.data.expectedIds,
    assignments: exercise.data.expectedPlayers };
  return { kind: "voids", selectedCells: exercise.data.expectedCells,
    trumpCount: exercise.data.expectedTrumpCount };
}

const inGameAxes: InGameAxisId[] = [
  "trick-value", "master-cards", "master-in-hand", "played-cards", "trick-recall", "opponent-voids",
];

describe("in-game question knowledge boundary", () => {
  it.each(inGameAxes)("does not reveal hidden bot hands for %s at any shipped level", (axisId) => {
    const state = publicPosition();
    const hiddenSwap = structuredClone(state);
    [hiddenSwap.hands[1], hiddenSwap.hands[2], hiddenSwap.hands[3]] =
      [state.hands[2], state.hands[3], state.hands[1]];
    const capability = trainingAxes.resolve(axisId).inGame!;
    expect(capability).toBeDefined();
    for (let level = 1; level <= capability.levelCount; level += 1) {
      const moment: TriggerMoment = capability.moments[0];
      const seed = Array.from({ length: 40 }, (_, index) => index + 1).find((candidate) =>
        capability.isApplicable(state, { viewerId: 0, level, seed: candidate, moment }));
      expect(seed).toBeDefined();
      const context = { viewerId: 0 as const, level, seed: seed!, moment };
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
});
