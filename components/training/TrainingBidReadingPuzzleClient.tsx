"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { BidReadingForm } from "@/components/training/BidReadingForm";
import { TrainingResultSummary, TrainingSessionHeader } from "@/components/training/TrainingUI";
import { BidReadingDoctrineCorrection, BidReadingPublicAuction } from "@/components/training/BidReadingShared";
import { TRAINING_BID_ROLES } from "@/components/training/bidRoles";
import {
  bidReadingSeriesSeed, isBidReadingLevelUnlocked, readTrainingProgress,
  recordBidReadingSeries, saveTrainingProgress, type TrainingProgress,
} from "@/components/training/progress";
import { AppEyebrow, AppPage, AppSurface, appPrimaryActionClass, appSecondaryActionClass } from "@/components/ui/AppShell";
import {
  BID_READING_ASSERTION_LABELS, BID_READING_AXIS_VERSION, BID_READING_LEVEL_NAMES,
  BID_READING_SERIES_LENGTH, generateBidReadingSeries,
  gradeBidReadingExercise, type BidReadingAnswer, type BidReadingExercise, type BidReadingLevel,
} from "@/engine/training/bidReading";
import { generatorVersion } from "@/engine/training/generator";

export function TrainingBidReadingPuzzleClient({ level }: { level: BidReadingLevel }) {
  const [progress, setProgress] = useState<TrainingProgress | null>(null);
  const [series, setSeries] = useState<BidReadingExercise[] | null>(null);
  const [locked, setLocked] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [index, setIndex] = useState(0);
  const [answer, setAnswer] = useState<BidReadingAnswer | null>(null);
  const [grade, setGrade] = useState<{ correct: boolean; score: 0 | 1 } | null>(null);
  const [score, setScore] = useState(0);
  const [finished, setFinished] = useState(false);
  const [newlyUnlockedLevel, setNewlyUnlockedLevel] = useState<number | null>(null);
  const submittedRef = useRef(false);
  const nextButtonRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => { if (grade) nextButtonRef.current?.focus(); }, [grade]);
  useEffect(() => {
    const saved = readTrainingProgress();
    setProgress(saved);
    if (!isBidReadingLevelUnlocked(saved, level)) { setLocked(true); return; }
    try {
      const seed = bidReadingSeriesSeed(saved, level);
      setSeries(generateBidReadingSeries({ seed, level, generatorVersion, axisVersion: BID_READING_AXIS_VERSION }));
    } catch { setError("Impossible de préparer cette série de lecture des enchères."); }
  }, [level]);

  const exercise = series?.[index];
  const submit = (submitted: BidReadingAnswer) => {
    if (!exercise || submittedRef.current) return;
    submittedRef.current = true;
    setAnswer(submitted);
    setGrade(gradeBidReadingExercise(exercise, submitted));
  };
  const next = () => {
    if (!series || !progress || !grade) return;
    const nextScore = score + grade.score;
    if (index === BID_READING_SERIES_LENGTH - 1) {
      const previousUnlocked = progress.axes["bid-reading"].unlockedLevel;
      const updated = recordBidReadingSeries(progress, level, nextScore);
      setNewlyUnlockedLevel(updated.axes["bid-reading"].unlockedLevel > previousUnlocked
        ? updated.axes["bid-reading"].unlockedLevel : null);
      saveTrainingProgress(updated);
      setProgress(updated); setScore(nextScore); setFinished(true);
    } else {
      setScore(nextScore); setIndex(index + 1); setAnswer(null); setGrade(null); submittedRef.current = false;
    }
  };
  const replay = () => {
    if (!progress) return;
    try {
      setSeries(generateBidReadingSeries({ seed: bidReadingSeriesSeed(progress, level), level,
        generatorVersion, axisVersion: BID_READING_AXIS_VERSION }));
      setError(null); setIndex(0); setAnswer(null); setGrade(null); setScore(0);
      setFinished(false); setNewlyUnlockedLevel(null); submittedRef.current = false;
    } catch { setError("Impossible de préparer cette série de lecture des enchères."); }
  };

  if (locked) return <AppPage width="narrow"><AppSurface className="py-8 text-center">
    <AppEyebrow>Lire les enchères</AppEyebrow><h1 className="mt-3 text-2xl font-black">Niveau {level} verrouillé</h1>
    <p className="mt-3 text-[var(--text-secondary)]">Obtiens 8/10 au niveau précédent pour débloquer ce niveau.</p>
    <Link className={`${appPrimaryActionClass} mt-6`} href="/training">Retour à l’entraînement</Link>
  </AppSurface></AppPage>;
  if (error) return <AppPage width="narrow"><AppSurface><p role="alert">{error}</p><Link href="/training">Retour à l’entraînement</Link></AppSurface></AppPage>;
  if (!progress || !series || !exercise) return <AppPage width="narrow"><AppSurface><p role="status">Préparation de la série…</p></AppSurface></AppPage>;
  if (finished) return <AppPage width="medium"><TrainingResultSummary title="Lire les enchères" level={level} levelName={BID_READING_LEVEL_NAMES[level]} score={score} total={BID_READING_SERIES_LENGTH}
    best={`Meilleur score local : ${progress.axes["bid-reading"].levels[level].bestScore} / 10`} unlocked={newlyUnlockedLevel !== null ? `Niveau ${newlyUnlockedLevel} débloqué !` : undefined}>
      <button className={appPrimaryActionClass} onClick={replay} type="button">Rejouer</button>
      {newlyUnlockedLevel !== null ? <Link className={appSecondaryActionClass} href={`/training/puzzle/bid-reading?level=${newlyUnlockedLevel}`}>Niveau {newlyUnlockedLevel}</Link> : null}
      <Link className={appSecondaryActionClass} href="/training">Retour à l’entraînement</Link>
      <Link className={appSecondaryActionClass} href="/training/conventions/bidding">Voir les conventions</Link>
    </TrainingResultSummary></AppPage>;

  const targetName = exercise.playerNames[exercise.targetPlayerId];
  return <AppPage width="wide" className="training-exercise">
    <AppSurface className="mx-auto w-full min-w-0">
      <TrainingSessionHeader title="Lire les enchères" level={level} levelName={BID_READING_LEVEL_NAMES[level]} index={index + 1} total={BID_READING_SERIES_LENGTH} score={score} />
      <div className="training-exercise-body mt-4"><BidReadingPublicAuction exercise={exercise} /></div>
      <div className="training-exercise-body mt-4 min-w-0">
        <p className="mb-3 font-semibold">Que peux-tu affirmer sur l’enchère de {targetName} ({TRAINING_BID_ROLES[exercise.targetPlayerId]}) ?</p>
        {!grade ? <BidReadingForm key={index} assertionChoices={exercise.assertionChoices} onAnswer={submit} />
          : <section aria-live="polite" aria-label="Correction de la lecture" className="training-feedback rounded-xl border border-[var(--border)] bg-[var(--surface-raised)] p-4">
            <p className={`font-black ${grade.correct ? "text-[var(--success)]" : "text-[var(--danger)]"}`}>{grade.correct ? "Bonne réponse !" : "Mauvaise réponse"}</p>
            <p className="mt-2 text-sm">Ta sélection : {answer?.selectedAssertionIds.length
              ? answer.selectedAssertionIds.map((id) => BID_READING_ASSERTION_LABELS[id]).join(" ; ") : "Aucune affirmation"}</p>
            <BidReadingDoctrineCorrection promise={exercise.promise} illustrationHand={exercise.illustrationHand} />
            <button ref={nextButtonRef} className={`${appPrimaryActionClass} mt-4 min-h-11`} onClick={next} type="button">{index === BID_READING_SERIES_LENGTH - 1 ? "Voir le résultat" : "Exercice suivant"}</button>
          </section>}
      </div>
      <Link className="coinche-ui-link mt-4 inline-block text-sm font-semibold" href="/training/conventions/bidding">Voir les conventions</Link>
    </AppSurface>
  </AppPage>;
}
