import React from "react";
import { SUIT_SYMBOLS } from "@/engine/cards";
import { resolveContractMode } from "@/engine/contractMode";
import { playerName, teamName } from "@/engine/players";
import type { Contract, GameState, TeamId } from "@/engine/types";
import type { PlayerGameView } from "@/engine/views";
import { usePlayerPreferences } from "@/components/settings/PlayerPreferencesProvider";
import { isPreferenceAnimationEnabled } from "@/lib/preferences/presentation";

type RoundCompletionState = GameState | PlayerGameView;

type RoundCompletionCardProps = {
  actionLabel: "Manche suivante" | "Nouvelle partie";
  disabled?: boolean;
  onAction: () => void;
  state: RoundCompletionState;
};

function compactContractLabel(contract: Contract): string {
  const value = contract.kind === "capot" ? "Capot" : contract.kind === "generale" ? "Générale" : String(contract.value);
  const mode = resolveContractMode(contract);
  const modeLabel = mode?.kind === "suit" ? SUIT_SYMBOLS[mode.suit] : mode?.kind === "no-trump" ? "SA" : mode?.kind === "all-trump" ? "TA" : "";
  return `${value} ${modeLabel}`;
}

function winningRoundTeam(state: RoundCompletionState): TeamId | null {
  if (state.roundScore[0] === state.roundScore[1]) return null;
  return state.roundScore[0] > state.roundScore[1] ? 0 : 1;
}

export function RoundCompletionCard({ actionLabel, disabled = false, onAction, state }: RoundCompletionCardProps) {
  const { effectiveReducedMotion, preferences } = usePlayerPreferences();
  const result = state.result?.kind === "played" ? state.result : null;
  const success = result?.contractSucceeded ?? false;
  const winnerTeam = winningRoundTeam(state);
  const lastTrick = state.completedTricks.at(-1);
  const animated = isPreferenceAnimationEnabled(preferences, "trick", effectiveReducedMotion);
  const names = state.playerNames;

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-[max(0.5rem,env(safe-area-inset-bottom))] z-40 flex justify-center px-2 sm:bottom-4 sm:px-4">
      <section
        aria-label="Résultat de la manche"
        className={`coinche-round-completion pointer-events-auto max-h-[calc(100dvh-4rem)] w-full max-w-md overflow-y-auto rounded-2xl border p-3 text-center shadow-[0_20px_70px_var(--shadow)] backdrop-blur-xl sm:p-4 ${success ? "border-emerald-300/35" : "border-red-300/35"} ${animated ? "coinche-card-enter" : ""}`}
      >
        <p className={`text-xs font-black uppercase tracking-[0.18em] ${success ? "text-emerald-300" : "text-red-300"}`}>
          {result ? (success ? "Contrat réussi ✓" : "Contrat chuté") : "Manche terminée"}
        </p>
        {result ? <p className="mt-1 text-lg font-black text-[#f3ead2]">{compactContractLabel(result.contract)} <span className="text-white/35">—</span> {playerName(result.contract.playerId, names)}</p> : null}

        <div className="mt-3 rounded-xl border border-white/10 bg-white/[0.06] px-3 py-2.5">
          <p className="text-2xl font-black tabular-nums">{state.roundScore[0]} <span className="text-white/30">—</span> {state.roundScore[1]}</p>
          <p className="mt-0.5 text-xs font-semibold text-white/70">
            {winnerTeam === null ? "Score de manche partagé" : `${teamName(winnerTeam, names)} remportent la manche`}
          </p>
          <p className="mt-2 border-t border-white/10 pt-2 text-xs font-bold text-[#e7d7ae]/75">Partie : {state.totalScore[0]} — {state.totalScore[1]}</p>
        </div>

        <button
          className="mt-3 min-h-11 w-full rounded-xl border border-amber-200/30 bg-[#f3ead2] px-5 py-2.5 text-sm font-black text-[#10251b] shadow-lg transition hover:bg-white focus-visible:outline focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-amber-200 disabled:cursor-not-allowed disabled:opacity-55"
          disabled={disabled}
          onClick={onAction}
          type="button"
        >
          {actionLabel}
        </button>

        {result ? (
          <details className="mt-2 rounded-xl border border-white/10 bg-black/15 text-left text-xs text-white/70">
            <summary className="cursor-pointer rounded-xl px-3 py-2 text-center font-bold text-white/80 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-300">Détails</summary>
            <div className="grid gap-1 border-t border-white/10 px-3 py-2.5 sm:grid-cols-2">
              <p>Points de plis : {result.trickPointsByTeam[0]} — {result.trickPointsByTeam[1]}</p>
              <p>Points détaillés : {result.totalPointsByTeam[0]} — {result.totalPointsByTeam[1]}</p>
              {(result.belotePointsByTeam[0] || result.belotePointsByTeam[1]) ? <p>Belote : {result.belotePointsByTeam[0]} — {result.belotePointsByTeam[1]}</p> : null}
              {(result.announcementPointsByTeam[0] || result.announcementPointsByTeam[1]) ? <p>Annonces : {result.announcementPointsByTeam[0]} — {result.announcementPointsByTeam[1]}</p> : null}
              {result.multiplier > 1 ? <p>Multiplicateur : ×{result.multiplier}</p> : null}
              {lastTrick ? <p>Dernier pli : {playerName(lastTrick.winnerId, names)} · {lastTrick.points} points</p> : null}
            </div>
          </details>
        ) : null}
      </section>
    </div>
  );
}
