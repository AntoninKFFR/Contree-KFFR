import { soloWait } from "./performance";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { getTrickPresentationPolicy, isPreferenceAnimationEnabled } from "@/lib/preferences/presentation";
import type { PlayerPreferences } from "@/lib/preferences/playerPreferences";
import type { NativeSoloSession } from "./contract";
import { createTablePresentationStore, deriveTablePresentation } from "./presentation-store";

export function useTablePresentation(session: NativeSoloSession | null, preferences: PlayerPreferences, reduced: boolean, enabled: boolean) {
  const [store] = useState(createTablePresentationStore);
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  const animate = isPreferenceAnimationEnabled(preferences, "card-play", reduced);
  const view = useMemo(() => deriveTablePresentation(snapshot, session, animate), [snapshot, session, animate]);
  const policy = getTrickPresentationPolicy(preferences);
  const presentedKey = view.presented?.key;
  useEffect(() => store.observe(session, animate), [store, session, animate]);
  useEffect(() => {
    if (!presentedKey || !policy.autoCollect || !enabled) return;
    const started = performance.now();
    const timer = setTimeout(() => { soloWait("collection", policy.delayMs, performance.now() - started); store.collect(); }, policy.delayMs);
    return () => clearTimeout(timer);
  }, [store, presentedKey, policy.autoCollect, policy.delayMs, enabled]);
  return { ...view, collect: store.collect, lastCollected: snapshot.lastCollected, isCollected: (key: string) => snapshot.collected.includes(key), policy };
}
