export * from "@/lib/training/inGameConfiguration";
import { TRAINING_GAME_SETTINGS_KEY, parseInGameConfiguration, defaultInGameConfiguration } from "@/lib/training/inGameConfiguration";
import type { TrainingProgress } from "@/lib/training/progress";
import type { InGameConfiguration } from "@/lib/training/inGameScheduler";

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
