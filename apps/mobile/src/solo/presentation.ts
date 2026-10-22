import { soloWait } from "./performance";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { getTrickPresentationPolicy, isPreferenceAnimationEnabled } from "@/lib/preferences/presentation";
import type { PlayerPreferences } from "@/lib/preferences/playerPreferences";
import type { NativeSoloSession } from "./contract";
import { createTablePresentationStore, deriveTablePresentation } from "./presentation-store";
import { scheduleTrickCollection } from "@/lib/trickPresentation";

export function useTablePresentation(session: NativeSoloSession | null, preferences: PlayerPreferences, reduced: boolean, enabled: boolean) {
  const [store] = useState(createTablePresentationStore);
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  const animate = preferences.gameplay.trickDisplayMs > 0 && isPreferenceAnimationEnabled(preferences, "card-play", reduced);
  const visibleSession = enabled ? session : null;
  const view = useMemo(() => deriveTablePresentation(snapshot, visibleSession, animate), [snapshot, visibleSession, animate]);
  const policy = getTrickPresentationPolicy(preferences);
  const presentedKey = view.presented?.key;
  useEffect(() => store.observe(visibleSession, animate), [store, visibleSession, animate]);
  useEffect(() => {
    if (!presentedKey || !policy.autoCollect || !enabled) return;
    const started = performance.now();
    return scheduleTrickCollection(policy.delayMs, () => { soloWait("collection", policy.delayMs, performance.now() - started); store.collect(); }, {
      wait: (ms, callback) => { const timer = setTimeout(callback, ms); return () => clearTimeout(timer); },
      frame: (callback) => { const frame = requestAnimationFrame(callback); return () => cancelAnimationFrame(frame); },
    });
  }, [store, presentedKey, policy.autoCollect, policy.delayMs, enabled]);
  return { ...view, collect: store.collect, lastCollected: snapshot.lastCollected, isCollected: (key: string) => snapshot.collected.includes(key), policy };
}
