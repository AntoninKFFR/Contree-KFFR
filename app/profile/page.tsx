"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { ensureProfile, saveProfileUsername } from "@/lib/profiles";
import {
  getUserMultiplayerGames,
  type MultiplayerHistoryGame,
} from "@/lib/multiplayerHistory";
import {
  formatDate,
  getUserGames,
  scoringModeLabel,
  type GameRow,
} from "@/lib/stats";
import { calculateDetailedPlayerStats, multiplayerGamesForDetailedStats, soloGamesForDetailedStats } from "@/lib/detailedPlayerStats";
import { DetailedStatsDashboard } from "@/components/profile/DetailedStatsDashboard";
import { getSupabaseClient } from "@/lib/supabaseClient";
import {
  AppEyebrow,
  AppPage,
  AppSurface,
  appPrimaryActionClass,
  appSecondaryActionClass,
  appInputClass,
} from "@/components/ui/AppShell";

type PageState = "loading" | "ready" | "signed-out" | "unavailable";

export default function ProfilePage() {
  const [games, setGames] = useState<GameRow[]>([]);
  const [multiplayerGames, setMultiplayerGames] = useState<MultiplayerHistoryGame[]>([]);
  const [pageState, setPageState] = useState<PageState>("loading");
  const [session, setSession] = useState<Session | null>(null);
  const [username, setUsername] = useState<string | null>(null);
  const [usernameDraft, setUsernameDraft] = useState("");
  const [isEditingUsername, setIsEditingUsername] = useState(false);
  const [isSavingUsername, setIsSavingUsername] = useState(false);
  const [identityMessage, setIdentityMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [statsMode, setStatsMode] = useState<"solo" | "multiplayer">("solo");

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

      const [nextUsername, gamesResult, multiplayerResult] = await Promise.all([
        ensureProfile(client, nextSession.user),
        getUserGames(client, nextSession.user.id),
        getUserMultiplayerGames(client),
      ]);

      if (isCancelled) return;

      setUsername(nextUsername);
      setUsernameDraft(nextUsername ?? "");

      const historyError = gamesResult.error ?? multiplayerResult.error;
      if (historyError) {
        setErrorMessage(historyError.message);
        setGames([]);
        setMultiplayerGames([]);
      } else {
        setGames((gamesResult.data ?? []) as GameRow[]);
        setMultiplayerGames(multiplayerResult.data);
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

  const soloStats = useMemo(() => calculateDetailedPlayerStats(soloGamesForDetailedStats(games)), [games]);
  const multiplayerStats = useMemo(() => calculateDetailedPlayerStats(multiplayerGamesForDetailedStats(multiplayerGames)), [multiplayerGames]);
  const recentGames = useMemo(() => games.slice(0, 5), [games]);

  async function handleSaveUsername() {
    const client = getSupabaseClient();
    if (!client || !session) return;
    setIsSavingUsername(true);
    setIdentityMessage(null);
    try {
      const result = await saveProfileUsername(client, session.user.id, usernameDraft);
      if (result.error) { setIdentityMessage(result.error); return; }
      setUsername(result.username);
      setUsernameDraft(result.username ?? "");
      setIsEditingUsername(false);
      setIdentityMessage("Pseudo enregistré.");
    } catch {
      setIdentityMessage("Erreur réseau. Réessaie.");
    } finally { setIsSavingUsername(false); }
  }

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
            className={`${appPrimaryActionClass} mt-4`}
            href="/login?next=%2Fprofile"
          >
            Se connecter
          </Link>
        </StatusCard>
      </ProfileShell>
    );
  }

  return (
    <ProfileShell>
      <AppSurface className="p-6 sm:p-7">
        <AppEyebrow>Profil joueur</AppEyebrow>
        <h1 className="mt-2 text-3xl font-black tracking-tight text-stone-50">
          {pageState === "loading" ? "Chargement..." : username ?? "Profil sans pseudo"}
        </h1>
        <p className="mt-1 text-sm text-stone-400">
          {session?.user.email ?? "Session en cours de lecture"}
        </p>
      </AppSurface>

      <AppSurface className="p-6 sm:p-7">
        <AppEyebrow>Compte / Identité</AppEyebrow>
        <h2 className="mt-2 text-lg font-bold text-stone-50">Pseudo</h2>
        {isEditingUsername || !username ? <div className="mt-3 flex flex-wrap items-end gap-2">
          <label className="min-w-48 flex-1 text-sm font-semibold text-stone-200">Ton pseudo
            <input aria-label="Pseudo" className={`${appInputClass} mt-1 w-full`} disabled={isSavingUsername} maxLength={40} onChange={(event) => setUsernameDraft(event.target.value)} value={usernameDraft} />
          </label>
          <button className={appPrimaryActionClass} disabled={isSavingUsername} onClick={handleSaveUsername} type="button">{isSavingUsername ? "Enregistrement…" : "Enregistrer"}</button>
          {username ? <button className={appSecondaryActionClass} disabled={isSavingUsername} onClick={() => { setUsernameDraft(username); setIsEditingUsername(false); setIdentityMessage(null); }} type="button">Annuler</button> : null}
        </div> : <div className="mt-3 flex items-center gap-3"><span className="font-bold text-stone-100">{username}</span><button className={appSecondaryActionClass} onClick={() => { setIsEditingUsername(true); setIdentityMessage(null); }} type="button">Modifier</button></div>}
        {identityMessage ? <p className="mt-3 text-sm text-stone-300" role="status">{identityMessage}</p> : null}
        {!username ? <p className="mt-3 text-sm text-stone-300">Choisis un pseudo pour jouer en multijoueur.</p> : null}
      </AppSurface>

      <div aria-label="Mode des statistiques" className="flex gap-2" role="tablist">
        <button aria-controls="player-stats-panel" aria-selected={statsMode === "solo"} className={statsMode === "solo" ? appPrimaryActionClass : appSecondaryActionClass} id="solo-stats-tab" onClick={() => setStatsMode("solo")} role="tab" type="button">Solo</button>
        <button aria-controls="player-stats-panel" aria-selected={statsMode === "multiplayer"} className={statsMode === "multiplayer" ? appPrimaryActionClass : appSecondaryActionClass} id="multiplayer-stats-tab" onClick={() => setStatsMode("multiplayer")} role="tab" type="button">Multijoueur</button>
      </div>
      <div aria-labelledby={statsMode === "solo" ? "solo-stats-tab" : "multiplayer-stats-tab"} id="player-stats-panel" role="tabpanel">
        {pageState === "loading" ? <AppSurface>Chargement des statistiques...</AppSurface>
          : errorMessage ? <AppSurface>Impossible de charger les statistiques : {errorMessage}</AppSurface>
            : <DetailedStatsDashboard stats={statsMode === "solo" ? soloStats : multiplayerStats} />}
      </div>

      <AppSurface>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-stone-50">Dernières parties</h2>
            <p className="text-xs font-semibold text-stone-400">
              Aperçu des {recentGames.length} plus récentes
            </p>
          </div>
          <Link
            className={appPrimaryActionClass}
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
      </AppSurface>
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
      <p className="rounded-xl border border-red-300/35 bg-red-400/10 px-3 py-2 text-sm text-red-100">
        Impossible de charger les parties: {errorMessage}
      </p>
    );
  }

  if (isLoading) {
    return <p className="text-sm text-stone-400">Chargement des parties...</p>;
  }

  if (games.length === 0) {
    return <p className="text-sm text-stone-400">{noGamesText}</p>;
  }

  return (
    <ul className="space-y-2">
      {games.map((game) => (
        <li className="rounded-xl border border-white/10 bg-white/[0.045] p-3 text-sm" key={game.id}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="font-semibold">{formatDate(game.created_at)}</p>
            <span
              className={`rounded-full px-2.5 py-1 text-xs font-bold ${
                game.won ? "bg-emerald-300/15 text-emerald-100" : "bg-red-300/15 text-red-100"
              }`}
            >
              {game.won ? "Gagné" : "Perdu"}
            </span>
          </div>
          <div className="mt-2 grid gap-1 text-stone-300 sm:grid-cols-2">
            <p>Mode: {scoringModeLabel(game.scoring_mode)}</p>
            <p>Cible: {game.target_score ?? "-"}</p>
            <p>Joueur: {game.player_score ?? "-"}</p>
            <p>Bots: {game.bot_score ?? "-"}</p>
          </div>
          {game.bot_summary ? (
            <p className="mt-2 text-xs font-semibold text-stone-400">
              Bots affrontés: {game.bot_summary}
            </p>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

function ProfileShell({ children }: { children: React.ReactNode }) {
  return <AppPage>{children}</AppPage>;
}

function StatusCard({ children, title }: { children: React.ReactNode; title: string }) {
  return (
    <AppSurface className="p-6 text-sm">
      <h1 className="text-2xl font-bold text-stone-50">{title}</h1>
      <div className="mt-2 text-stone-300">{children}</div>
    </AppSurface>
  );
}
