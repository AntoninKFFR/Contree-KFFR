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
import { calculateDetailedPlayerStats, multiplayerGamesForDetailedStats, soloGamesForDetailedStats } from "@/lib/detailedPlayerStats";
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

  const summary = useMemo(() => {
    const solo = soloGamesForDetailedStats(games);
    const multiplayer = multiplayerGamesForDetailedStats(multiplayerGames);
    return calculateDetailedPlayerStats(filter === "solo" ? solo : filter === "multiplayer" ? multiplayer : [...solo, ...multiplayer]);
  }, [filter, games, multiplayerGames]);
  const counts = { all: games.length + multiplayerGames.length, solo: games.length, multiplayer: multiplayerGames.length };

  return (
    <AppPage width="wide">
      <div className="history-view flex min-w-0 flex-col gap-4">
        <div className="flex items-center justify-between gap-3">
          <Link className="coinche-ui-link text-sm font-semibold" href="/profile">← Profil</Link>
          <Link className="coinche-ui-link text-sm font-semibold" href="/">Accueil</Link>
        </div>
        <AppPageHeader className="!p-4 sm:!p-5" description="Toutes mes parties" title="Historique" />
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
                {pageState === "ready" && !errorMessage ? <span className="ml-2 tabular-nums text-[var(--text-secondary)]">{counts[value]}</span> : null}
              </button>
            ))}
          </div>
        {pageState === "ready" && !errorMessage ? <AppSurface className="!p-3 sm:!p-4">
          <dl aria-label="Résumé du filtre" className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4">
            {[
              { label: "Parties", value: summary.total },
              { label: "Victoires", value: summary.wins, color: "var(--history-accent)" },
              { label: "Défaites", value: summary.losses, color: "var(--history-danger)" },
              { label: "Taux de victoire", value: summary.winrate === null ? "—" : `${summary.winrate} %` },
            ].map(({ label, value, color }) => <div className="min-w-0" key={label}>
              <dt className="text-xs font-semibold text-[var(--text-secondary)]">{label}</dt>
              <dd className="mt-1 text-xl font-black tabular-nums" style={{ color }}>{value}</dd>
            </div>)}
          </dl>
        </AppSurface> : null}
        <AppSurface variant="plain">
          {pageState === "unavailable" ? <StatusMessage>Supabase est indisponible. Vérifie la configuration dans .env.local.</StatusMessage> : null}
          {pageState === "signed-out" ? (
            <StatusMessage>Connecte-toi pour voir ton historique.<Link className={`${appPrimaryActionClass} mt-4`} href="/login">Se connecter</Link></StatusMessage>
          ) : null}
          {pageState === "loading" ? <StatusMessage>Chargement de l&apos;historique...</StatusMessage> : null}
          {errorMessage ? <p className="coinche-notice" data-tone="error" role="alert">Impossible de charger l&apos;historique: {errorMessage}</p> : null}
          {pageState === "ready" && !errorMessage && entries.length === 0 ? <StatusMessage>Aucune partie enregistrée pour ce filtre.</StatusMessage> : null}
          {pageState === "ready" && !errorMessage && entries.length > 0 ? (
            <ul aria-label="Parties enregistrées" className="space-y-2">
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
  const won = Boolean(game.won);
  return (
    <li className="history-entry text-sm">
      <HistoryHeader date={game.created_at} label="Solo" won={won} />
      <div className="mt-2 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <p className="text-2xl font-black tabular-nums"><span className="sr-only">Score joueur — bots : </span><span className={won ? "text-[var(--history-accent)]" : "text-[var(--history-danger)]"}>{game.player_score ?? "—"}</span> <span className="text-[var(--text-muted)]">—</span> <span className="text-[var(--text-secondary)]">{game.bot_score ?? "—"}</span></p>
        <p className="text-[var(--text-secondary)]">{scoringModeLabel(game.scoring_mode)}</p>
      </div>
      <details className="history-details mt-2">
        <summary>Voir les détails</summary>
        <div className="mt-2 grid gap-x-4 gap-y-1 text-[var(--text-secondary)] sm:grid-cols-2">
          <p>Cible : {game.target_score ?? "—"}</p><p>Fin : score</p>
          <p>Manches : {game.round_history?.length ?? "—"}</p>
          {game.bot_summary ? <p className="break-words">Bots affrontés : {game.bot_summary}</p> : null}
        </div>
        <HistoryRules id={game.ruleset_id} snapshot={game.ruleset_snapshot} />
        <GeneraleHistory rounds={game.round_history} names={game.player_names} />
      </details>
    </li>
  );
}

function MultiplayerHistoryItem({ game }: { game: MultiplayerHistoryGame }) {
  const won = didViewerWin(game);
  return (
    <li className="history-entry text-sm">
      <HistoryHeader date={game.finished_at} label="Multijoueur" won={won} />
      <div className="mt-2 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <p className="text-2xl font-black tabular-nums"><span className="sr-only">Score équipe — adversaires : </span><span className={won ? "text-[var(--history-accent)]" : "text-[var(--history-danger)]"}>{viewerTeamScore(game)}</span> <span className="text-[var(--text-muted)]">—</span> <span className="text-[var(--text-secondary)]">{opposingTeamScore(game)}</span></p>
        <p className="text-[var(--text-secondary)]">{scoringModeLabel(game.scoring_mode)}</p>
      </div>
      <div className="mt-2 grid gap-x-4 gap-y-1 break-words text-[var(--text-secondary)] sm:grid-cols-2">
        <p>Partenaire : {partnerNames(game).join(", ") || "Aucun"}</p>
        <p>Adversaires : {opponentNames(game).join(", ") || "Aucun"}</p>
      </div>
      <details className="history-details mt-2">
        <summary>Voir les détails</summary>
        <div className="mt-2 grid gap-x-4 gap-y-1 text-[var(--text-secondary)] sm:grid-cols-2">
          <p>Cible : {game.target_score}</p><p>Fin : {multiplayerEndLabel(game)}</p>
          <p>Manches : {game.round_count}</p>
        </div>
        <HistoryRules id={game.ruleset_id} snapshot={game.ruleset_snapshot} />
        <GeneraleHistory rounds={game.round_history} names={Object.fromEntries(game.players.map((player) => [player.seat_index, player.display_name])) as Record<PlayerId, string>} />
      </details>
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
      <p className="min-w-0 text-[var(--text-secondary)]"><span className="font-semibold text-[var(--text-primary)]">{formatDate(date)}</span> · {label}</p>
      <span className="history-result" data-result={won ? "win" : "loss"}>{won ? "Victoire" : "Défaite"}</span>
    </div>
  );
}

function StatusMessage({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-col text-sm text-[var(--text-secondary)]">{children}</div>;
}
