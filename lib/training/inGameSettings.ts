import { trainingAxes } from "@/engine/training/axes";
import type { InGameAxisId } from "@/engine/training/inGame";
import type { TrainingProgress } from "@/components/training/progress";
import type { InGameConfiguration } from "@/lib/training/inGameScheduler";

export const TRAINING_GAME_SETTINGS_KEY = "coinche:training-game-settings:v1";

function availableAxisIds(): InGameAxisId[] {
  return trainingAxes.list().filter((axis) => axis.inGame).map((axis) => axis.id as InGameAxisId);
}

function unlockedLevel(progress: TrainingProgress, id: InGameAxisId): number {
  if (id === "trick-value") return progress.axes[id].unlockedLevel;
  if (id === "opponent-voids") return progress.axes[id].unlockedLevel;
  return progress.axes[id].unlockedLevel;
}

export function defaultInGameConfiguration(): InGameConfiguration {
  return { budgetPerRound: 3, axes: availableAxisIds().map((id) => ({
    id, enabled: id === "trick-value", level: 1,
  })) };
}

export function parseInGameConfiguration(raw: string | null, progress: TrainingProgress): InGameConfiguration {
  const defaults = defaultInGameConfiguration();
  if (!raw) return defaults;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return defaults;
    const saved = parsed as Record<string, unknown>;
    if (saved.version !== 1 || !Array.isArray(saved.axes)) return defaults;
    const budgetPerRound = saved.budgetPerRound === 1 || saved.budgetPerRound === 2 || saved.budgetPerRound === 3
      ? saved.budgetPerRound : defaults.budgetPerRound;
    const choices = new Map<string, Record<string, unknown>>();
    for (const value of saved.axes) {
      if (value && typeof value === "object" && !Array.isArray(value)) {
        const choice = value as Record<string, unknown>;
        if (typeof choice.id === "string") choices.set(choice.id, choice);
      }
    }
    return { budgetPerRound, axes: defaults.axes.map((fallback) => {
      const savedChoice = choices.get(fallback.id);
      const level = savedChoice?.level;
      return {
        id: fallback.id,
        enabled: typeof savedChoice?.enabled === "boolean" ? savedChoice.enabled : fallback.enabled,
        level: Number.isInteger(level) ? Math.max(1, Math.min(Number(level), unlockedLevel(progress, fallback.id))) : 1,
      };
    }) };
  } catch { return defaults; }
}

function browserStorage(): Storage | null {
  if (typeof window === "undefined") return null;
  try { return window.localStorage; } catch { return null; }
}

export function readInGameConfiguration(progress: TrainingProgress, storage: Pick<Storage, "getItem"> | null = browserStorage()): InGameConfiguration {
  try { return parseInGameConfiguration(storage?.getItem(TRAINING_GAME_SETTINGS_KEY) ?? null, progress); }
  catch { return defaultInGameConfiguration(); }
}

export function saveInGameConfiguration(configuration: InGameConfiguration, storage: Pick<Storage, "setItem"> | null = browserStorage()): void {
  try { storage?.setItem(TRAINING_GAME_SETTINGS_KEY, JSON.stringify({ version: 1, ...configuration })); }
  catch { /* Local storage may be unavailable. */ }
}
