"use client";

import Link from "next/link";
import { ProfileProgressionCard } from "@/components/progression/ProgressionCard";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { ensureProfile, saveProfileUsername } from "@/lib/profiles";
import {
  getUserMultiplayerGames,
  type MultiplayerHistoryGame,
} from "@/lib/multiplayerHistory";
import {
  getUserGames,
  type GameRow,
} from "@/lib/stats";
import { calculateDetailedPlayerStats, multiplayerGamesForDetailedStats, soloGamesForDetailedStats } from "@/lib/detailedPlayerStats";
import { DetailedStatsDashboard } from "@/components/profile/DetailedStatsDashboard";
import { RatingCard } from "@/components/rating/RatingCard";
import { getMyRatingSummary, type RatingSummary } from "@/lib/rating/queries";
import { getSupabaseClient } from "@/lib/supabaseClient";
import {
  AppEyebrow,
  AppPage,
  AppPageHeader,
  AppSurface,
  appPrimaryActionClass,
  appSecondaryActionClass,
  appInputClass,
  appSegmentedItemClass,
} from "@/components/ui/AppShell";

type PageState = "loading" | "ready" | "signed-out" | "unavailable";

export default function ProfilePage() {
  const router = useRouter();
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
  const [ratingState, setRatingState] = useState<"loading" | "ready" | "error">("loading");
  const [ratingSummary, setRatingSummary] = useState<RatingSummary | null>(null);
  const [ratingRevision, setRatingRevision] = useState(0);
  const ratingUserId = session?.user.id;

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

  useEffect(() => {
    if (!ratingUserId) return;
    const client = getSupabaseClient();
    if (!client) { setRatingState("error"); return; }
    let cancelled = false;
    setRatingState("loading");
    void getMyRatingSummary(client)
      .then((summary) => {
        if (cancelled) return;
        setRatingSummary(summary);
        setRatingState("ready");
      })
      .catch(() => { if (!cancelled) setRatingState("error"); });
    return () => { cancelled = true; };
  }, [ratingUserId, ratingRevision]);

  useEffect(() => {
    if (!ratingUserId || ratingState !== "ready" || !ratingSummary?.pendingMatches) return;
    const client = getSupabaseClient();
    if (!client) return;
    let cancelled = false;
    let timer: ReturnType<typeof setInterval> | null = null;
    const refresh = () => {
      if (document.hidden) return;
      void getMyRatingSummary(client).then((summary) => {
        if (!cancelled) setRatingSummary(summary);
      }).catch(() => { /* Keep the last valid rating; the next tick can retry. */ });
    };
    const syncVisibility = () => {
      if (timer) { clearInterval(timer); timer = null; }
      if (!document.hidden) {
        refresh();
        timer = setInterval(refresh, 5000);
      }
    };
    document.addEventListener("visibilitychange", syncVisibility);
    syncVisibility();
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", syncVisibility);
      if (timer) clearInterval(timer);
    };
  }, [ratingUserId, ratingState, ratingSummary?.pendingMatches]);

  const soloStats = useMemo(() => calculateDetailedPlayerStats(soloGamesForDetailedStats(games)), [games]);
  const multiplayerStats = useMemo(() => calculateDetailedPlayerStats(multiplayerGamesForDetailedStats(multiplayerGames)), [multiplayerGames]);

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
      setRatingRevision((value) => value + 1);
    } catch {
      setIdentityMessage("Erreur réseau. Réessaie.");
    } finally { setIsSavingUsername(false); }
  }

  async function handleSignOut() {
    await getSupabaseClient()?.auth.signOut();
    router.push("/");
    router.refresh();
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
      <div id="profile-username">
        <AppSurface className="!p-4">
          <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
            <div className="min-w-0 basis-64 flex-1">
              <AppEyebrow>Compte / Identité</AppEyebrow>
              <p className="mt-2 text-xs font-semibold text-[var(--text-secondary)]">Pseudo</p>
              <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-2">
                <h1 className="min-w-0 break-words text-2xl font-black tracking-tight text-[var(--text-primary)]">{pageState === "loading" ? "Chargement…" : username ?? "Profil sans pseudo"}</h1>
                {username && !isEditingUsername ? <button className={`${appSecondaryActionClass} !px-3 !py-1.5`} onClick={() => { setIsEditingUsername(true); setIdentityMessage(null); }} type="button">Modifier</button> : null}
              </div>
            </div>
            <button className={`${appSecondaryActionClass} !px-3 !py-1.5 text-[var(--text-secondary)]`} onClick={() => void handleSignOut()} type="button">Se déconnecter</button>
          </div>
          {pageState === "ready" && (isEditingUsername || !username) ? <div className="mt-3 flex max-w-2xl flex-wrap items-end gap-2">
            <label className="min-w-0 basis-48 flex-1 text-sm font-semibold text-[var(--text-secondary)]">Ton pseudo
              <input aria-label="Pseudo" className={`${appInputClass} mt-1 w-full`} disabled={isSavingUsername} maxLength={40} onChange={(event) => setUsernameDraft(event.target.value)} value={usernameDraft} />
            </label>
            <button className={appPrimaryActionClass} disabled={isSavingUsername} onClick={handleSaveUsername} type="button">{isSavingUsername ? "Enregistrement…" : "Enregistrer"}</button>
            {username ? <button className={appSecondaryActionClass} disabled={isSavingUsername} onClick={() => { setUsernameDraft(username); setIsEditingUsername(false); setIdentityMessage(null); }} type="button">Annuler</button> : null}
          </div> : null}
          {identityMessage ? <p className="mt-2 text-sm text-[var(--text-secondary)]" role="status">{identityMessage}</p> : null}
        </AppSurface>
      </div>

      <ProfileProgressionCard />

      <div aria-label="Mode des statistiques" className="flex gap-2" role="tablist">
        <button aria-controls="player-stats-panel" aria-selected={statsMode === "solo"} className={appSegmentedItemClass} id="solo-stats-tab" onClick={() => setStatsMode("solo")} role="tab" type="button">Solo</button>
        <button aria-controls="player-stats-panel" aria-selected={statsMode === "multiplayer"} className={appSegmentedItemClass} id="multiplayer-stats-tab" onClick={() => setStatsMode("multiplayer")} role="tab" type="button">Multijoueur</button>
      </div>
      <div aria-labelledby={statsMode === "solo" ? "solo-stats-tab" : "multiplayer-stats-tab"} id="player-stats-panel" role="tabpanel">
        {pageState === "loading" ? <AppSurface>Chargement des statistiques...</AppSurface>
          : errorMessage ? <AppSurface>Impossible de charger les statistiques : {errorMessage}</AppSurface>
            : <DetailedStatsDashboard stats={statsMode === "solo" ? soloStats : multiplayerStats} />}
      </div>

      {statsMode === "multiplayer" ? (
        ratingState === "ready" && ratingSummary ? <RatingCard state="ready" summary={ratingSummary} /> : <RatingCard state={ratingState === "error" ? "error" : "loading"} />
      ) : null}

      <div>
        <Link className={appSecondaryActionClass} href="/history">Voir mon historique <span aria-hidden="true" className="ml-2">→</span></Link>
      </div>
    </ProfileShell>
  );
}

function ProfileShell({ children }: { children: React.ReactNode }) {
  return <AppPage width="wide">{children}</AppPage>;
}

function StatusCard({ children, title }: { children: React.ReactNode; title: string }) {
  return <AppPageHeader eyebrow="Profil joueur" title={title}>
    <div className="text-sm text-[var(--text-secondary)]">{children}</div>
  </AppPageHeader>;
}
