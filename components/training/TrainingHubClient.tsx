"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AppEyebrow, AppPage, AppSurface, appPrimaryActionClass } from "@/components/ui/AppShell";
import { isTrickValueChallengeUnlocked, isTrickValueLevelUnlocked, readTrainingProgress, type TrainingProgress } from "@/components/training/progress";
import type { TrickValueChallengeMode } from "@/engine/training/trickValueChallenge";

function ChallengeCard({ mode, unlocked, progress }: {
  mode: TrickValueChallengeMode;
  unlocked: boolean;
  progress: TrainingProgress | null;
}) {
  const label = mode === "survival" ? "Survie" : "Blitz";
  const description = mode === "survival"
    ? "3 vies. Le temps diminue à mesure que tu progresses."
    : "60 secondes. Les erreurs consécutives peuvent détruire ta run.";
  const record = progress?.axes["trick-value"].challenges[mode];
  return <article className="flex flex-col rounded-2xl border border-[var(--border)] bg-[var(--surface-raised)] p-4 sm:p-5">
    <h3 className="text-xl font-black">{label}</h3>
    <p className="mt-2 flex-1 text-sm text-[var(--text-secondary)]">{description}</p>
    {unlocked ? <>
      <p className="mt-4 text-sm font-semibold">{record?.completedRuns
        ? `Record : ${record.bestScore} ${mode === "survival" ? record.bestScore === 1 ? "pli" : "plis" : record.bestScore === 1 ? "bonne réponse" : "bonnes réponses"}`
        : "Record à établir"}</p>
      <Link className={`${appPrimaryActionClass} mt-4 w-full`} href={`/training/puzzle/trick-value?mode=${mode}`}>Jouer en {label}</Link>
    </> : <p className="mt-4 text-sm font-semibold">Réussis 8/10 en Confirmé pour débloquer ce mode.</p>}
  </article>;
}

export function TrainingHubClient() {
  const [progress, setProgress] = useState<TrainingProgress | null>(null);
  useEffect(() => setProgress(readTrainingProgress()), []);
  const axis = progress?.axes["trick-value"];
  const level2Unlocked = progress ? isTrickValueLevelUnlocked(progress, 2) : false;
  const challengesUnlocked = progress ? isTrickValueChallengeUnlocked(progress) : false;

  return <AppPage width="wide">
    <header className="py-3 sm:py-5">
      <AppEyebrow>Jouer et apprendre</AppEyebrow>
      <h1 className="mt-2 text-3xl font-black tracking-tight sm:text-4xl">Entraînement</h1>
      <p className="mt-3 max-w-2xl text-[var(--text-secondary)]">Apprends les points des plis, puis tente les défis chronométrés. Aucun compte n’est nécessaire.</p>
    </header>
    <AppSurface>
      <h2 className="text-2xl font-black">Valeur d’un pli</h2>
      <div className="mt-5"><AppEyebrow>Apprentissage</AppEyebrow></div>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <article className="flex flex-col rounded-2xl border border-[var(--border)] bg-[var(--surface-raised)] p-4 sm:p-5">
          <p className="text-xs font-black uppercase tracking-widest text-[var(--ui-kicker)]">Niveau 1</p>
          <h3 className="mt-2 text-xl font-black">Fondamentaux</h3>
          <p className="mt-2 flex-1 text-sm text-[var(--text-secondary)]">Apprendre à compter les points des cartes à l’atout et hors atout.</p>
          <p className="mt-4 text-sm font-semibold">{axis?.levels[1].completedSeries ? `Meilleur score : ${axis.levels[1].bestScore} / 10` : "Toujours accessible"}</p>
          <Link className={`${appPrimaryActionClass} mt-4 w-full`} href="/training/puzzle/trick-value?level=1">Jouer le niveau 1</Link>
        </article>
        <article className="flex flex-col rounded-2xl border border-[var(--border)] bg-[var(--surface-raised)] p-4 sm:p-5">
          <p className="text-xs font-black uppercase tracking-widest text-[var(--ui-kicker)]">Niveau 2</p>
          <h3 className="mt-2 text-xl font-black">Confirmé</h3>
          <p className="mt-2 flex-1 text-sm text-[var(--text-secondary)]">Compter sans aide et gérer aussi le bonus du dernier pli.</p>
          {level2Unlocked ? <>
            <p className="mt-4 text-sm font-semibold">{axis?.levels[2].completedSeries ? `Meilleur score : ${axis.levels[2].bestScore} / 10` : "Débloqué"}</p>
            <Link className={`${appPrimaryActionClass} mt-4 w-full`} href="/training/puzzle/trick-value?level=2">Jouer le niveau 2</Link>
          </> : <>
            <p className="mt-4 text-sm font-semibold">Niveau verrouillé</p>
            <p className="mt-2 text-sm text-[var(--text-secondary)]">Obtiens 8/10 au niveau 1 pour débloquer ce niveau.</p>
          </>}
        </article>
      </div>
      <div className="mt-7"><AppEyebrow>Défis</AppEyebrow></div>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <ChallengeCard mode="survival" progress={progress} unlocked={challengesUnlocked} />
        <ChallengeCard mode="blitz" progress={progress} unlocked={challengesUnlocked} />
      </div>
    </AppSurface>
  </AppPage>;
}
