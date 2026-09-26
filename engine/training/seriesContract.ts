import type { MemoryAxisId } from "@/engine/training/memory";
import type { PlayerId } from "@/engine/types";

/** Versions of the puzzle series that this application can replay exactly. */
export const PERSISTABLE_PUZZLE_AXES = {
  "trick-value": 1,
  "master-cards": 1,
  "master-in-hand": 1,
  "played-cards": 1,
  "trick-recall": 1,
  "opponent-voids": 1,
} as const;

export type PersistablePuzzleAxisId = keyof typeof PERSISTABLE_PUZZLE_AXES;
export type SubmittedTrainingAnswer =
  | { kind: "number"; value: number }
  | { kind: "cards"; selectedIds: string[]; assignments: Partial<Record<string, PlayerId>> }
  | { kind: "voids"; selectedCells: string[]; trumpCount: number | null };

export type TrainingSeriesSubmission = {
  axisId: PersistablePuzzleAxisId;
  axisVersion: number;
  level: number;
  rulesetId: "contree-kffr";
  rulesetVersion: number;
  generatorVersion: number;
  seed: number;
  answers: SubmittedTrainingAnswer[];
  durationMs: number;
  timed: boolean;
};

export function isPersistablePuzzleAxisId(value: string): value is PersistablePuzzleAxisId {
  return Object.prototype.hasOwnProperty.call(PERSISTABLE_PUZZLE_AXES, value);
}

export function isPersistableMemoryAxisId(value: PersistablePuzzleAxisId): value is MemoryAxisId {
  return value === "master-cards" || value === "master-in-hand" || value === "played-cards" || value === "trick-recall";
}
