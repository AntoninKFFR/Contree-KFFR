"use client";

import { usePlayerPreferences } from "@/components/settings/PlayerPreferencesProvider";

function MoonIcon() {
  return (
    <svg aria-hidden="true" fill="none" viewBox="0 0 24 24">
      <path d="M20.2 15.2A8.4 8.4 0 0 1 8.8 3.8a8.5 8.5 0 1 0 11.4 11.4Z" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
    </svg>
  );
}

function SunIcon() {
  return (
    <svg aria-hidden="true" fill="none" viewBox="0 0 24 24">
      <circle cx="12" cy="12" r="3.5" stroke="currentColor" strokeWidth="1.8" />
      <path d="M12 2.5v2M12 19.5v2M4.1 4.1l1.4 1.4M18.5 18.5l1.4 1.4M2.5 12h2M19.5 12h2M4.1 19.9l1.4-1.4M18.5 5.5l1.4-1.4" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" />
    </svg>
  );
}

export function ThemeToggle({ className = "" }: { className?: string }) {
  const { preferences, setPreferences } = usePlayerPreferences();
  const isLight = preferences.visual.theme === "light";
  const targetLabel = isLight ? "Activer le thème sombre" : "Activer le thème clair";

  return (
    <button
      aria-checked={isLight}
      aria-label={targetLabel}
      className={`coinche-theme-toggle ${className}`}
      onClick={() => setPreferences((current) => ({
        ...current,
        visual: { ...current.visual, theme: current.visual.theme === "light" ? "dark" : "light" },
      }))}
      role="switch"
      title={targetLabel}
      type="button"
    >
      <span className="coinche-theme-toggle__icon">{isLight ? <MoonIcon /> : <SunIcon />}</span>
    </button>
  );
}
