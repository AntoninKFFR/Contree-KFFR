import { COUNTING_PASSING_SCORE, COUNTING_SERIES_LENGTH } from "@/engine/training/counting";
import type { TrickValueLevel } from "@/engine/training/trickValue";

export const TRAINING_PROGRESS_KEY = "coinche:training-progress:v1";
export const PASSING_SCORE = 8;

export type LevelProgress = { bestScore: number; completedSeries: number };

export const COUNTING_AXIS_IDS = ["round-count", "running-score"] as const;
export type CountingAxisId = (typeof COUNTING_AXIS_IDS)[number];
export type CountingLevel = 1 | 2 | 3;
export type CountingAxisProgress = {
  unlockedLevel: CountingLevel;
  levels: Record<CountingLevel, LevelProgress>;
};

export type TrainingProgress = {
  version: 1;
  axes: {
    "trick-value": {
      unlockedLevel: TrickValueLevel;
      levels: Record<TrickValueLevel, LevelProgress>;
    };
    "round-count": CountingAxisProgress;
    "running-score": CountingAxisProgress;
  };
};

type StorageReader = Pick<Storage, "getItem">;
type StorageWriter = Pick<Storage, "setItem">;

const COUNTING_SEED_BASE: Record<CountingAxisId, number> = { "round-count": 1_000_000, "running-score": 2_000_000 };
/** Wider than a series and its retries, so two consecutive series never share a round. */
const COUNTING_SEED_STRIDE = 1000;

const emptyLevel = (): LevelProgress => ({ bestScore: 0, completedSeries: 0 });

function emptyCountingAxis(): CountingAxisProgress {
  return { unlockedLevel: 1, levels: { 1: emptyLevel(), 2: emptyLevel(), 3: emptyLevel() } };
}

export function emptyTrainingProgress(): TrainingProgress {
  return {
    version: 1,
    axes: {
      "trick-value": {
        unlockedLevel: 1,
        levels: {
          1: emptyLevel(),
          2: emptyLevel(),
        },
      },
      "round-count": emptyCountingAxis(),
      "running-score": emptyCountingAxis(),
    },
  };
}

function storageOrNull(): Storage | null {
  if (typeof window === "undefined") return null;
  try { return window.localStorage; } catch { return null; }
}

function objectOrNull(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

/** Counting axes score half a point per team on two-team questions. */
function isValidScore(value: unknown, maxScore: number, allowHalves: boolean): boolean {
  return typeof value === "number" && value >= 0 && value <= maxScore
    && (allowHalves ? Number.isInteger(value * 2) : Number.isInteger(value));
}

function readLevel(value: unknown, maxScore = 10, allowHalves = false): LevelProgress {
  const fields = objectOrNull(value);
  const bestScore = fields && isValidScore(fields.bestScore, maxScore, allowHalves) ? Number(fields.bestScore) : 0;
  const completedSeries = fields && Number.isSafeInteger(fields.completedSeries) && Number(fields.completedSeries) >= 0
    ? Number(fields.completedSeries) : 0;
  return { bestScore, completedSeries };
}

function parseTrickValueAxis(value: unknown): TrainingProgress["axes"]["trick-value"] {
  const axis = objectOrNull(value);
  if (!axis) return emptyTrainingProgress().axes["trick-value"];
  const levels = objectOrNull(axis.levels);
  // The first PR stored a single score and series count. Preview users keep that as level 1.
  const level1 = readLevel(levels ? levels["1"] : axis);
  const level2 = readLevel(levels?.["2"]);
  return {
    unlockedLevel: level1.bestScore >= PASSING_SCORE ? 2 : 1,
    levels: { 1: level1, 2: level2 },
  };
}

function countingUnlockedLevel(levels: Record<CountingLevel, LevelProgress>): CountingLevel {
  if (levels[1].bestScore < COUNTING_PASSING_SCORE) return 1;
  return levels[2].bestScore < COUNTING_PASSING_SCORE ? 2 : 3;
}

function parseCountingAxis(value: unknown): CountingAxisProgress {
  const levels = objectOrNull(objectOrNull(value)?.levels);
  const parsed = {
    1: readLevel(levels?.["1"], COUNTING_SERIES_LENGTH, true),
    2: readLevel(levels?.["2"], COUNTING_SERIES_LENGTH, true),
    3: readLevel(levels?.["3"], COUNTING_SERIES_LENGTH, true),
  };
  // Unlocking is always derived from the scores, never trusted from storage.
  return { unlockedLevel: countingUnlockedLevel(parsed), levels: parsed };
}

export function parseTrainingProgress(raw: string | null): TrainingProgress {
  if (!raw) return emptyTrainingProgress();
  try {
    const parsed = objectOrNull(JSON.parse(raw));
    if (parsed?.version !== 1) return emptyTrainingProgress();
    // Each axis is read on its own: a missing or broken axis never erases the others.
    const axes = objectOrNull(parsed.axes);
    return {
      version: 1,
      axes: {
        "trick-value": parseTrickValueAxis(axes?.["trick-value"]),
        "round-count": parseCountingAxis(axes?.["round-count"]),
        "running-score": parseCountingAxis(axes?.["running-score"]),
      },
    };
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

export function parseTrickValueLevel(value: unknown): TrickValueLevel | null {
  if (value === "1") return 1;
  if (value === "2") return 2;
  return null;
}

export function isTrickValueLevelUnlocked(progress: TrainingProgress, level: TrickValueLevel): boolean {
  return level === 1 || progress.axes["trick-value"].unlockedLevel === 2;
}

export function recordTrickValueSeries(progress: TrainingProgress, level: TrickValueLevel, score: number): TrainingProgress {
  if (level !== 1 && level !== 2) throw new Error("Invalid trick-value level.");
  if (!Number.isInteger(score) || score < 0 || score > 10) throw new Error("Invalid training score.");
  const previous = progress.axes["trick-value"];
  const current = previous.levels[level];
  const updated = { bestScore: Math.max(current.bestScore, score), completedSeries: current.completedSeries + 1 };
  const levels = { ...previous.levels, [level]: updated };
  return {
    version: 1,
    axes: {
      ...progress.axes,
      "trick-value": {
        unlockedLevel: levels[1].bestScore >= PASSING_SCORE ? 2 : 1,
        levels,
      },
    },
  };
}

export function trickValueSeriesSeed(progress: TrainingProgress, level: TrickValueLevel): number {
  if (level !== 1 && level !== 2) throw new Error("Invalid trick-value level.");
  return 380000 + level * 100000 + progress.axes["trick-value"].levels[level].completedSeries * 10;
}

export function isCountingAxisId(value: string): value is CountingAxisId {
  return (COUNTING_AXIS_IDS as readonly string[]).includes(value);
}

export function parseCountingLevel(value: unknown): CountingLevel | null {
  if (value === "1") return 1;
  if (value === "2") return 2;
  if (value === "3") return 3;
  return null;
}

export function isCountingLevelUnlocked(progress: TrainingProgress, axisId: CountingAxisId, level: CountingLevel): boolean {
  return level <= progress.axes[axisId].unlockedLevel;
}

export function recordCountingSeries(
  progress: TrainingProgress,
  axisId: CountingAxisId,
  level: CountingLevel,
  score: number,
): TrainingProgress {
  if (!isCountingAxisId(axisId)) throw new Error("Invalid counting axis.");
  if (level !== 1 && level !== 2 && level !== 3) throw new Error("Invalid counting level.");
  if (!isValidScore(score, COUNTING_SERIES_LENGTH, true)) throw new Error("Invalid training score.");
  const previous = progress.axes[axisId];
  const current = previous.levels[level];
  const levels = {
    ...previous.levels,
    [level]: { bestScore: Math.max(current.bestScore, score), completedSeries: current.completedSeries + 1 },
  };
  return {
    version: 1,
    axes: { ...progress.axes, [axisId]: { unlockedLevel: countingUnlockedLevel(levels), levels } },
  };
}

export function countingSeriesSeed(progress: TrainingProgress, axisId: CountingAxisId, level: CountingLevel): number {
  if (!isCountingAxisId(axisId)) throw new Error("Invalid counting axis.");
  if (level !== 1 && level !== 2 && level !== 3) throw new Error("Invalid counting level.");
  return COUNTING_SEED_BASE[axisId] + level * 100_000 + progress.axes[axisId].levels[level].completedSeries * COUNTING_SEED_STRIDE;
}
