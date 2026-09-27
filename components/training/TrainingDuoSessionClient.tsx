"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { BidReadingForm } from "@/components/training/BidReadingForm";
import { BidReadingDoctrineCorrection, BidReadingPublicAuction } from "@/components/training/BidReadingShared";
import { TRAINING_BID_ROLES } from "@/components/training/bidRoles";
import { useTrainingDuoSync, duoErrorMessage } from "@/components/training/useTrainingDuoSync";
import { AppEyebrow, AppPage, AppSurface, appDangerActionClass, appPrimaryActionClass, appSecondaryActionClass } from "@/components/ui/AppShell";
import { BID_READING_ASSERTION_LABELS, BID_READING_LEVEL_NAMES, type BidReadingAnswer } from "@/engine/training/bidReading";
import { sendTrainingDuoIntentWithRetry } from "@/lib/trainingDuoApi";
import type { TrainingDuoIntent, TrainingDuoView } from "@/lib/trainingDuoTypes";

type Action = (intent: TrainingDuoIntent) => void;
const duoPath = "/training/duo";
function DuoLinks() { return <div className="mt-6 flex flex-wrap gap-2">
  <Link className={appPrimaryActionClass} href={duoPath}>Refaire un duo</Link>
  <Link className={appSecondaryActionClass} href="/training">Retour à l’entraînement</Link>
  <Link className={appSecondaryActionClass} href="/training/conventions/bidding">Voir les conventions</Link>
</div>; }

export function TrainingDuoSessionView({ view, pending, onAction }: { view: TrainingDuoView; pending: boolean; onAction: Action }) {
  const { session, participants, viewerSlot, exercise } = view;
  const viewer = participants.find((participant) => participant.slot === viewerSlot);
  const partner = participants.find((participant) => participant.slot !== viewerSlot);
  const questionHeading = useRef<HTMLHeadingElement>(null);
  const previousIndex = useRef(session.currentIndex);
  useEffect(() => {
    if (session.status === "active" && session.currentIndex !== previousIndex.current) questionHeading.current?.focus();
    previousIndex.current = session.currentIndex;
  }, [session.currentIndex, session.status]);

  if (session.status === "cancelled") return <AppSurface><AppEyebrow>Duo terminé</AppEyebrow>
    <h1 className="mt-2 text-3xl font-black">Session interrompue</h1>
    <p className="mt-3 text-sm">Cette session a été annulée. Tu peux créer un nouveau duo.</p><DuoLinks />
  </AppSurface>;
  if (session.status === "completed") {
    const result = view.result;
    const myScore = viewerSlot === 0 ? result?.scoreA : result?.scoreB;
    const partnerScore = viewerSlot === 0 ? result?.scoreB : result?.scoreA;
    return <AppSurface><AppEyebrow>Lire les enchères à deux</AppEyebrow><h1 className="mt-2 text-3xl font-black">Résultat</h1>
      <dl className="mt-5 grid gap-3 sm:grid-cols-3">
        <div><dt className="text-sm">Ton score</dt><dd className="text-3xl font-black">{myScore} / 10</dd></div>
        <div><dt className="text-sm">Score de {partner?.displayName ?? "ton partenaire"}</dt><dd className="text-3xl font-black">{partnerScore} / 10</dd></div>
        <div><dt className="text-sm">Réussites communes</dt><dd className="text-3xl font-black">{result?.commonSuccesses} / 10</dd></div>
      </dl>
      <p className="mt-5 text-sm text-[var(--text-secondary)]">Cette session duo ne modifie pas ta progression ni tes records.</p><DuoLinks />
    </AppSurface>;
  }

  if (session.status === "lobby") {
    const canStart = viewer?.isHost && participants.length === 2 && participants.every((participant) => participant.isReady && participant.isConnected);
    return <AppSurface>
      <AppEyebrow>Lire les enchères à deux</AppEyebrow><h1 className="mt-2 text-3xl font-black">Salon duo</h1>
      <p className="mt-2 text-sm">Niveau {session.level} · {BID_READING_LEVEL_NAMES[session.level]}</p>
      <div className="mt-5 rounded-xl border border-[var(--border)] p-4"><p className="text-sm font-bold">Code de session</p>
        <p className="mt-1 break-all font-mono text-2xl font-black tracking-widest">{session.code}</p>
        <button className={`${appSecondaryActionClass} mt-3`} type="button" onClick={() => { if (session.code && navigator.clipboard) void navigator.clipboard.writeText(session.code); }}>Copier le code</button>
      </div>
      <div className="mt-5 grid gap-3 sm:grid-cols-2" aria-label="Participants">
        {[0, 1].map((slot) => {
          const participant = participants.find((item) => item.slot === slot);
          return <div key={slot} className="min-w-0 rounded-xl border border-[var(--border)] p-4">
            <p className="font-black">Place {slot === 0 ? "A" : "B"} · {participant?.displayName ?? "En attente d’un joueur"}{slot === viewerSlot ? " · Toi" : ""}</p>
            {participant ? <p className="mt-2 text-sm">{participant.isHost ? "Hôte · " : ""}{participant.isReady ? "Prêt" : "Pas prêt"} · {participant.isConnected ? "En ligne" : "Hors ligne"}</p> : null}
          </div>;
        })}
      </div>
      <div className="mt-5 flex flex-wrap gap-2">
        <button className={appPrimaryActionClass} type="button" disabled={pending} onClick={() => onAction({ type: "set-ready", ready: !viewer?.isReady })}>{viewer?.isReady ? "Annuler prêt" : "Je suis prêt"}</button>
        {viewer?.isHost ? <button className={appPrimaryActionClass} type="button" disabled={pending || !canStart} onClick={() => onAction({ type: "start" })}>Démarrer</button> : null}
        <button className={appDangerActionClass} type="button" disabled={pending} onClick={() => onAction({ type: viewer?.isHost ? "cancel" : "leave" })}>{viewer?.isHost ? "Annuler le duo" : "Quitter"}</button>
      </div>
      {!viewer?.isHost ? <p role="status" className="mt-3 text-sm">En attente du démarrage par l’hôte.</p> : null}
      {viewer?.isHost && partner && !partner.isConnected ? <p role="status" className="mt-3 text-sm">Ton partenaire doit être connecté pour démarrer.</p> : null}
    </AppSurface>;
  }

  if (!exercise) return <AppSurface><p role="status">Chargement de la question…</p></AppSurface>;
  const isRevealed = exercise.kind === "revealed" && session.questionPhase === "revealed";
  return <AppSurface className="min-w-0">
    <div className="flex flex-wrap items-start justify-between gap-2"><div><AppEyebrow>Lire les enchères à deux · Niveau {session.level}</AppEyebrow>
      <h1 ref={questionHeading} tabIndex={-1} className="mt-1 text-2xl font-black">Exercice {session.currentIndex + 1} / 10</h1>
      <p className="mt-1 text-sm text-[var(--text-secondary)]">{BID_READING_LEVEL_NAMES[session.level]}</p></div>
      <span className="rounded-full border border-[var(--border)] px-3 py-1 text-sm font-bold">{session.currentIndex + 1} / 10</span></div>
    <div className="mt-4"><BidReadingPublicAuction exercise={exercise} /></div>
    <p className="mt-4 mb-3 font-semibold">Que peux-tu affirmer sur l’enchère de {exercise.playerNames[exercise.targetPlayerId]} ({TRAINING_BID_ROLES[exercise.targetPlayerId]}) ?</p>
    {!isRevealed && !viewer?.hasAnswered ? <BidReadingForm key={session.currentIndex} assertionChoices={exercise.assertionChoices}
      disabled={pending} onAnswer={(answer: BidReadingAnswer) => onAction({ type: "submit-answer", answer })} /> : null}
    {!isRevealed && viewer?.hasAnswered ? <div role="status" aria-live="polite" className="rounded-xl border border-[var(--border)] p-4">
      <p className="font-black">Réponse enregistrée</p><p className="mt-2">En attente de ton partenaire…</p>
      {partner && !partner.isConnected ? <p className="mt-2">Ton partenaire est hors ligne. La session reprendra à son retour.</p> : null}
    </div> : null}
    {isRevealed ? <section aria-label="Correction de la lecture" aria-live="polite" className="rounded-xl border border-[var(--border)] bg-[var(--surface-raised)] p-4">
      <h2 className="text-xl font-black">Correction</h2>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">{exercise.answers.map((answer) => {
        const participant = participants.find((item) => item.slot === answer.slot);
        return <div key={answer.slot} className="min-w-0 rounded-xl border border-[var(--border)] p-3">
          <h3 className="font-black">{answer.slot === viewerSlot ? "Toi" : participant?.displayName ?? "Partenaire"}</h3>
          <p className="mt-1 text-sm">{answer.answer.selectedAssertionIds.length ? answer.answer.selectedAssertionIds.map((id) => BID_READING_ASSERTION_LABELS[id]).join(" ; ") : "Aucune affirmation"}</p>
          <p className={`mt-2 font-bold ${answer.correct ? "text-[var(--success)]" : "text-[var(--danger)]"}`}>{answer.correct ? "Bonne réponse" : "Mauvaise réponse"} · {answer.score} / 1</p>
        </div>;
      })}</div>
      <BidReadingDoctrineCorrection promise={exercise.promise} illustrationHand={exercise.illustrationHand} />
      {viewer?.readyForNext ? <p role="status" className="mt-4">Ton partenaire regarde encore la correction.</p>
        : <button className={`${appPrimaryActionClass} mt-4`} type="button" disabled={pending} onClick={() => onAction({ type: "ready-next" })}>
          {session.currentIndex === 9 ? "Prêt pour le résultat" : "Prêt pour la question suivante"}</button>}
    </section> : null}
    <Link className="coinche-ui-link mt-4 inline-block text-sm font-bold" href="/training/conventions/bidding">Voir les conventions</Link>
    <div className="mt-5 border-t border-[var(--border)] pt-4"><button className={appDangerActionClass} type="button" disabled={pending}
      onClick={() => onAction({ type: "leave" })}>Quitter la session et l’interrompre</button></div>
  </AppSurface>;
}

export function TrainingDuoSessionClient({ sessionId }: { sessionId: string }) {
  const router = useRouter();
  const { pageState, session, view, error, setError, acceptView, refresh, markTerminalError } = useTrainingDuoSync(sessionId);
  const [pending, setPending] = useState(false);
  const pendingRef = useRef(false);
  const action = async (intent: TrainingDuoIntent) => {
    if (!session || !view || pendingRef.current || pageState !== "ready") return;
    pendingRef.current = true; setPending(true); setError(null);
    try {
      const next = await sendTrainingDuoIntentWithRetry(view, intent, session);
      if (next === null) { router.replace(duoPath); return; }
      acceptView(next);
    } catch (cause) {
      if (markTerminalError(cause)) {
        await refresh();
      } else setError(duoErrorMessage(cause));
    }
    finally { pendingRef.current = false; setPending(false); }
  };
  return <AppPage width="wide">
    <Link className="coinche-ui-link w-fit text-sm font-bold" href={duoPath}>← Retour au duo</Link>
    {pageState === "loading" ? <AppSurface><p role="status">Chargement de la session…</p></AppSurface> : null}
    {pageState === "signed-out" ? <AppSurface><h1 className="text-2xl font-black">Connexion requise</h1>
      <Link className={`${appPrimaryActionClass} mt-4`} href={`/login?next=${encodeURIComponent(`/training/duo/${sessionId}`)}`}>Se connecter</Link></AppSurface> : null}
    {pageState === "missing" ? <AppSurface><h1 className="text-2xl font-black">Session introuvable ou inaccessible.</h1><DuoLinks /></AppSurface> : null}
    {pageState === "expired" ? <AppSurface><h1 className="text-2xl font-black">Cette session a expiré.</h1><DuoLinks /></AppSurface> : null}
    {pageState === "unsupported" ? <AppSurface><h1 className="text-2xl font-black">Cette session utilise une version qui n’est plus prise en charge.</h1><DuoLinks /></AppSurface> : null}
    {pageState === "unavailable" ? <AppSurface><h1 className="text-2xl font-black">Session momentanément indisponible</h1>
      {session ? <button className={`${appSecondaryActionClass} mt-4`} type="button" onClick={() => void refresh()}>Actualiser</button> : null}<DuoLinks /></AppSurface> : null}
    {error && pageState === "ready" ? <div role="alert" className="flex flex-wrap items-center gap-3 rounded-xl border border-[var(--danger)] p-3 text-sm">
      <span>{error}</span><button className={appSecondaryActionClass} type="button" onClick={() => void refresh()}>Actualiser</button></div> : null}
    {pageState === "ready" && view ? <TrainingDuoSessionView view={view} pending={pending} onAction={(intent) => void action(intent)} /> : null}
  </AppPage>;
}
