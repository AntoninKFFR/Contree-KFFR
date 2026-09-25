import { isBotSeat, SOLO_SEAT_ASSIGNMENTS } from "@/engine/seats";
import type { GameState } from "@/engine/types";
import { isPreferenceAnimationEnabled, getTrickPresentationPolicy } from "@/lib/preferences/presentation";
import type { PlayerPreferences } from "@/lib/preferences/playerPreferences";
import { completedTrickKey } from "@/lib/trickPresentation";

/** Only a bot's lead after an automatically animated collection needs the visual gate. */
export function soloBotCollectionKey(
  state: GameState,
  preferences: PlayerPreferences,
  effectiveReducedMotion: boolean,
): string | null {
  const policy = getTrickPresentationPolicy(preferences);
  const lastTrick = state.completedTricks.at(-1);
  if (state.phase !== "playing" || state.currentTrick.cards.length !== 0 || !lastTrick
    || lastTrick.winnerId !== state.currentPlayerId
    || !isBotSeat(SOLO_SEAT_ASSIGNMENTS, state.currentPlayerId)
    || !policy.autoCollect || policy.delayMs === 0
    || !isPreferenceAnimationEnabled(preferences, "trick", effectiveReducedMotion)) return null;
  return completedTrickKey(state.roundNumber, state.completedTricks.length, lastTrick);
}

export type SoloBotTurnPacer = {
  autoCollected: (trickKey: string) => void;
  releaseCollection: () => void;
  cancel: () => void;
};

/** Commit once both the normal bot delay and, when needed, visual collection have finished. */
export function scheduleSoloBotTurn(
  delayMs: number,
  collectionKey: string | null,
  onReady: () => void,
): SoloBotTurnPacer {
  let pendingCollection = collectionKey;
  let delayElapsed = false;
  let cancelled = false;
  let committed = false;
  const flush = () => {
    if (cancelled || committed || !delayElapsed || pendingCollection !== null) return;
    committed = true;
    onReady();
  };
  const timeoutId = setTimeout(() => {
    delayElapsed = true;
    flush();
  }, delayMs);
  return {
    autoCollected(trickKey) {
      if (pendingCollection !== trickKey) return;
      pendingCollection = null;
      flush();
    },
    releaseCollection() {
      pendingCollection = null;
      flush();
    },
    cancel() {
      cancelled = true;
      clearTimeout(timeoutId);
    },
  };
}
