import { parsePileCountMode, PILE_COUNT_SEED_STRIDE, PILE_COUNT_SERIES_LENGTH, type PileCountMode } from "@/engine/training/pileCount";
import type { TrickValueLevel } from "@/engine/training/trickValue";
import { challengeRunSeed, type ChallengeState, type TrickValueChallengeMode } from "@/engine/training/trickValueChallenge";
import { MEMORY_AXIS_IDS, MEMORY_LEVELS, type MemoryAxisId } from "@/engine/training/memory";

export const TRAINING_PROGRESS_KEY = "coinche:training-progress:v1";
export const PASSING_SCORE = 8;

export type LevelProgress = { bestScore: number; completedSeries: number };
export type ChallengeProgress = { bestScore: number; bestStreak: number; completedRuns: number };
/** Beginner and Normal keep a best score; Free is a sandbox without record; Manual keeps the best 10/10 time. */
export type PileCountProgress = {
  modes: {
    beginner: LevelProgress;
    normal: LevelProgress;
    free: { completedSeries: number };
    manual: { completedSeries: number; bestTimeMs: number | null };
  };
};
export type MemoryAxisProgress = { unlockedLevel: number; levels: Record<number, LevelProgress> };
export type TrainingProgress = {
  version: 1;
  axes: Record<MemoryAxisId, MemoryAxisProgress> & {
    "trick-value": {
      unlockedLevel: TrickValueLevel;
      levels: Record<TrickValueLevel, LevelProgress>;
      challenges: Record<TrickValueChallengeMode, ChallengeProgress>;
    };
    "pile-count": PileCountProgress;
  };
};

const PILE_COUNT_SEED_BASE: Record<PileCountMode, number> = {
  beginner: 3_000_000, normal: 3_200_000, free: 3_400_000, manual: 3_600_000,
};

function emptyPileCountProgress(): PileCountProgress {
  return {
    modes: {
      beginner: { bestScore: 0, completedSeries: 0 },
      normal: { bestScore: 0, completedSeries: 0 },
      free: { completedSeries: 0 },
      manual: { completedSeries: 0, bestTimeMs: null },
    },
  };
}

type StorageReader = Pick<Storage, "getItem">;
type StorageWriter = Pick<Storage, "setItem">;

export function emptyTrainingProgress(): TrainingProgress {
  const memoryAxes = Object.fromEntries(MEMORY_AXIS_IDS.map((id) => [id, {
    unlockedLevel: 1,
    levels: Object.fromEntries(Array.from({ length: MEMORY_LEVELS[id] }, (_, index) => [index + 1, { bestScore: 0, completedSeries: 0 }])),
  }])) as Record<MemoryAxisId, MemoryAxisProgress>;
  return {
    version: 1,
    axes: {
      ...memoryAxes,
      "trick-value": {
        unlockedLevel: 1,
        levels: {
          1: { bestScore: 0, completedSeries: 0 },
          2: { bestScore: 0, completedSeries: 0 },
        },
        challenges: {
          survival: { bestScore: 0, bestStreak: 0, completedRuns: 0 },
          blitz: { bestScore: 0, bestStreak: 0, completedRuns: 0 },
        },
      },
      "pile-count": emptyPileCountProgress(),
    },
  };
}

function readMemoryLevel(value: unknown): LevelProgress {
  const fields = objectOrNull(value);
  const score = fields?.bestScore;
  return {
    bestScore: typeof score === "number" && Number.isFinite(score) && score >= 0 && score <= 10 ? score : 0,
    completedSeries: readNonnegativeInteger(fields?.completedSeries),
  };
}

function readMemoryAxes(axes: Record<string, unknown> | null): Record<MemoryAxisId, MemoryAxisProgress> {
  return Object.fromEntries(MEMORY_AXIS_IDS.map((id) => {
    const stored = objectOrNull(axes?.[id]);
    const storedLevels = objectOrNull(stored?.levels);
    const levels = Object.fromEntries(Array.from({ length: MEMORY_LEVELS[id] }, (_, index) => [
      index + 1, readMemoryLevel(storedLevels?.[String(index + 1)]),
    ])) as Record<number, LevelProgress>;
    let earnedLevel = 1;
    while (earnedLevel < MEMORY_LEVELS[id] && levels[earnedLevel].bestScore >= PASSING_SCORE) earnedLevel += 1;
    const savedLevel = typeof stored?.unlockedLevel === "number" && Number.isInteger(stored.unlockedLevel)
      ? Math.min(MEMORY_LEVELS[id], Math.max(1, stored.unlockedLevel)) : 1;
    return [id, { unlockedLevel: Math.max(earnedLevel, savedLevel), levels }];
  })) as Record<MemoryAxisId, MemoryAxisProgress>;
}

function storageOrNull(): Storage | null {
  if (typeof window === "undefined") return null;
  try { return window.localStorage; } catch { return null; }
}

function objectOrNull(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function readLevel(value: unknown): LevelProgress {
  const fields = objectOrNull(value);
  const bestScore = fields && Number.isInteger(fields.bestScore) && Number(fields.bestScore) >= 0 && Number(fields.bestScore) <= 10
    ? Number(fields.bestScore) : 0;
  const completedSeries = fields && Number.isSafeInteger(fields.completedSeries) && Number(fields.completedSeries) >= 0
    ? Number(fields.completedSeries) : 0;
  return { bestScore, completedSeries };
}

function readNonnegativeInteger(value: unknown): number {
  return Number.isSafeInteger(value) && Number(value) >= 0 ? Number(value) : 0;
}

function readChallenge(value: unknown): ChallengeProgress {
  const fields = objectOrNull(value);
  return {
    bestScore: readNonnegativeInteger(fields?.bestScore),
    bestStreak: readNonnegativeInteger(fields?.bestStreak),
    completedRuns: readNonnegativeInteger(fields?.completedRuns),
  };
}

function parseTrickValueAxis(value: unknown): TrainingProgress["axes"]["trick-value"] {
  const axis = objectOrNull(value);
  if (!axis) return emptyTrainingProgress().axes["trick-value"];
  const levels = objectOrNull(axis.levels);
  // The first PR stored a single score and series count. Preview users keep that as level 1.
  const level1 = readLevel(levels ? levels["1"] : axis);
  const level2 = readLevel(levels?.["2"]);
  const challenges = objectOrNull(axis.challenges);
  return {
    unlockedLevel: level1.bestScore >= PASSING_SCORE ? 2 : 1,
    levels: { 1: level1, 2: level2 },
    challenges: { survival: readChallenge(challenges?.survival), blitz: readChallenge(challenges?.blitz) },
  };
}

function parsePileCountAxis(value: unknown): PileCountProgress {
  const modes = objectOrNull(objectOrNull(value)?.modes);
  const manual = objectOrNull(modes?.manual);
  const bestTimeMs = readNonnegativeInteger(manual?.bestTimeMs);
  return {
    modes: {
      beginner: readLevel(modes?.beginner),
      normal: readLevel(modes?.normal),
      free: { completedSeries: readNonnegativeInteger(objectOrNull(modes?.free)?.completedSeries) },
      manual: { completedSeries: readNonnegativeInteger(manual?.completedSeries), bestTimeMs: bestTimeMs > 0 ? bestTimeMs : null },
    },
  };
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
        ...readMemoryAxes(axes),
        "trick-value": parseTrickValueAxis(axes?.["trick-value"]),
        "pile-count": parsePileCountAxis(axes?.["pile-count"]),
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

export function isTrickValueChallengeUnlocked(progress: TrainingProgress): boolean {
  return progress.axes["trick-value"].levels[2].bestScore >= PASSING_SCORE;
}

export function trainingChallengeRunSeed(progress: TrainingProgress, mode: TrickValueChallengeMode): number {
  return challengeRunSeed(mode, progress.axes["trick-value"].challenges[mode].completedRuns);
}

export function recordTrickValueChallengeRun(progress: TrainingProgress, run: ChallengeState): TrainingProgress {
  if (!run.finished || !Number.isSafeInteger(run.correctAnswers) || run.correctAnswers < 0) {
    throw new Error("Only a finished challenge run can be recorded.");
  }
  const axis = progress.axes["trick-value"];
  const previous = axis.challenges[run.mode];
  const updated: ChallengeProgress = {
    bestScore: Math.max(previous.bestScore, run.correctAnswers),
    bestStreak: run.mode === "blitz" ? Math.max(previous.bestStreak, run.bestStreak) : 0,
    completedRuns: previous.completedRuns + 1,
  };
  return {
    version: 1,
    axes: { ...progress.axes, "trick-value": { ...axis, challenges: { ...axis.challenges, [run.mode]: updated } } },
  };
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
        challenges: previous.challenges,
      },
    },
  };
}

export function isMemoryLevelUnlocked(progress: TrainingProgress, axisId: MemoryAxisId, level: number): boolean {
  return Number.isInteger(level) && level >= 1 && level <= progress.axes[axisId].unlockedLevel;
}

export function recordMemorySeries(progress: TrainingProgress, axisId: MemoryAxisId, level: number, score: number): TrainingProgress {
  if (!isMemoryLevelUnlocked(progress, axisId, level) || !Number.isFinite(score) || score < 0 || score > 10) {
    throw new Error("Invalid memory series result.");
  }
  const previous = progress.axes[axisId];
  const oldLevel = previous.levels[level];
  const bestScore = Math.max(oldLevel.bestScore, score);
  const levels = { ...previous.levels, [level]: { bestScore, completedSeries: oldLevel.completedSeries + 1 } };
  const unlockedLevel = bestScore >= PASSING_SCORE ? Math.min(MEMORY_LEVELS[axisId], Math.max(previous.unlockedLevel, level + 1)) : previous.unlockedLevel;
  return { ...progress, axes: { ...progress.axes, [axisId]: { unlockedLevel, levels } } };
}

export function memorySeriesSeed(progress: TrainingProgress, axisId: MemoryAxisId, level: number): number {
  if (!isMemoryLevelUnlocked(progress, axisId, level)) throw new Error("Memory level is locked.");
  const lane = MEMORY_AXIS_IDS.indexOf(axisId);
  return 1_000_000 + lane * 1_000_000_000 + level * 10_000_000 + progress.axes[axisId].levels[level].completedSeries * 1_000;
}

export function trickValueSeriesSeed(progress: TrainingProgress, level: TrickValueLevel): number {
  if (level !== 1 && level !== 2) throw new Error("Invalid trick-value level.");
  return 380000 + level * 100000 + progress.axes["trick-value"].levels[level].completedSeries * 10;
}

export function isPileCountModeUnlocked(progress: TrainingProgress, mode: PileCountMode): boolean {
  return mode !== "normal" || progress.axes["pile-count"].modes.beginner.bestScore >= PASSING_SCORE;
}

/** `totalTimeMs` is required in manual mode: the sum of the ten pile times. Only a 10/10 series can set a record. */
export function recordPileCountSeries(
  progress: TrainingProgress,
  mode: PileCountMode,
  score: number,
  totalTimeMs?: number,
): TrainingProgress {
  if (!parsePileCountMode(mode)) throw new Error("Invalid pile-count mode.");
  if (!Number.isInteger(score) || score < 0 || score > PILE_COUNT_SERIES_LENGTH) throw new Error("Invalid training score.");
  const modes = progress.axes["pile-count"].modes;
  let updated: PileCountProgress["modes"];
  if (mode === "manual") {
    if (typeof totalTimeMs !== "number" || !Number.isFinite(totalTimeMs) || totalTimeMs <= 0) {
      throw new Error("A manual series needs its total time.");
    }
    const time = Math.max(1, Math.round(totalTimeMs));
    const previous = modes.manual.bestTimeMs;
    const bestTimeMs = score === PILE_COUNT_SERIES_LENGTH && (previous === null || time < previous) ? time : previous;
    updated = { ...modes, manual: { completedSeries: modes.manual.completedSeries + 1, bestTimeMs } };
  } else if (mode === "free") {
    updated = { ...modes, free: { completedSeries: modes.free.completedSeries + 1 } };
  } else {
    updated = { ...modes, [mode]: { bestScore: Math.max(modes[mode].bestScore, score), completedSeries: modes[mode].completedSeries + 1 } };
  }
  return { version: 1, axes: { ...progress.axes, "pile-count": { modes: updated } } };
}

export function pileCountSeriesSeed(progress: TrainingProgress, mode: PileCountMode): number {
  if (!parsePileCountMode(mode)) throw new Error("Invalid pile-count mode.");
  return PILE_COUNT_SEED_BASE[mode] + progress.axes["pile-count"].modes[mode].completedSeries * PILE_COUNT_SEED_STRIDE;
}
