import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));

import {
  assertSupportedDuoVersions, duoSeries, gradeDuoAnswer,
} from "@/lib/server/trainingDuoExercise";
import type { TrainingDuoSessionRow } from "@/lib/server/trainingDuoProjection";

const SESSION: TrainingDuoSessionRow = {
  id: "session", code: "ABCDEFGHJK", host_user_id: "host", status: "active", question_phase: "answering",
  level: 1, axis_id: "bid-reading", axis_version: 1,
  doctrine_id: "advanced_rules_v4", doctrine_revision: "4.1", generator_version: 1,
  ruleset_id: "contree-kffr", ruleset_version: 1, series_length: 10,
  current_index: 0, state_version: 3, created_at: "2026-09-27T12:00:00Z",
  updated_at: "2026-09-27T12:00:00Z", started_at: "2026-09-27T12:00:00Z",
  finished_at: null, cancel_reason: null,
};

describe("training duo server exercise", () => {
  it("rebuilds the pinned ten-question series deterministically", () => {
    const first = duoSeries(SESSION, 480_000);
    const second = duoSeries(SESSION, 480_000);
    expect(first).toHaveLength(10);
    expect(first).toEqual(second);
    expect(first[0].doctrineRevision).toBe("4.1");
  });

  it("rejects unsupported pins before generation or grading", () => {
    for (const change of [
      { axis_version: 2 }, { doctrine_revision: "4.2" }, { generator_version: 2 },
      { ruleset_version: 2 }, { series_length: 9 },
    ]) {
      expect(() => assertSupportedDuoVersions({ ...SESSION, ...change })).toThrowError(
        "Cette version de la série n'est plus prise en charge.",
      );
    }
  });

  it("grades the canonical selection on the server and refuses non-choice IDs", () => {
    const exercise = duoSeries(SESSION, 480_000)[0];
    const correct = exercise.assertionChoices.filter((id) => exercise.promise.guaranteed.includes(id));
    const graded = gradeDuoAnswer(exercise, { selectedAssertionIds: [...correct].reverse() });
    expect(graded.answer.selectedAssertionIds).toEqual([...correct].sort());
    expect(graded.score).toBe(1);
    const wrong = exercise.assertionChoices.find((id) => !correct.includes(id));
    if (!wrong) throw new Error("Fixture lacks a distractor");
    expect(gradeDuoAnswer(exercise, { selectedAssertionIds: [wrong] }).score).toBe(0);
    expect(() => gradeDuoAnswer(exercise, { selectedAssertionIds: ["not-a-choice" as typeof wrong] })).toThrow();
    expect(() => gradeDuoAnswer(exercise, { selectedAssertionIds: [wrong, wrong] })).toThrow();
  });
});
