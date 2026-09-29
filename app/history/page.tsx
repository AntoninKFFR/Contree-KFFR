"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  didViewerWin,
  getUserMultiplayerGames,
  multiplayerEndLabel,
  opponentNames,
  opposingTeamScore,
  partnerNames,
  viewerTeamScore,
  type MultiplayerHistoryGame,
} from "@/lib/multiplayerHistory";
import { formatDate, getUserGames, scoringModeLabel, type GameRow } from "@/lib/stats";
import { getSupabaseClient } from "@/lib/supabaseClient";
import { RulesetSummary } from "@/components/rules/RulesetSummary";
import { buildCustomRuleset, rulesetToCustomInput } from "@/engine/rulesets/custom";
import type { GameRulesetSnapshot } from "@/engine/rulesets/types";
import { formatContractLabel } from "@/engine/contractMode";
import type { GameState, PlayerId } from "@/engine/types";
import {
  AppPage,
  AppPageHeader,
  AppSurface,
  appBadgeClass,
  appPrimaryActionClass,
  appSegmentedItemClass,
} from "@/components/ui/AppShell";

type PageState = "loading" | "ready" | "signed-out" | "unavailable";
type HistoryFilter = "all" | "solo" | "multiplayer";
type HistoryEntry =
  | { kind: "solo"; date: string | null; game: GameRow }
  | { kind: "multiplayer"; date: string | null; game: MultiplayerHistoryGame };

export default function HistoryPage() {
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [games, setGames] = useState<GameRow[]>([]);
  const [multiplayerGames, setMultiplayerGames] = useState<MultiplayerHistoryGame[]>([]);
  const [filter, setFilter] = useState<HistoryFilter>("all");
  const [pageState, setPageState] = useState<PageState>("loading");

  useEffect(() => {
    const supabase = getSupabaseClient();
    if (!supabase) {
      setPageState("unavailable");
      return;
    }
    const client = supabase;
    let isCancelled = false;

    async function loadHistory() {
      setPageState("loading");
      setErrorMessage(null);
      const { data: sessionData } = await client.auth.getSession();
      const session = sessionData.session;
      if (isCancelled) return;
      if (!session) {
        setPageState("signed-out");
        return;
      }
      const [soloResult, multiplayerResult] = await Promise.all([
        getUserGames(client, session.user.id),
        getUserMultiplayerGames(client),
      ]);
      if (isCancelled) return;
      const error = soloResult.error ?? multiplayerResult.error;
      if (error) {
        setErrorMessage(error.message);
        setGames([]);
        setMultiplayerGames([]);
      } else {
        setGames((soloResult.data ?? []) as GameRow[]);
        setMultiplayerGames(multiplayerResult.data);
      }
      setPageState("ready");
    }

    void loadHistory();
    const { data: { subscription } } = client.auth.onAuthStateChange(() => void loadHistory());
    return () => {
      isCancelled = true;
      subscription.unsubscribe();
    };
  }, []);

  const entries = useMemo(() => {
    const all: HistoryEntry[] = [
      ...games.map((game): HistoryEntry => ({ kind: "solo", date: game.created_at, game })),
      ...multiplayerGames.map((game): HistoryEntry => ({ kind: "multiplayer", date: game.finished_at, game })),
    ];
    return all
      .filter((entry) => filter === "all" || entry.kind === filter)
      .sort((first, second) => Date.parse(second.date ?? "") - Date.parse(first.date ?? ""));
  }, [filter, games, multiplayerGames]);

  return (
    <AppPage width="wide">
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between gap-3">
          <Link className="coinche-ui-link text-sm font-semibold" href="/profile">← Profil</Link>
          <Link className="coinche-ui-link text-sm font-semibold" href="/">Accueil</Link>
        </div>
        <AppPageHeader description="Les plus récentes apparaissent en premier." eyebrow="Historique" title="Toutes les parties" />
          <div className="flex flex-wrap gap-2" aria-label="Filtrer l'historique">
            {(["all", "solo", "multiplayer"] as const).map((value) => (
              <button
                aria-pressed={filter === value}
                className={appSegmentedItemClass}
                key={value}
                onClick={() => setFilter(value)}
                type="button"
              >
                {value === "all" ? "Toutes" : value === "solo" ? "Solo" : "Multijoueur"}
              </button>
            ))}
          </div>
        <AppSurface variant="plain">
          {pageState === "unavailable" ? <StatusMessage>Supabase est indisponible. Vérifie la configuration dans .env.local.</StatusMessage> : null}
          {pageState === "signed-out" ? (
            <StatusMessage>Connecte-toi pour voir ton historique.<Link className={`${appPrimaryActionClass} mt-4`} href="/login">Se connecter</Link></StatusMessage>
          ) : null}
          {pageState === "loading" ? <StatusMessage>Chargement de l&apos;historique...</StatusMessage> : null}
          {errorMessage ? <p className="coinche-notice" data-tone="error" role="alert">Impossible de charger l&apos;historique: {errorMessage}</p> : null}
          {pageState === "ready" && !errorMessage && entries.length === 0 ? <StatusMessage>Aucune partie enregistrée pour ce filtre.</StatusMessage> : null}
          {pageState === "ready" && !errorMessage && entries.length > 0 ? (
            <ul className="space-y-2">
              {entries.map((entry) => entry.kind === "solo"
                ? <SoloHistoryItem game={entry.game} key={`solo-${entry.game.id}`} />
                : <MultiplayerHistoryItem game={entry.game} key={`multi-${entry.game.id}`} />)}
            </ul>
          ) : null}
        </AppSurface>
      </div>
    </AppPage>
  );
}

function SoloHistoryItem({ game }: { game: GameRow }) {
  return (
    <li className="coinche-app-card text-sm">
      <HistoryHeader date={game.created_at} label="Solo" won={Boolean(game.won)} />
      <div className="mt-2 grid gap-1 text-[var(--text-secondary)] sm:grid-cols-2">
        <p>Mode: {scoringModeLabel(game.scoring_mode)}</p><p>Score: {game.player_score ?? "-"} – {game.bot_score ?? "-"}</p>
        <p>Cible: {game.target_score ?? "-"}</p><p>Fin: score</p>
      </div>
      <HistoryRules id={game.ruleset_id} snapshot={game.ruleset_snapshot} />
      <GeneraleHistory rounds={game.round_history} names={game.player_names} />
    </li>
  );
}

function MultiplayerHistoryItem({ game }: { game: MultiplayerHistoryGame }) {
  const won = didViewerWin(game);
  return (
    <li className="coinche-app-card text-sm">
      <HistoryHeader date={game.finished_at} label="Multijoueur" won={won} />
      <div className="mt-2 grid gap-1 text-[var(--text-secondary)] sm:grid-cols-2">
        <p>Score: {viewerTeamScore(game)} – {opposingTeamScore(game)}</p>
        <p>Mode: {scoringModeLabel(game.scoring_mode)}</p>
        <p>Partenaire: {partnerNames(game).join(", ") || "Aucun"}</p>
        <p>Adversaires: {opponentNames(game).join(", ") || "Aucun"}</p>
        <p>Fin: {multiplayerEndLabel(game)}</p>
        <p>Manches: {game.round_count}</p>
      </div>
      <HistoryRules id={game.ruleset_id} snapshot={game.ruleset_snapshot} />
      <GeneraleHistory rounds={game.round_history} names={Object.fromEntries(game.players.map((player) => [player.seat_index, player.display_name])) as Record<PlayerId, string>} />
    </li>
  );
}

function GeneraleHistory({ rounds, names }: { rounds?: GameState["roundHistory"]; names?: Partial<Record<PlayerId, string>> }) {
  const generales = (rounds ?? []).filter((round) => round.result.kind === "played" && round.result.contract.kind === "generale");
  if (!generales.length) return null;
  return <div className="coinche-notice mt-3">{generales.map((round) => round.result.kind === "played" ? <p key={round.roundNumber}>{formatContractLabel(round.result.contract)} par {names?.[round.result.contract.playerId] ?? `Joueur ${round.result.contract.playerId + 1}`} · {round.result.contractSucceeded ? "réussie" : "chutée"}</p> : null)}</div>;
}

function HistoryRules({ id, snapshot }: { id?: string | null; snapshot?: GameRulesetSnapshot | null }) {
  const label = id === "custom" ? "Variante personnalisée" : "Contrée KFFR";
  if (!snapshot) return <p className="mt-2 text-sm text-[var(--text-muted)]">{label}</p>;
  try {
    const safe = buildCustomRuleset(rulesetToCustomInput(snapshot));
    return <details className="mt-2"><summary className="coinche-ui-link cursor-pointer text-sm font-semibold">{label} · Voir les règles</summary><div className="mt-2"><RulesetSummary ruleset={safe} compact /></div></details>;
  } catch {
    return <p className="mt-2 text-sm text-[var(--text-muted)]">{label}</p>;
  }
}

function HistoryHeader({ date, label, won }: { date: string | null; label: string; won: boolean }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <p className="font-semibold">{formatDate(date)} · {label}</p>
      <span className={appBadgeClass} data-tone={won ? "success" : "error"}>{won ? "Victoire" : "Défaite"}</span>
    </div>
  );
}

function StatusMessage({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-col text-sm text-[var(--text-secondary)]">{children}</div>;
}
