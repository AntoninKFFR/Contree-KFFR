"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { COUNTING_PASSING_SCORE, COUNTING_SERIES_LENGTH } from "@/engine/training/counting";
import { AppEyebrow, AppPage, AppSurface, appPrimaryActionClass } from "@/components/ui/AppShell";
import { COUNTING_AXIS_COPY, formatScore } from "@/components/training/countingCopy";
import {
  COUNTING_AXIS_IDS, isCountingLevelUnlocked, isTrickValueLevelUnlocked, readTrainingProgress, type CountingAxisId,
  type CountingLevel, type TrainingProgress,
} from "@/components/training/progress";

const COUNTING_LEVELS: readonly CountingLevel[] = [1, 2, 3];

function CountingAxisLevels({ axisId, progress }: { axisId: CountingAxisId; progress: TrainingProgress | null }) {
  const copy = COUNTING_AXIS_COPY[axisId];
  return <section aria-labelledby={`training-axis-${axisId}`} className="mt-4">
    <h2 className="text-2xl font-black" id={`training-axis-${axisId}`}>{copy.title}</h2>
    <p className="mt-2 text-sm text-[var(--text-secondary)]">{copy.description}</p>
    <div className="mt-4 grid gap-3 sm:grid-cols-3">
      {COUNTING_LEVELS.map((level) => {
        const unlocked = progress ? isCountingLevelUnlocked(progress, axisId, level) : level === 1;
        const saved = progress?.axes[axisId].levels[level];
        return <article className="flex flex-col rounded-2xl border border-[var(--border)] bg-[var(--surface-raised)] p-4" key={level}>
          <p className="text-xs font-black uppercase tracking-widest text-[var(--ui-kicker)]">Niveau {level}</p>
          <h3 className="mt-2 text-lg font-black">{copy.levels[level].name}</h3>
          <p className="mt-2 flex-1 text-sm text-[var(--text-secondary)]">{copy.levels[level].description}</p>
          {unlocked ? <>
            <p className="mt-4 text-sm font-semibold">
              {saved?.completedSeries ? `Meilleur score : ${formatScore(saved.bestScore)} / ${COUNTING_SERIES_LENGTH}` : "Accessible"}
            </p>
            <Link aria-label={`Commencer ${copy.title}, niveau ${level}`} className={`${appPrimaryActionClass} mt-4 w-full`} href={`/training/puzzle/${axisId}?level=${level}`}>Commencer</Link>
          </> : <>
            <p className="mt-4 text-sm font-semibold">Niveau verrouillé</p>
            <p className="mt-2 text-sm text-[var(--text-secondary)]">Obtiens {COUNTING_PASSING_SCORE}/{COUNTING_SERIES_LENGTH} au niveau {level - 1} pour le débloquer.</p>
          </>}
        </article>;
      })}
    </div>
  </section>;
}

export function TrainingHubClient() {
  const [progress, setProgress] = useState<TrainingProgress | null>(null);
  useEffect(() => setProgress(readTrainingProgress()), []);
  const axis = progress?.axes["trick-value"];
  const level2Unlocked = progress ? isTrickValueLevelUnlocked(progress, 2) : false;

  return <AppPage width="medium">
    <header className="py-5 sm:py-8">
      <AppEyebrow>Jouer et apprendre</AppEyebrow>
      <h1 className="mt-2 text-3xl font-black tracking-tight sm:text-4xl">Entraînement</h1>
      <p className="mt-3 max-w-2xl text-[var(--text-secondary)]">Choisis un exercice et progresse niveau par niveau. Aucun compte n’est nécessaire.</p>
    </header>
    <AppSurface>
      <AppEyebrow>Premier axe</AppEyebrow>
      <h2 className="mt-2 text-2xl font-black">Valeur d’un pli</h2>
      <p className="mt-2 text-sm text-[var(--text-secondary)]">Observe quatre cartes et trouve combien de points vaut le pli.</p>
      <div className="mt-6 grid gap-3 sm:grid-cols-2">
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
    </AppSurface>
    <AppSurface className="mt-4">
      <AppEyebrow>Compter la donne</AppEyebrow>
      {COUNTING_AXIS_IDS.map((axisId) => <CountingAxisLevels axisId={axisId} key={axisId} progress={progress} />)}
    </AppSurface>
  </AppPage>;
}
