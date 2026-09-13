"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import {
  clonePlayerPreferences,
  loadPlayerPreferences,
  PLAYER_PREFERENCES_STORAGE_KEY,
  resetPlayerPreferences,
  savePlayerPreferences,
  withGameSpeed,
  type GameSpeed,
  type PlayerPreferences,
} from "@/lib/preferences/playerPreferences";

type PreferencesContextValue = {
  preferences: PlayerPreferences;
  effectiveReducedMotion: boolean;
  setPreferences: (update: PlayerPreferences | ((current: PlayerPreferences) => PlayerPreferences)) => void;
  setGameSpeed: (speed: GameSpeed) => void;
  reset: () => void;
};

const fallbackPreferences = clonePlayerPreferences();
const PlayerPreferencesContext = createContext<PreferencesContextValue>({
  preferences: fallbackPreferences,
  effectiveReducedMotion: false,
  setPreferences: () => undefined,
  setGameSpeed: () => undefined,
  reset: () => undefined,
});

function browserStorage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function PlayerPreferencesProvider({ children, initialPreferences }: { children?: React.ReactNode; initialPreferences?: PlayerPreferences }) {
  const [preferences, setPreferencesState] = useState<PlayerPreferences>(() => clonePlayerPreferences(initialPreferences));
  const [hydrated, setHydrated] = useState(false);
  const [systemReducedMotion, setSystemReducedMotion] = useState(false);

  useEffect(() => {
    setPreferencesState(loadPlayerPreferences(browserStorage()));
    setHydrated(true);
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const updateMotion = () => setSystemReducedMotion(query.matches);
    updateMotion();
    query.addEventListener("change", updateMotion);
    const syncStorage = (event: StorageEvent) => {
      if (event.key === null || event.key === PLAYER_PREFERENCES_STORAGE_KEY) {
        setPreferencesState(loadPlayerPreferences(browserStorage()));
      }
    };
    window.addEventListener("storage", syncStorage);
    return () => {
      query.removeEventListener("change", updateMotion);
      window.removeEventListener("storage", syncStorage);
    };
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    savePlayerPreferences(browserStorage(), preferences);
  }, [hydrated, preferences]);

  const effectiveReducedMotion = systemReducedMotion || preferences.visual.reducedMotion || !preferences.visual.animations;
  useEffect(() => {
    const classNames = {
      "coinche-compact": preferences.visual.compactLayout,
      "coinche-high-contrast": preferences.visual.highContrast,
      "coinche-text-large": preferences.visual.textSize === "large",
      "coinche-reduced-motion": effectiveReducedMotion,
    };
    for (const [className, enabled] of Object.entries(classNames)) {
      document.body.classList.toggle(className, enabled);
    }
    return () => Object.keys(classNames).forEach((className) => document.body.classList.remove(className));
  }, [effectiveReducedMotion, preferences.visual.compactLayout, preferences.visual.highContrast, preferences.visual.textSize]);

  const setPreferences = useCallback<PreferencesContextValue["setPreferences"]>((update) => {
    setPreferencesState((current) => clonePlayerPreferences(typeof update === "function" ? update(current) : update));
  }, []);
  const setGameSpeed = useCallback((speed: GameSpeed) => {
    setPreferencesState((current) => withGameSpeed(current, speed));
  }, []);
  const reset = useCallback(() => {
    setPreferencesState(resetPlayerPreferences(browserStorage()));
  }, []);
  const value = useMemo(() => ({ preferences, effectiveReducedMotion, setPreferences, setGameSpeed, reset }), [effectiveReducedMotion, preferences, reset, setGameSpeed, setPreferences]);

  return <PlayerPreferencesContext.Provider value={value}>{children}</PlayerPreferencesContext.Provider>;
}

export function usePlayerPreferences(): PreferencesContextValue {
  return useContext(PlayerPreferencesContext);
}
