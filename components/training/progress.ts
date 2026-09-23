export const TRAINING_PROGRESS_KEY = "coinche:training-progress:v1";
export const PASSING_SCORE = 8;

export type TrainingProgress = {
  version: 1;
  axes: {
    "trick-value": {
      bestScore: number;
      completedSeries: number;
      unlockedLevel: 1 | 2;
    };
  };
};

type StorageReader = Pick<Storage, "getItem">;
type StorageWriter = Pick<Storage, "setItem">;

export function emptyTrainingProgress(): TrainingProgress {
  return { version: 1, axes: { "trick-value": { bestScore: 0, completedSeries: 0, unlockedLevel: 1 } } };
}

function storageOrNull(): Storage | null {
  if (typeof window === "undefined") return null;
  try { return window.localStorage; } catch { return null; }
}

export function parseTrainingProgress(raw: string | null): TrainingProgress {
  if (!raw) return emptyTrainingProgress();
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || (parsed as { version?: unknown }).version !== 1) {
      return emptyTrainingProgress();
    }
    const value = (parsed as { axes?: { "trick-value"?: Record<string, unknown> } }).axes?.["trick-value"];
    const defaults = emptyTrainingProgress();
    if (!value) return defaults;
    const bestScore = Number.isInteger(value.bestScore) && Number(value.bestScore) >= 0 && Number(value.bestScore) <= 10
      ? Number(value.bestScore) : 0;
    const completedSeries = Number.isSafeInteger(value.completedSeries) && Number(value.completedSeries) >= 0
      ? Number(value.completedSeries) : 0;
    const unlockedLevel = value.unlockedLevel === 2 || bestScore >= PASSING_SCORE ? 2 : 1;
    return { version: 1, axes: { "trick-value": { bestScore, completedSeries, unlockedLevel } } };
  } catch {
    return emptyTrainingProgress();
  }
}

export function readTrainingProgress(storage: StorageReader | null = storageOrNull()): TrainingProgress {
  try { return parseTrainingProgress(storage?.getItem(TRAINING_PROGRESS_KEY) ?? null); }
  catch { return emptyTrainingProgress(); }
}

export function saveTrainingProgress(progress: TrainingProgress, storage: StorageWriter | null = storageOrNull()): void {
  try { storage?.setItem(TRAINING_PROGRESS_KEY, JSON.stringify(progress)); } catch { /* Browser storage may be unavailable. */ }
}

export function recordTrickValueSeries(progress: TrainingProgress, score: number): TrainingProgress {
  if (!Number.isInteger(score) || score < 0 || score > 10) throw new Error("Invalid training score.");
  const previous = progress.axes["trick-value"];
  return {
    version: 1,
    axes: {
      "trick-value": {
        bestScore: Math.max(previous.bestScore, score),
        completedSeries: previous.completedSeries + 1,
        unlockedLevel: score >= PASSING_SCORE || previous.unlockedLevel === 2 ? 2 : 1,
      },
    },
  };
}

export function trickValueSeriesSeed(level: 1 | 2, completedSeries: number): number {
  return 380000 + level * 100000 + completedSeries * 10;
}
