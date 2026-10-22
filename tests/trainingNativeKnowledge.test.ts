import { describe, expect, it } from "vitest";
import { generateTrainingPosition } from "@/engine/training/generator";
import { toPlayerGameView } from "@/engine/views";
import { createMemoryExercise, MEMORY_AXIS_IDS, MEMORY_LEVELS } from "@/engine/training/memory";
import { createOpponentVoidsExercise } from "@/engine/training/opponentVoids";
import { createCompletedTrickValueExercise, createTrickValueExercise } from "@/engine/training/trickValue";
import { emptyInGameSchedulerState, scheduleInGameQuestion } from "@/lib/training/inGameScheduler";
import { defaultInGameConfiguration } from "@/lib/training/inGameConfiguration";
describe("training on public native Solo projections", () => {
  it("matches full-state questions and scheduler without any opponent hand on 200 seeds", () => {
    let checked = 0;
    for (let seed = 0; seed < 200; seed++) {
      const { state } = generateTrainingPosition({ seed, generatorVersion: 1 });
      if (!state.completedTricks.length || state.currentTrick.cards.length) continue;
      const view = toPlayerGameView(state, 0);
      expect(view).not.toHaveProperty("hands");
      expect(createCompletedTrickValueExercise(view, seed, 1)).toEqual(createTrickValueExercise({ state, seed, generatorVersion: 1 }));
      expect(createOpponentVoidsExercise(3, view, seed)).toEqual(createOpponentVoidsExercise(3, state, seed));
      for (const axis of MEMORY_AXIS_IDS) for (let level = 1; level <= MEMORY_LEVELS[axis]; level++) {
        try { const full = createMemoryExercise(axis, level, state, seed); expect(createMemoryExercise(axis, level, view, seed)).toEqual(full); }
        catch (e) { expect(() => createMemoryExercise(axis, level, view, seed)).toThrow((e as Error).message); }
      }
      const boundary = { key: `seed:${seed}`, roundNumber: state.roundNumber, trickIndex: state.completedTricks.length, moments: ["trick-end", "trick-start"] as const };
      const config = defaultInGameConfiguration(); config.axes.forEach((a) => { a.enabled = true; });
      expect(scheduleInGameQuestion(emptyInGameSchedulerState(), { ...boundary, state: view }, config, 153)).toEqual(scheduleInGameQuestion(emptyInGameSchedulerState(), { ...boundary, state }, config, 153));
      checked++;
    }
    expect(checked).toBeGreaterThan(15);
  });
});
