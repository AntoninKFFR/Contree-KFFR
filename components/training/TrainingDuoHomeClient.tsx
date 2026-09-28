"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import type { Session } from "@supabase/supabase-js";
import { AppEyebrow, AppPage, KffrSuitBackdrop, appInputClass, appPrimaryActionClass, appSecondaryActionClass } from "@/components/ui/AppShell";
import { BID_READING_LEVEL_NAMES, type BidReadingLevel } from "@/engine/training/bidReading";
import { ensureProfile } from "@/lib/profiles";
import { getSupabaseClient } from "@/lib/supabaseClient";
import { createTrainingDuoSession, joinTrainingDuoSession } from "@/lib/trainingDuoApi";
import { duoErrorMessage } from "@/components/training/useTrainingDuoSync";

type HomeState = "loading" | "ready" | "signed-out" | "unavailable" | "profile-missing";
export function TrainingDuoHomeClient() {
  const router = useRouter();
  const [state, setState] = useState<HomeState>("loading");
  const [session, setSession] = useState<Session | null>(null);
  const [level, setLevel] = useState<BidReadingLevel>(1);
  const [code, setCode] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const client = getSupabaseClient();
    if (!client) { setState("unavailable"); return; }
    let alive = true;
    const update = async (next: Session | null) => {
      if (!alive) return;
      setSession(next);
      setError(null);
      if (!next) { setState("signed-out"); return; }
      setState("loading");
      try {
        const name = await ensureProfile(client, next.user);
        if (alive) setState(name ? "ready" : "profile-missing");
      } catch { if (alive) setState("profile-missing"); }
    };
    void client.auth.getSession().then(({ data }) => update(data.session)).catch(() => { if (alive) setState("unavailable"); });
    const { data: { subscription } } = client.auth.onAuthStateChange((_event, next) => { void update(next); });
    return () => { alive = false; subscription.unsubscribe(); };
  }, []);

  const submit = async (event: FormEvent, action: "create" | "join") => {
    event.preventDefault();
    if (!session || pending) return;
    setPending(true); setError(null);
    try {
      const view = action === "create" ? await createTrainingDuoSession(level, session)
        : await joinTrainingDuoSession(code.trim().toUpperCase(), session);
      router.push(`/training/duo/${view.session.id}`);
    } catch (cause) { setError(duoErrorMessage(cause)); setPending(false); }
  };
  return <AppPage width="medium">
    <Link className="coinche-ui-link w-fit text-sm font-bold" href="/training">← Retour à l’entraînement</Link>
    <div className="training-duo-home">
      <header className="training-hero"><KffrSuitBackdrop /><AppEyebrow>Entraînement · Duo</AppEyebrow>
        <h1>Lire les enchères à deux</h1>
        <p>2 joueurs · 10 questions · réponses indépendantes</p>
        <p className="text-sm">Le code de session est le seul moyen de rejoindre ton partenaire.</p>
      </header>
      {state === "loading" ? <p role="status" className="mt-5">Vérification du compte…</p> : null}
      {state === "signed-out" ? <p className="mt-5">Connecte-toi pour jouer à deux. <Link className="coinche-ui-link" href="/login?next=%2Ftraining%2Fduo">Se connecter</Link></p> : null}
      {state === "unavailable" ? <p role="alert" className="mt-5">Le service duo est indisponible pour le moment.</p> : null}
      {state === "profile-missing" ? <p role="alert" className="mt-5">Choisis un pseudo dans ton profil avant de jouer à deux. <Link className="coinche-ui-link" href="/profile">Ouvrir mon profil</Link></p> : null}
      {state === "ready" ? <div className="mt-6 grid min-w-0 gap-4 md:grid-cols-2">
        <form onSubmit={(event) => void submit(event, "create")} className="training-mode-card min-w-0">
          <span className="training-kicker">Ouvrir la table</span><h2 className="text-xl font-black">Créer un duo</h2>
          <p className="text-sm text-[var(--text-secondary)]">Choisis la difficulté de la série partagée.</p>
          <label htmlFor="duo-level" className="mt-3 block text-sm font-bold">Niveau</label>
          <select id="duo-level" className={`${appInputClass} mt-1`} value={level} onChange={(event) => setLevel(Number(event.target.value) as BidReadingLevel)}>
            {([1, 2, 3, 4] as const).map((value) => <option key={value} value={value}>Niveau {value} · {BID_READING_LEVEL_NAMES[value]}</option>)}
          </select>
          <p className="mt-2 text-xs text-[var(--text-secondary)]">Tous les niveaux duo sont accessibles, quel que soit ton déblocage solo.</p>
          <button className={`${appPrimaryActionClass} mt-4 w-full`} type="submit" disabled={pending}>Créer le duo</button>
        </form>
        <form onSubmit={(event) => void submit(event, "join")} className="training-mode-card min-w-0">
          <span className="training-kicker">Retrouver un partenaire</span><h2 className="text-xl font-black">Rejoindre</h2>
          <p className="text-sm text-[var(--text-secondary)]">Entre le code partagé par l’hôte.</p>
          <label htmlFor="duo-code" className="mt-3 block text-sm font-bold">Code de session</label>
          <input id="duo-code" className={`${appInputClass} mt-1 uppercase`} value={code} onChange={(event) => setCode(event.target.value.toUpperCase())}
            maxLength={10} autoComplete="off" required />
          <button className={`${appSecondaryActionClass} mt-4 w-full`} type="submit" disabled={pending || !code.trim()}>Rejoindre</button>
        </form>
      </div> : null}
      {error ? <p role="alert" className="mt-4 text-[var(--danger)]">{error}</p> : null}
    </div>
  </AppPage>;
}
