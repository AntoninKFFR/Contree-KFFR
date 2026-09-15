import React from "react";
import type { PlayerId } from "@/engine/types";
import { usePlayerPreferences } from "@/components/settings/PlayerPreferencesProvider";

type PlayerPanelProps = {
  playerId: PlayerId;
  name: string;
  isConnected?: boolean;
  isBotTakeover?: boolean;
  isCurrent: boolean;
  hasStartingPlayer: boolean;
  cardsRemaining?: number;
  isHost?: boolean;
};

export function PlayerPanel({
  name,
  hasStartingPlayer,
  isBotTakeover = false,
  isConnected,
  isCurrent,
  cardsRemaining,
  isHost = false,
}: PlayerPanelProps) {
  const { effectiveReducedMotion, preferences } = usePlayerPreferences();
  const highlight = isCurrent && preferences.assistance.showTurnIndicator;
  return (
    <div
      aria-current={highlight ? "true" : undefined}
      className={[
        "flex min-h-10 min-w-20 items-center justify-center rounded-xl border bg-[#07150f]/72 px-2.5 py-1.5 text-center text-white shadow-lg backdrop-blur-md sm:min-h-12 sm:min-w-28 sm:px-3",
        highlight ? "border-emerald-300/80 coinche-turn-pulse" : "border-white/10",
        highlight && !effectiveReducedMotion ? "transition-shadow" : "",
      ].join(" ")}
    >
      <div className="flex items-center justify-center gap-1.5 sm:gap-2">
        <div className="min-w-0">
          <p className="max-w-[58px] truncate text-[11px] font-bold sm:max-w-24 sm:text-sm">
            {name}
          </p>
          {isConnected !== undefined ? (
            <p className="flex items-center justify-center gap-1 text-[8px] font-semibold text-white/55 sm:text-[9px]">
              <span
                aria-hidden="true"
                className={`h-1.5 w-1.5 rounded-full ${isConnected ? "bg-emerald-600" : "bg-stone-400"}`}
              />
              {isBotTakeover ? "Bot temporaire" : isConnected ? "En ligne" : "Hors ligne"}
            </p>
          ) : null}
          {cardsRemaining !== undefined ? <p className="text-[8px] font-semibold text-white/45 sm:text-[9px]">{cardsRemaining} carte{cardsRemaining > 1 ? "s" : ""}{isHost ? " · Hôte" : ""}</p> : null}
        </div>
        {hasStartingPlayer ? (
          <span className="rounded border border-[#d8c48f]/50 px-1 py-0 text-[10px] font-bold text-[#f0dfb1]">
            P
          </span>
        ) : null}
      </div>
    </div>
  );
}
