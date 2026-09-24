import type { PileCountMode } from "@/engine/training/pileCount";

export const PILE_COUNT_TITLE = "Compter son tas";

/**
 * `delayMs` is the time each card stays on screen: null in free mode (player-set speed)
 * and in manual mode, where the player moves through the cards with the arrows.
 */
export const PILE_COUNT_MODE_COPY: Record<PileCountMode, { name: string; description: string; delayMs: number | null }> = {
  beginner: { name: "Débutant", description: "Défilement lent, avec l’aide des valeurs des cartes.", delayMs: 1500 },
  normal: { name: "Normal", description: "Défilement rapide, sans aide.", delayMs: 800 },
  free: { name: "Libre", description: "Tu règles toi-même la vitesse. Pas de meilleur score.", delayMs: null },
  manual: { name: "Manuel", description: "Fais défiler les cartes avec les flèches, le plus vite possible. Chrono sur chaque tas.", delayMs: null },
};

export const FREE_SPEED = { minMs: 300, maxMs: 3000, stepMs: 100, defaultMs: 1000 } as const;
const FREE_SPEED_KEY = "coinche:training-pile-speed:v1";

export function clampFreeDelay(value: unknown): number {
  const delay = typeof value === "number" && Number.isFinite(value) ? value : FREE_SPEED.defaultMs;
  const stepped = Math.round(delay / FREE_SPEED.stepMs) * FREE_SPEED.stepMs;
  return Math.min(FREE_SPEED.maxMs, Math.max(FREE_SPEED.minMs, stepped));
}

/** The free-mode speed is a per-browser convenience: losing it only resets the slider. */
export function readFreeDelay(): number {
  try { return clampFreeDelay(Number(window.localStorage.getItem(FREE_SPEED_KEY) ?? Number.NaN)); }
  catch { return FREE_SPEED.defaultMs; }
}

export function saveFreeDelay(delayMs: number): void {
  try { window.localStorage.setItem(FREE_SPEED_KEY, String(clampFreeDelay(delayMs))); } catch { /* Storage may be unavailable. */ }
}

export function formatSeconds(delayMs: number): string {
  return `${(delayMs / 1000).toLocaleString("fr-FR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} s`;
}

/** "8,4 s" under a minute, "1 min 05,3 s" above. */
export function formatDuration(ms: number): string {
  const tenths = Math.max(0, Math.round(ms / 100));
  const minutes = Math.floor(tenths / 600);
  const seconds = (tenths % 600) / 10;
  const format = (value: number, pad: boolean) => value.toLocaleString("fr-FR", {
    minimumFractionDigits: 1, maximumFractionDigits: 1, minimumIntegerDigits: pad ? 2 : 1,
  });
  return minutes === 0 ? `${format(seconds, false)} s` : `${minutes} min ${format(seconds, true)} s`;
}

/** French: "0 point", "1 point", "2 points". */
export function formatPoints(points: number): string {
  return `${points} point${Math.abs(points) >= 2 ? "s" : ""}`;
}
