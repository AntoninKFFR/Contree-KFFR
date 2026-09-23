"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { SUIT_LABELS, SUIT_SYMBOLS } from "@/engine/cards";
import { formatContractMode } from "@/engine/contractMode";
import { generateTrickValueSeries, TRICK_VALUE_SERIES_LENGTH, type TrickValueExercise } from "@/engine/training/trickValue";
import type { Card } from "@/engine/types";
import { AppEyebrow, AppPage, AppSurface, appPrimaryActionClass, appSecondaryActionClass } from "@/components/ui/AppShell";
import { NumberPad } from "@/components/training/NumberPad";
import { readTrainingProgress, recordTrickValueSeries, saveTrainingProgress, trickValueSeriesSeed, type TrainingProgress } from "@/components/training/progress";

function TrainingCard({ card, index }: { card: Card; index: number }) {
  const red = card.suit === "hearts" || card.suit === "diamonds";
  return <li className="min-w-0 text-center">
    <p className="mb-2 text-xs font-semibold text-[var(--text-secondary)]">Carte {index + 1}</p>
    <div aria-label={`${card.rank} de ${SUIT_LABELS[card.suit]}`} className={`coinche-card relative mx-auto flex aspect-[0.7] w-full max-w-20 items-center justify-center rounded-lg border bg-[#fffef9] shadow-lg ${red ? "border-red-200 text-red-700" : "border-stone-300 text-stone-900"}`}>
      <span className="absolute left-1.5 top-1.5 text-lg font-bold leading-none">{card.rank}</span>
      <span aria-hidden="true" className="text-3xl sm:text-4xl">{SUIT_SYMBOLS[card.suit]}</span>
      <span className="absolute bottom-1.5 right-1.5 text-lg font-bold leading-none">{card.rank}</span>
    </div>
  </li>;
}

export function TrainingPuzzleClient() {
  const [progress, setProgress] = useState<TrainingProgress | null>(null);
  const [level, setLevel] = useState<1 | 2>(1);
  const [series, setSeries] = useState<TrickValueExercise[] | null>(null);
  const [index, setIndex] = useState(0);
  const [answer, setAnswer] = useState("");
  const [feedback, setFeedback] = useState<boolean | null>(null);
  const [score, setScore] = useState(0);
  const [finished, setFinished] = useState(false);

  useEffect(() => {
    const saved = readTrainingProgress();
    const initialLevel = saved.axes["trick-value"].unlockedLevel;
    setProgress(saved);
    setLevel(initialLevel);
    setSeries(generateTrickValueSeries(trickValueSeriesSeed(initialLevel, saved.axes["trick-value"].completedSeries)));
  }, []);

  const startSeries = (nextLevel: 1 | 2, saved: TrainingProgress) => {
    setLevel(nextLevel);
    setSeries(generateTrickValueSeries(trickValueSeriesSeed(nextLevel, saved.axes["trick-value"].completedSeries)));
    setIndex(0);
    setAnswer("");
    setFeedback(null);
    setScore(0);
    setFinished(false);
  };

  const exercise = series?.[index];
  const submit = () => {
    if (!exercise || feedback !== null || !answer) return;
    setFeedback(Number(answer) === exercise.answer);
  };
  const next = () => {
    if (!series || !progress || feedback === null) return;
    const nextScore = score + Number(feedback);
    if (index === TRICK_VALUE_SERIES_LENGTH - 1) {
      const updated = recordTrickValueSeries(progress, nextScore);
      saveTrainingProgress(updated);
      setProgress(updated);
      setScore(nextScore);
      setFinished(true);
    } else {
      setScore(nextScore);
      setIndex(index + 1);
      setAnswer("");
      setFeedback(null);
    }
  };

  if (!progress || !series || !exercise) {
    return <AppPage><AppSurface><p role="status">Préparation de la série…</p></AppSurface></AppPage>;
  }

  if (finished) {
    const best = progress.axes["trick-value"].bestScore;
    const nextUnlocked = progress.axes["trick-value"].unlockedLevel === 2;
    return <AppPage width="medium">
      <AppSurface className="mx-auto w-full max-w-xl py-8 text-center sm:py-12">
        <AppEyebrow>Série terminée</AppEyebrow>
        <h1 className="mt-3 text-3xl font-black">Résultat</h1>
        <p className="mt-5 text-5xl font-black text-[var(--accent)]">{score} / {TRICK_VALUE_SERIES_LENGTH}</p>
        <p className="mt-2 text-lg font-semibold">{score * 10} % de bonnes réponses</p>
        <p className="mt-4 text-sm text-[var(--text-secondary)]">Meilleur résultat local : {best} / 10</p>
        <p className="mt-3 font-bold" role="status">{level === 2 ? "Niveau 2 terminé." : score >= 8 ? "Niveau 2 débloqué !" : nextUnlocked ? "Le niveau 2 reste disponible." : "Atteins 8 / 10 pour débloquer le niveau 2."}</p>
        <div className="mt-7 flex flex-col justify-center gap-2 sm:flex-row">
          <button className={appPrimaryActionClass} onClick={() => startSeries(level, progress)} type="button">Recommencer</button>
          {nextUnlocked && level === 1 ? <button className={appSecondaryActionClass} onClick={() => startSeries(2, progress)} type="button">Essayer le niveau 2</button> : null}
          <Link className={appSecondaryActionClass} href="/training">Retour au hub</Link>
        </div>
      </AppSurface>
    </AppPage>;
  }

  return <AppPage width="medium">
    <Link className="coinche-ui-link w-fit text-sm font-bold" href="/training">← Retour à l’entraînement</Link>
    <AppSurface className="mx-auto w-full max-w-2xl">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <AppEyebrow>Niveau {level} · Valeur d’un pli</AppEyebrow>
          <h1 className="mt-2 text-2xl font-black sm:text-3xl">Combien vaut ce pli ?</h1>
        </div>
        <span aria-label={`Exercice ${index + 1} sur ${TRICK_VALUE_SERIES_LENGTH}`} className="rounded-full border border-[var(--border)] bg-[var(--surface-raised)] px-3 py-1.5 text-sm font-bold">{index + 1} / {TRICK_VALUE_SERIES_LENGTH}</span>
      </div>
      <p className="mt-3 text-sm text-[var(--text-secondary)]">Contrat : {formatContractMode(exercise.contractMode)}{exercise.isLastTrick ? ` · Dernier pli : bonus de ${exercise.bonusPoints} points` : ""}</p>
      <ol aria-label="Cartes du pli" className="mt-6 grid grid-cols-4 gap-1.5 sm:gap-3">
        {exercise.cards.map((played, cardIndex) => <TrainingCard card={played.card} index={cardIndex} key={`${played.playerId}-${cardIndex}`} />)}
      </ol>
      <div className="mt-7">
        <NumberPad disabled={feedback !== null} onChange={setAnswer} onSubmit={submit} value={answer} />
        {feedback !== null ? <div aria-live="polite" className="mx-auto mt-5 max-w-xs rounded-xl border border-[var(--border)] bg-[var(--surface-raised)] p-4 text-center">
          <p className={`font-black ${feedback ? "text-[var(--success)]" : "text-[var(--danger)]"}`}>{feedback ? "Bonne réponse !" : "Pas encore."}</p>
          <p className="mt-1">Ce pli vaut <strong>{exercise.answer} points</strong>.</p>
          <button className={`${appPrimaryActionClass} mt-4 min-h-12 w-full`} onClick={next} type="button">{index === TRICK_VALUE_SERIES_LENGTH - 1 ? "Voir le résultat" : "Exercice suivant"}</button>
        </div> : null}
      </div>
    </AppSurface>
  </AppPage>;
}
