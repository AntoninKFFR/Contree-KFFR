export const PROGRESSION_CHANGED_EVENT = "kffr:progression-changed";

/** Read invalidation only. Never awards XP. */
export function notifyProgressionChanged() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(PROGRESSION_CHANGED_EVENT));
}
