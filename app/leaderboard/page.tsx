"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { LeaderboardView } from "@/components/rating/LeaderboardView";
import { AppEmptyState, AppPage, AppPageHeader, appPrimaryActionClass } from "@/components/ui/AppShell";
import { getRatingLeaderboard, type LeaderboardEntry } from "@/lib/rating/queries";
import { getSupabaseClient } from "@/lib/supabaseClient";

const PAGE_SIZE = 50;

export default function LeaderboardPage() {
  const [authState, setAuthState] = useState<"checking" | "signed-out" | "authenticated" | "unavailable">("checking");
  const [state, setState] = useState<"loading" | "error" | "ready">("loading");
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [page, setPage] = useState(0);
  const [hasNext, setHasNext] = useState(false);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    const client = getSupabaseClient();
    if (!client) { setAuthState("unavailable"); return; }
    let cancelled = false;
    void client.auth.getSession().then(({ data }) => {
      if (!cancelled) setAuthState(data.session ? "authenticated" : "signed-out");
    }).catch(() => { if (!cancelled) setAuthState("unavailable"); });
    const { data: { subscription } } = client.auth.onAuthStateChange((_event, session) => {
      setAuthState(session ? "authenticated" : "signed-out");
      if (!session) setPage(0);
    });
    return () => { cancelled = true; subscription.unsubscribe(); };
  }, []);

  useEffect(() => {
    if (authState !== "authenticated") return;
    const client = getSupabaseClient();
    if (!client) return;
    let cancelled = false;
    setState("loading");
    void getRatingLeaderboard(client, { limit: PAGE_SIZE + 1, offset: page * PAGE_SIZE })
      .then((result) => {
        if (cancelled) return;
        setEntries(result.slice(0, PAGE_SIZE));
        setHasNext(result.length > PAGE_SIZE);
        setState("ready");
      })
      .catch(() => { if (!cancelled) setState("error"); });
    return () => { cancelled = true; };
  }, [authState, page, retry]);

  return (
    <AppPage width="wide">
      <AppPageHeader description="Seules les parties de Contrée classique comptent pour ce classement." eyebrow="Elo officiel" title="Classement" />
      {authState === "checking" ? <p role="status">Chargement du classement…</p>
        : authState === "signed-out" ? (
          <AppEmptyState title="Le classement t’attend" description="Connecte-toi pour consulter les joueurs classés.">
            <Link className={appPrimaryActionClass} href="/login?next=%2Fleaderboard">Se connecter</Link>
          </AppEmptyState>
        ) : authState === "unavailable" ? (
          <p className="coinche-notice" data-tone="warning" role="alert">Impossible de charger le classement pour le moment.</p>
        ) : (
          <LeaderboardView entries={entries} hasNext={hasNext} onNext={() => setPage((value) => value + 1)} onPrevious={() => setPage((value) => Math.max(0, value - 1))} onRetry={() => setRetry((value) => value + 1)} page={page} state={state} />
        )}
    </AppPage>
  );
}
