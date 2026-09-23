"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AppEyebrow, AppPage, AppSurface, appPrimaryActionClass } from "@/components/ui/AppShell";
import { readTrainingProgress, type TrainingProgress } from "@/components/training/progress";

export function TrainingHubClient() {
  const [progress, setProgress] = useState<TrainingProgress | null>(null);
  useEffect(() => setProgress(readTrainingProgress()), []);
  const current = progress?.axes["trick-value"];

  return <AppPage width="medium">
    <header className="py-5 sm:py-8">
      <AppEyebrow>Jouer et apprendre</AppEyebrow>
      <h1 className="mt-2 text-3xl font-black tracking-tight sm:text-4xl">Entraînement</h1>
      <p className="mt-3 max-w-2xl text-[var(--text-secondary)]">Progresse à ton rythme avec des séries courtes de 10 exercices. Aucun compte n’est nécessaire.</p>
    </header>
    <AppSurface className="grid gap-5 sm:grid-cols-[1fr_auto] sm:items-center sm:gap-8">
      <div>
        <AppEyebrow>Premier axe</AppEyebrow>
        <h2 className="mt-2 text-2xl font-black">Valeur d’un pli</h2>
        <p className="mt-2 text-sm text-[var(--text-secondary)]">Observe les quatre cartes et trouve le nombre de points du pli. Obtiens 8 bonnes réponses sur 10 pour débloquer le niveau suivant.</p>
        <div className="mt-5 flex flex-wrap gap-2 text-sm font-semibold">
          <span className="rounded-full border border-[var(--border)] bg-[var(--surface-raised)] px-3 py-1.5">Niveau {current?.unlockedLevel ?? 1} / 2</span>
          <span className="rounded-full border border-[var(--border)] bg-[var(--surface-raised)] px-3 py-1.5">{current?.completedSeries ? `Meilleur résultat : ${current.bestScore} / 10` : "Aucune série terminée"}</span>
        </div>
      </div>
      <Link className={`${appPrimaryActionClass} w-full sm:w-auto`} href="/training/puzzle/trick-value">Démarrer une série</Link>
    </AppSurface>
  </AppPage>;
}
