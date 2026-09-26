import { cardId } from "@/engine/cards";
import { generatorVersion } from "@/engine/training/generator";
import { generateMemorySeries, gradeMemoryExercise, MEMORY_LEVELS } from "@/engine/training/memory";
import { generateOpponentVoidsSeries, gradeOpponentVoidsExercise, voidCellId } from "@/engine/training/opponentVoids";
import {
  isPersistableMemoryAxisId, isPersistablePuzzleAxisId, PERSISTABLE_PUZZLE_AXES,
  type SubmittedTrainingAnswer, type TrainingSeriesSubmission,
} from "@/engine/training/seriesContract";
import { generateTrickValueSeries } from "@/engine/training/trickValue";
import { getRulesetPreset } from "@/engine/rulesets/presets";

export class TrainingVerificationError extends Error {
  constructor(readonly code: string) { super(code); }
}

export type VerifiedTrainingSeries = TrainingSeriesSubmission & { questionCount: number; score: number };

const MIN_DURATION_MS = { "trick-value": 1_000, "master-cards": 2_000, "master-in-hand": 2_000,
  "played-cards": 2_000, "trick-recall": 2_000, "opponent-voids": 2_000 } as const;
export const MIN_TRAINING_SERIES_DURATION_MS = MIN_DURATION_MS;
const MAX_DURATION_MS = 2_147_483_647;
const MAX_SEED = 1_000_000_000_000;
const ALLOWED_FIELDS = new Set(["axisId", "axisVersion", "level", "rulesetId", "rulesetVersion",
  "generatorVersion", "seed", "answers", "durationMs", "timed", "score"]);

function invalid(code: string): never { throw new TrainingVerificationError(code); }
function object(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}
function keysAre(value: Record<string, unknown>, allowed: readonly string[]): boolean {
  return Object.keys(value).every((key) => allowed.includes(key));
}
function boundedStrings(value: unknown, maxItems: number): value is string[] {
  return Array.isArray(value) && value.length <= maxItems
    && value.every((item) => typeof item === "string" && item.length > 0 && item.length <= 24)
    && new Set(value).size === value.length;
}

function parseNumberAnswer(raw: unknown): Extract<SubmittedTrainingAnswer, { kind: "number" }> {
  const item = object(raw);
  if (!item || !keysAre(item, ["kind", "value"]) || item.kind !== "number"
    || !Number.isInteger(item.value) || Number(item.value) < 0 || Number(item.value) > 300) invalid("invalid_answers");
  return { kind: "number", value: Number(item.value) };
}

function parseCardsAnswer(raw: unknown, candidates: ReadonlySet<string>, maxSelections: number | undefined,
  requiresPlayers: boolean, recall: boolean): Extract<SubmittedTrainingAnswer, { kind: "cards" }> {
  const item = object(raw);
  if (!item || !keysAre(item, ["kind", "selectedIds", "assignments"]) || item.kind !== "cards"
    || !boundedStrings(item.selectedIds, 32) || item.selectedIds.some((id) => !candidates.has(id))
    || (maxSelections !== undefined && item.selectedIds.length > maxSelections)
    || (recall && item.selectedIds.length !== 4)) invalid("invalid_answers");
  const selectedIds = item.selectedIds;
  const assignments = object(item.assignments);
  if (!assignments || Object.keys(assignments).length > 4 || (!requiresPlayers && Object.keys(assignments).length > 0)
    || Object.entries(assignments).some(([id, player]) => !selectedIds.includes(id)
      || !Number.isInteger(player) || Number(player) < 0 || Number(player) > 3)) invalid("invalid_answers");
  return { kind: "cards", selectedIds: [...selectedIds], assignments: assignments as Extract<SubmittedTrainingAnswer, { kind: "cards" }>["assignments"] };
}

function parseVoidsAnswer(raw: unknown, allowed: ReadonlySet<string>, level: number): Extract<SubmittedTrainingAnswer, { kind: "voids" }> {
  const item = object(raw);
  if (!item || !keysAre(item, ["kind", "selectedCells", "trumpCount"]) || item.kind !== "voids"
    || !boundedStrings(item.selectedCells, 12) || item.selectedCells.some((key) => !allowed.has(key))
    || (level === 3 ? !Number.isInteger(item.trumpCount) || Number(item.trumpCount) < 0 || Number(item.trumpCount) > 8
      : item.trumpCount !== null)) invalid("invalid_answers");
  return { kind: "voids", selectedCells: [...item.selectedCells], trumpCount: level === 3 ? Number(item.trumpCount) : null };
}

export function verifyTrainingSeriesSubmission(raw: unknown): VerifiedTrainingSeries {
  const input = object(raw);
  if (!input || !keysAre(input, [...ALLOWED_FIELDS])) invalid("invalid_body");
  if (typeof input.axisId !== "string" || !isPersistablePuzzleAxisId(input.axisId)) invalid("invalid_axis");
  const axisId = input.axisId;
  if (input.axisVersion !== PERSISTABLE_PUZZLE_AXES[axisId]) invalid("unsupported_axis_version");
  const maxLevel = axisId === "trick-value" ? 2 : axisId === "opponent-voids" ? 3 : MEMORY_LEVELS[axisId];
  if (!Number.isInteger(input.level) || Number(input.level) < 1 || Number(input.level) > maxLevel) invalid("invalid_level");
  if (input.rulesetId !== "contree-kffr") invalid("invalid_ruleset");
  const ruleset = getRulesetPreset("contree-kffr");
  if (!ruleset || input.rulesetVersion !== ruleset.version) invalid("unsupported_ruleset_version");
  if (input.generatorVersion !== generatorVersion) invalid("unsupported_generator_version");
  if (!Number.isSafeInteger(input.seed) || Number(input.seed) < 0 || Number(input.seed) > MAX_SEED) invalid("invalid_body");
  if (!Number.isInteger(input.durationMs) || Number(input.durationMs) < MIN_DURATION_MS[axisId]
    || Number(input.durationMs) > MAX_DURATION_MS) invalid("duration_too_short");
  if (typeof input.timed !== "boolean") invalid("invalid_body");
  if (!Array.isArray(input.answers) || input.answers.length !== 10) invalid("invalid_answers");

  const level = Number(input.level);
  const seed = Number(input.seed);
  const answers: SubmittedTrainingAnswer[] = [];
  let score = 0;
  if (axisId === "trick-value") {
    const exercises = generateTrickValueSeries({ level: level as 1 | 2, seed, generatorVersion });
    for (let index = 0; index < exercises.length; index += 1) {
      const answer = parseNumberAnswer(input.answers[index]);
      answers.push(answer);
      score += Number(answer.value === exercises[index].answer);
    }
  } else if (isPersistableMemoryAxisId(axisId)) {
    const exercises = generateMemorySeries({ axisId, level, seed, generatorVersion });
    for (let index = 0; index < exercises.length; index += 1) {
      const exercise = exercises[index];
      const answer = parseCardsAnswer(input.answers[index], new Set(exercise.candidates.map(cardId)),
        exercise.maxSelections, exercise.requiresPlayers, axisId === "trick-recall");
      answers.push(answer);
      score += gradeMemoryExercise(exercise, answer.selectedIds, answer.assignments).score;
    }
  } else {
    const exercises = generateOpponentVoidsSeries({ level, seed, generatorVersion });
    for (let index = 0; index < exercises.length; index += 1) {
      const exercise = exercises[index];
      const allowed = new Set(exercise.players.flatMap((player) => exercise.suits.map((suit) => voidCellId(player, suit))));
      const answer = parseVoidsAnswer(input.answers[index], allowed, level);
      answers.push(answer);
      score += gradeOpponentVoidsExercise(exercise, answer.selectedCells, answer.trumpCount).score;
    }
  }
  return { axisId, axisVersion: PERSISTABLE_PUZZLE_AXES[axisId], level,
    rulesetId: "contree-kffr", rulesetVersion: ruleset.version, generatorVersion, seed,
    answers, durationMs: Number(input.durationMs), timed: input.timed,
    questionCount: answers.length, score };
}
