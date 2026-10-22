import type { PersistablePuzzleAxisId } from "@/engine/training/seriesContract";
export type AccountTrainingRecord = {
  axisId: PersistablePuzzleAxisId;
  level: number;
  bestScore: number;
  bestDurationMs: number | null;
};
