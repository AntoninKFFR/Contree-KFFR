"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { getProfileUsername } from "@/lib/profiles";
import {
  calculateStats,
  formatDate,
  getUserGames,
  scoringModeLabel,
  type GameRow,
} from "@/lib/stats";
import { getSupabaseClient } from "@/lib/supabaseClient";

type PageState = "loading" | "ready" | "signed-out" | "unavailable";

export default function ProfilePage() {
  const [games, setGames] = useState<GameRow[]>([]);
  const [pageState, setPageState] = useState<PageState>("loading");
  const [session, setSession] = useState<Session | null>(null);
  const [username, setUsername] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    const supabase = getSupabaseClient();

    if (!supabase) {
      setPageState("unavailable");
      return;
    }

    const client = supabase;
    let isCancelled = false;

    async function loadProfile() {
      setPageState("loading");
      setErrorMessage(null);

      const { data: sessionData } = await client.auth.getSession();
      const nextSession = sessionData.session;

      if (isCancelled) return;

      setSession(nextSession);

      if (!nextSession) {
        setPageState("signed-out");
        return;
      }

      const [nextUsername, gamesResult] = await Promise.all([
        getProfileUsername(client, nextSession.user.id),
        getUserGames(client, nextSession.user.id),
      ]);

      if (isCancelled) return;

      setUsername(nextUsername);

      if (gamesResult.error) {
        setErrorMessage(gamesResult.error.message);
        setGames([]);
      } else {
        setGames((gamesResult.data ?? []) as GameRow[]);
      }

      setPageState("ready");
    }

    loadProfile();

    const {
      data: { subscription },
    } = client.auth.onAuthStateChange(() => {
      loadProfile();
    });

    return () => {
      isCancelled = true;
      subscription.unsubscribe();
    };
  }, []);

  const stats = useMemo(() => calculateStats(games), [games]);
  const recentGames = useMemo(() => games.slice(0, 5), [games]);

  if (pageState === "unavailable") {
    return (
      <ProfileShell>
        <StatusCard title="Supabase indisponible">
          Vérifie la configuration dans .env.local, puis recharge la page.
        </StatusCard>
      </ProfileShell>
    );
  }

  if (pageState === "signed-out") {
    return (
      <ProfileShell>
        <StatusCard title="Non connecté">
          Connecte-toi pour voir ton profil et tes statistiques.
          <Link
            className="mt-4 inline-flex rounded-md bg-emerald-800 px-3 py-2 text-sm font-semibold text-white"
            href="/login"
          >
            Se connecter
          </Link>
        </StatusCard>
      </ProfileShell>
    );
  }

  return (
    <ProfileShell>
      <section className="rounded-lg border border-stone-300 bg-white p-5 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-wide text-emerald-800">
          Profil joueur
        </p>
        <h1 className="mt-1 text-2xl font-bold">
          {pageState === "loading" ? "Chargement..." : username ?? "Profil sans pseudo"}
        </h1>
        <p className="mt-1 text-sm text-stone-600">
          {session?.user.email ?? "Session en cours de lecture"}
        </p>
      </section>

      <section className="grid gap-3 sm:grid-cols-3">
        <StatCard label="Parties" value={stats.total} />
        <StatCard label="Victoires" value={stats.wins} />
        <StatCard label="Défaites" value={stats.losses} />
      </section>

      <section className="grid gap-3 lg:grid-cols-2">
        <StatsDetails title="Winrate" summary={`${stats.winrate}%`}>
          <DetailRow label="Global" value={`${stats.winrate}%`} />
          <DetailRow label="Points faits" value={`${stats.madePointsWinrate}%`} />
          <DetailRow label="Points annoncés" value={`${stats.announcedPointsWinrate}%`} />
        </StatsDetails>

        <StatsDetails title="Série" summary={`${stats.currentStreak} en cours`}>
          <DetailRow label="Série en cours" value={stats.currentStreak} />
          <DetailRow label="Meilleure série" value={stats.bestStreak} />
        </StatsDetails>
      </section>

      <section className="rounded-lg border border-stone-300 bg-white p-5 shadow-sm">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold">Dernières parties</h2>
            <p className="text-xs font-semibold text-stone-500">
              Aperçu des {recentGames.length} plus récentes
            </p>
          </div>
          <Link
            className="rounded-md bg-emerald-800 px-3 py-2 text-sm font-semibold text-white"
            href="/history"
          >
            Voir tout l&apos;historique
          </Link>
        </div>

        <GameList
          errorMessage={errorMessage}
          games={recentGames}
          isLoading={pageState === "loading"}
          noGamesText="Aucune partie enregistrée pour le moment."
        />
      </section>
    </ProfileShell>
  );
}

function GameList({
  errorMessage,
  games,
  isLoading,
  noGamesText,
}: {
  errorMessage: string | null;
  games: GameRow[];
  isLoading: boolean;
  noGamesText: string;
}) {
  if (errorMessage) {
    return (
      <p className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-900">
        Impossible de charger les parties: {errorMessage}
      </p>
    );
  }

  if (isLoading) {
    return <p className="text-sm text-stone-600">Chargement des parties...</p>;
  }

  if (games.length === 0) {
    return <p className="text-sm text-stone-600">{noGamesText}</p>;
  }

  return (
    <ul className="space-y-2">
      {games.map((game) => (
        <li className="rounded-md border border-stone-200 bg-stone-50 p-3 text-sm" key={game.id}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="font-semibold">{formatDate(game.created_at)}</p>
            <span
              className={`rounded-md px-2 py-1 text-xs font-bold ${
                game.won ? "bg-emerald-100 text-emerald-900" : "bg-red-100 text-red-900"
              }`}
            >
              {game.won ? "Gagné" : "Perdu"}
            </span>
          </div>
          <div className="mt-2 grid gap-1 text-stone-700 sm:grid-cols-2">
            <p>Mode: {scoringModeLabel(game.scoring_mode)}</p>
            <p>Cible: {game.target_score ?? "-"}</p>
            <p>Joueur: {game.player_score ?? "-"}</p>
            <p>Bots: {game.bot_score ?? "-"}</p>
          </div>
          {game.bot_summary ? (
            <p className="mt-2 text-xs font-semibold text-stone-500">
              Bots affrontés: {game.bot_summary}
            </p>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

function ProfileShell({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-dvh bg-[#f4f1e8] px-4 py-6 text-stone-950">
      <div className="mx-auto flex max-w-4xl flex-col gap-4">
        <div className="flex items-center justify-between gap-3">
          <Link className="text-sm font-semibold text-emerald-900 hover:underline" href="/">
            Retour au jeu
          </Link>
          <Link className="text-sm font-semibold text-emerald-900 hover:underline" href="/login">
            Compte
          </Link>
        </div>
        {children}
      </div>
    </main>
  );
}

function StatCard({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-lg border border-stone-300 bg-white p-4 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-stone-500">{label}</p>
      <p className="mt-1 text-2xl font-bold">{value}</p>
    </div>
  );
}

function StatsDetails({
  children,
  summary,
  title,
}: {
  children: React.ReactNode;
  summary: string;
  title: string;
}) {
  return (
    <details className="group rounded-lg border border-stone-300 bg-white p-4 shadow-sm">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-stone-500">{title}</p>
          <p className="mt-1 text-2xl font-bold">{summary}</p>
        </div>
        <span className="rounded-md border border-stone-300 px-2 py-1 text-xs font-semibold text-stone-700 group-open:hidden">
          Ouvrir
        </span>
        <span className="hidden rounded-md border border-stone-300 px-2 py-1 text-xs font-semibold text-stone-700 group-open:inline">
          Fermer
        </span>
      </summary>
      <div className="mt-4 space-y-2 border-t border-stone-200 pt-3">{children}</div>
    </details>
  );
}

function DetailRow({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="flex items-center justify-between gap-3 text-sm">
      <span className="text-stone-600">{label}</span>
      <span className="font-bold text-stone-950">{value}</span>
    </div>
  );
}

function StatusCard({ children, title }: { children: React.ReactNode; title: string }) {
  return (
    <section className="rounded-lg border border-stone-300 bg-white p-5 text-sm shadow-sm">
      <h1 className="text-2xl font-bold">{title}</h1>
      <div className="mt-2 text-stone-700">{children}</div>
    </section>
  );
}
