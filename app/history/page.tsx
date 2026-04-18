"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  formatDate,
  getUserGames,
  scoringModeLabel,
  type GameRow,
} from "@/lib/stats";
import { getSupabaseClient } from "@/lib/supabaseClient";

type PageState = "loading" | "ready" | "signed-out" | "unavailable";

export default function HistoryPage() {
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [games, setGames] = useState<GameRow[]>([]);
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

      const { data, error } = await getUserGames(client, session.user.id);

      if (isCancelled) return;

      if (error) {
        setErrorMessage(error.message);
        setGames([]);
      } else {
        setGames((data ?? []) as GameRow[]);
      }

      setPageState("ready");
    }

    loadHistory();

    const {
      data: { subscription },
    } = client.auth.onAuthStateChange(() => {
      loadHistory();
    });

    return () => {
      isCancelled = true;
      subscription.unsubscribe();
    };
  }, []);

  return (
    <main className="min-h-dvh bg-[#f4f1e8] px-4 py-6 text-stone-950">
      <div className="mx-auto flex max-w-4xl flex-col gap-4">
        <div className="flex items-center justify-between gap-3">
          <Link className="text-sm font-semibold text-emerald-900 hover:underline" href="/profile">
            Retour au profil
          </Link>
          <Link className="text-sm font-semibold text-emerald-900 hover:underline" href="/">
            Retour au jeu
          </Link>
        </div>

        <section className="rounded-lg border border-stone-300 bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-emerald-800">
            Historique
          </p>
          <h1 className="mt-1 text-2xl font-bold">Toutes les parties</h1>
          <p className="mt-1 text-sm text-stone-600">
            Les parties les plus récentes sont affichées en premier.
          </p>
        </section>

        <section className="rounded-lg border border-stone-300 bg-white p-5 shadow-sm">
          {pageState === "unavailable" ? (
            <StatusMessage>
              Supabase est indisponible. Vérifie la configuration dans .env.local.
            </StatusMessage>
          ) : null}

          {pageState === "signed-out" ? (
            <StatusMessage>
              Connecte-toi pour voir ton historique.
              <Link
                className="mt-4 inline-flex rounded-md bg-emerald-800 px-3 py-2 text-sm font-semibold text-white"
                href="/login"
              >
                Se connecter
              </Link>
            </StatusMessage>
          ) : null}

          {pageState === "loading" ? (
            <StatusMessage>Chargement de l&apos;historique...</StatusMessage>
          ) : null}

          {errorMessage ? (
            <p className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-900">
              Impossible de charger l&apos;historique: {errorMessage}
            </p>
          ) : null}

          {pageState === "ready" && !errorMessage && games.length === 0 ? (
            <StatusMessage>Aucune partie enregistrée pour le moment.</StatusMessage>
          ) : null}

          {pageState === "ready" && !errorMessage && games.length > 0 ? (
            <ul className="space-y-2">
              {games.map((game) => (
                <li
                  className="rounded-md border border-stone-200 bg-stone-50 p-3 text-sm"
                  key={game.id}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-semibold">{formatDate(game.created_at)}</p>
                    <span
                      className={`rounded-md px-2 py-1 text-xs font-bold ${
                        game.won
                          ? "bg-emerald-100 text-emerald-900"
                          : "bg-red-100 text-red-900"
                      }`}
                    >
                      {game.won ? "Gagné" : "Perdu"}
                    </span>
                  </div>
                  <div className="mt-2 grid gap-1 text-stone-700 sm:grid-cols-2">
                    <p>Mode: {scoringModeLabel(game.scoring_mode)}</p>
                    <p>Joueur: {game.player_score ?? "-"}</p>
                    <p>Bot: {game.bot_score ?? "-"}</p>
                    <p>Cible: {game.target_score ?? "-"}</p>
                  </div>
                </li>
              ))}
            </ul>
          ) : null}
        </section>
      </div>
    </main>
  );
}

function StatusMessage({ children }: { children: React.ReactNode }) {
  return <div className="text-sm text-stone-700">{children}</div>;
}
