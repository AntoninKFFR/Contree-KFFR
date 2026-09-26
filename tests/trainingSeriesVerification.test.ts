import { beforeAll, describe, expect, it } from "vitest";
import { cardId } from "@/engine/cards";
import { generatorVersion } from "@/engine/training/generator";
import { generateMemorySeries, MEMORY_AXIS_IDS } from "@/engine/training/memory";
import { generateOpponentVoidsSeries } from "@/engine/training/opponentVoids";
import { PERSISTABLE_PUZZLE_AXES, type TrainingSeriesSubmission } from "@/engine/training/seriesContract";
import { verifyTrainingSeriesSubmission } from "@/engine/training/seriesVerification";
import { generateTrickValueSeries } from "@/engine/training/trickValue";
import { getRulesetPreset } from "@/engine/rulesets/presets";

const base: TrainingSeriesSubmission = {
  axisId: "trick-value", axisVersion: 1, level: 1, rulesetId: "contree-kffr",
  rulesetVersion: getRulesetPreset("contree-kffr")!.version,
  generatorVersion, seed: 480_000, answers: [], durationMs: 20_000, timed: true,
};
let valid: TrainingSeriesSubmission;
beforeAll(() => {
  const exercises = generateTrickValueSeries({ seed: base.seed, level: 1, generatorVersion });
  valid = { ...base, answers: exercises.map((exercise) => ({ kind: "number", value: exercise.answer })) };
});

function rejects(value: unknown, code: string) {
  expect(() => verifyTrainingSeriesSubmission(value)).toThrowError(code);
}

describe("verified puzzle series", () => {
  it("replays the same seed and ignores forged client scores", () => {
    expect(verifyTrainingSeriesSubmission(valid).score).toBe(10);
    for (const forgedScore of [0, 10, 999]) {
      const forged = { ...valid, score: forgedScore };
      expect(verifyTrainingSeriesSubmission(forged).score).toBe(10);
      expect(verifyTrainingSeriesSubmission(forged).answers).toEqual(valid.answers);
    }
  });

  it("changes the server score when one raw answer changes", () => {
    const changed = { ...valid, answers: [...valid.answers] };
    changed.answers[0] = { kind: "number", value: 0 };
    if (valid.answers[0].kind === "number" && valid.answers[0].value === 0) changed.answers[0] = { kind: "number", value: 1 };
    expect(verifyTrainingSeriesSubmission(changed).score).toBe(9);
    expect(verifyTrainingSeriesSubmission(valid).score).toBe(10);
  });

  it("rejects wrong answer count and malformed answers before storing anything", () => {
    rejects({ ...valid, answers: valid.answers.slice(0, 9) }, "invalid_answers");
    rejects({ ...valid, answers: [...valid.answers, valid.answers[0]] }, "invalid_answers");
    rejects({ ...valid, answers: [null, ...valid.answers.slice(1)] }, "invalid_answers");
    rejects({ ...valid, answers: [undefined, ...valid.answers.slice(1)] }, "invalid_answers");
    rejects({ ...valid, answers: Array(10) }, "invalid_answers");
    rejects({ ...valid, answers: [{ kind: "number", value: Infinity }, ...valid.answers.slice(1)] }, "invalid_answers");
    rejects({ ...valid, answers: [{ kind: "number", value: NaN }, ...valid.answers.slice(1)] }, "invalid_answers");
    rejects({ ...valid, unexpected: true }, "invalid_body");
  });

  it("validates the current axis, generator and ruleset versions", () => {
    rejects({ ...valid, axisId: "pile-count" }, "invalid_axis");
    rejects({ ...valid, axisVersion: 2 }, "unsupported_axis_version");
    rejects({ ...valid, generatorVersion: 2 }, "unsupported_generator_version");
    rejects({ ...valid, rulesetId: "custom" }, "invalid_ruleset");
    rejects({ ...valid, rulesetVersion: 2 }, "unsupported_ruleset_version");
    rejects({ ...valid, level: 3 }, "invalid_level");
    rejects({ ...valid, seed: -1 }, "invalid_body");
    rejects({ ...valid, seed: Number.MAX_SAFE_INTEGER }, "invalid_body");
    rejects({ ...valid, durationMs: 999 }, "duration_too_short");
    rejects({ ...valid, durationMs: 2_147_483_648 }, "duration_too_short");
  });

  it.each(MEMORY_AXIS_IDS)("replays %s with exact card and player answers", (axisId) => {
    const seed = 1_000_000 + MEMORY_AXIS_IDS.indexOf(axisId) * 1_000_000_000 + 10_000_000;
    const exercises = generateMemorySeries({ axisId, level: 1, seed, generatorVersion });
    const answers = exercises.map((exercise) => ({ kind: "cards" as const,
      selectedIds: [...exercise.expectedIds], assignments: {} }));
    const submission = { ...base, axisId, axisVersion: PERSISTABLE_PUZZLE_AXES[axisId], seed, answers };
    expect(verifyTrainingSeriesSubmission(submission).score).toBe(10);
    const malformed = { ...submission, answers: [...answers] };
    malformed.answers[0] = { kind: "cards", selectedIds: ["fake-card"], assignments: {} };
    rejects(malformed, "invalid_answers");
  });

  it("preserves fractional credit for trick recall with player attribution", () => {
    const axisId = "trick-recall" as const;
    const seed = 1_000_000 + MEMORY_AXIS_IDS.indexOf(axisId) * 1_000_000_000 + 20_000_000;
    const exercises = generateMemorySeries({ axisId, level: 2, seed, generatorVersion });
    const answers = exercises.map((exercise) => ({ kind: "cards" as const, selectedIds: [...exercise.expectedIds],
      assignments: { ...exercise.expectedPlayers } }));
    const wrongCard = exercises[0].candidates.map(cardId).find((id) => !exercises[0].expectedIds.includes(id))!;
    answers[0] = { kind: "cards", selectedIds: [...exercises[0].expectedIds.slice(0, 3), wrongCard],
      assignments: Object.fromEntries(exercises[0].expectedIds.slice(0, 3).map((id) => [id, exercises[0].expectedPlayers[id]])) };
    expect(verifyTrainingSeriesSubmission({ ...base, axisId, level: 2, seed, answers }).score).toBe(9.75);
  });

  it("replays color deductions and rejects malformed cells", () => {
    const axisId = "opponent-voids" as const;
    const seed = 5_010_000_000;
    const exercises = generateOpponentVoidsSeries({ level: 1, seed, generatorVersion });
    const answers = exercises.map((exercise) => ({ kind: "voids" as const,
      selectedCells: [...exercise.expectedCells], trumpCount: null }));
    const submission = { ...base, axisId, seed, answers };
    expect(verifyTrainingSeriesSubmission(submission).score).toBe(10);
    rejects({ ...submission, answers: [{ kind: "voids", selectedCells: ["9:hearts"], trumpCount: null }, ...answers.slice(1)] }, "invalid_answers");
  });
});
