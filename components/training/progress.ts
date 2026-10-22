export * from "@/lib/training/progress";
import { emptyTrainingProgress, parseTrainingProgress, TRAINING_PROGRESS_KEY, type TrainingProgress } from "@/lib/training/progress";
function storageOrNull(): Storage | null {
  if (typeof window === "undefined") return null;
  try { return window.localStorage; } catch { return null; }
}
export function readTrainingProgress(storage: Pick<Storage, "getItem"> | null = storageOrNull()): TrainingProgress {
  try { return parseTrainingProgress(storage?.getItem(TRAINING_PROGRESS_KEY) ?? null); }
  catch { return emptyTrainingProgress(); }
}
export function saveTrainingProgress(progress: TrainingProgress, storage: Pick<Storage, "setItem"> | null = storageOrNull()): void {
  try { storage?.setItem(TRAINING_PROGRESS_KEY, JSON.stringify(progress)); } catch { /* Browser storage may be unavailable. */ }
}
