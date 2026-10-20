import { soloSpeed } from "./performance";
import { useEffect, useRef, useState } from "react";
import { clonePlayerPreferences, normalizePlayerPreferences, PLAYER_PREFERENCES_STORAGE_KEY, type PlayerPreferences } from "@/lib/preferences/playerPreferences";
import { soloEnvironment } from "@/solo/environment";
import { useMotionPreference } from "@/components/use-motion-preference";

/** Same schema/defaults as web; device-local, isolated from the validated account UI. */
export function useSoloPreferences() {
  const [preferences, setPreferences] = useState(clonePlayerPreferences);
  const [loaded, setLoaded] = useState(false), [error, setError] = useState<string | null>(null);
  const serial = useRef(Promise.resolve());
  const systemReducedMotion = useMotionPreference();
  useEffect(() => {
    let live = true;
    void soloEnvironment.storage.getItem(PLAYER_PREFERENCES_STORAGE_KEY).then((raw) => {
      if (!live) return;
      if (raw) { try { setPreferences(normalizePlayerPreferences(JSON.parse(raw))); } catch { setError("Paramètres locaux illisibles. Les valeurs par défaut sont utilisées."); } }
    }).catch(() => { if (live) setError("Les paramètres locaux sont indisponibles."); }).finally(() => { if (live) setLoaded(true); });
    return () => { live = false; };
  }, []);
  useEffect(() => {
    if (loaded) soloSpeed(preferences.gameplay.gameSpeed, preferences.gameplay.botDelayMs, preferences.gameplay.biddingDelayMs, preferences.gameplay.trickDisplayMs, systemReducedMotion || preferences.visual.reducedMotion);
  }, [loaded, preferences.gameplay.gameSpeed, preferences.gameplay.botDelayMs, preferences.gameplay.biddingDelayMs, preferences.gameplay.trickDisplayMs, preferences.visual.reducedMotion, systemReducedMotion]);
  function update(next: PlayerPreferences) {
    const safe = normalizePlayerPreferences(next);
    setPreferences(safe);
    serial.current = serial.current.catch(() => undefined).then(async () => {
      try { await soloEnvironment.storage.setItem(PLAYER_PREFERENCES_STORAGE_KEY, JSON.stringify(safe)); setError(null); }
      catch { setError("Paramètres appliqués, mais non sauvegardés sur cet appareil."); }
    });
  }
  return { preferences, update, loaded, error, reduced: systemReducedMotion || preferences.visual.reducedMotion };
}
