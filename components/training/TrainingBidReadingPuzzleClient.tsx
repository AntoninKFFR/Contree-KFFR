"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { BidReadingForm } from "@/components/training/BidReadingForm";
import { cardAccessibleName } from "@/components/training/CardSelection";
import { formatPublicBidLabel, TRAINING_BID_ROLES } from "@/components/training/bidRoles";
import {
  bidReadingSeriesSeed, isBidReadingLevelUnlocked, readTrainingProgress,
  recordBidReadingSeries, saveTrainingProgress, type TrainingProgress,
} from "@/components/training/progress";
import { AppEyebrow, AppPage, AppSurface, appPrimaryActionClass, appSecondaryActionClass } from "@/components/ui/AppShell";
import { cardId, SUIT_SYMBOLS } from "@/engine/cards";
import {
  BID_READING_ASSERTION_LABELS, BID_READING_AXIS_VERSION, BID_READING_LEVEL_NAMES,
  BID_READING_MEANING_LABELS, BID_READING_SERIES_LENGTH, generateBidReadingSeries,
  gradeBidReadingExercise, type BidReadingAnswer, type BidReadingExercise, type BidReadingLevel,
} from "@/engine/training/bidReading";
import { generatorVersion } from "@/engine/training/generator";

function PublicAuction({ exercise }: { exercise: BidReadingExercise }) {
  return <section aria-label="Historique public des enchères" className="min-w-0 rounded-xl border border-[var(--border)] p-3">
    <h2 className="font-black">Enchères publiques</h2>
    <p className="mt-1 text-xs text-[var(--text-secondary)]">Lecture depuis ta place : partenaire en face, adversaires à droite et à gauche.</p>
    <ol className="mt-3 flex flex-wrap gap-2">
      {exercise.publicBids.map((bid, index) => <li key={index} aria-current={index === exercise.targetBidIndex ? "step" : undefined}
        className={`min-w-0 rounded-xl border p-2 text-sm ${index === exercise.targetBidIndex ? "border-[var(--accent)] bg-[var(--surface-raised)] ring-2 ring-[var(--accent)]" : "border-[var(--border)]"}`}>
        <span className="block font-bold">{TRAINING_BID_ROLES[bid.playerId]} · {exercise.playerNames[bid.playerId]}</span>
        <span className="block">{formatPublicBidLabel(bid)}{index === exercise.targetBidIndex ? " · annonce à lire" : ""}</span>
      </li>)}
    </ol>
  </section>;
}

function CompatibleHand({ exercise }: { exercise: BidReadingExercise }) {
  return <section aria-label="Exemple de main compatible" className="mt-4 rounded-xl border border-[var(--border)] p-3">
    <h3 className="font-black">Exemple de main compatible</h3>
    <p className="mt-1 text-sm font-semibold">Une main compatible parmi d’autres</p>
    <p className="mt-1 text-xs text-[var(--text-secondary)]">Voici la main utilisée pour cet exemple. Elle illustre une possibilité, mais l’enchère seule ne révèle pas toutes ces cartes.</p>
    <div className="mt-3 flex flex-wrap gap-1.5">{exercise.illustrationHand.map((card) => <span key={cardId(card)}
      aria-label={cardAccessibleName(card)} className="rounded-md border border-[var(--border)] bg-[#fffef9] px-2 py-1 font-bold text-stone-900">
      {card.rank}{SUIT_SYMBOLS[card.suit]}
    </span>)}</div>
  </section>;
}

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
  if (finished) return <AppPage width="medium"><AppSurface className="mx-auto w-full max-w-xl py-8 text-center">
    <AppEyebrow>Lire les enchères · Niveau {level}</AppEyebrow>
    <h1 className="mt-3 text-3xl font-black">Résultat</h1>
    <p className="mt-5 text-5xl font-black text-[var(--accent)]">{score} / {BID_READING_SERIES_LENGTH}</p>
    <p className="mt-3 text-sm">Meilleur score local : {progress.axes["bid-reading"].levels[level].bestScore} / 10</p>
    {newlyUnlockedLevel !== null ? <p className="mt-3 font-bold text-[var(--success)]">Niveau {newlyUnlockedLevel} débloqué !</p> : null}
    <p className="mt-3 text-xs text-[var(--text-secondary)]">Cette progression reste sur cet appareil.</p>
    <div className="mt-6 flex flex-wrap justify-center gap-2">
      <button className={appPrimaryActionClass} onClick={replay} type="button">Rejouer</button>
      {newlyUnlockedLevel !== null ? <Link className={appSecondaryActionClass} href={`/training/puzzle/bid-reading?level=${newlyUnlockedLevel}`}>Niveau {newlyUnlockedLevel}</Link> : null}
      <Link className={appSecondaryActionClass} href="/training">Retour à l’entraînement</Link>
      <Link className={appSecondaryActionClass} href="/training/conventions/bidding">Voir les conventions</Link>
    </div>
  </AppSurface></AppPage>;

  const targetName = exercise.playerNames[exercise.targetPlayerId];
  return <AppPage width="wide">
    <Link className="coinche-ui-link w-fit text-sm font-bold" href="/training">← Retour à l’entraînement</Link>
    <AppSurface className="mx-auto mt-3 w-full min-w-0">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div><AppEyebrow>Annoncer · Niveau {level}</AppEyebrow><h1 className="mt-1 text-2xl font-black">Lire les enchères</h1>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">{BID_READING_LEVEL_NAMES[level]} · Doctrine KFFR Advanced Rules V4.1</p></div>
        <span aria-label={`Exercice ${index + 1} sur ${BID_READING_SERIES_LENGTH}`} className="rounded-full border border-[var(--border)] px-3 py-1.5 text-sm font-bold">{index + 1} / {BID_READING_SERIES_LENGTH}</span>
      </div>
      <div className="mt-4"><PublicAuction exercise={exercise} /></div>
      <div className="mt-4 min-w-0">
        <p className="mb-3 font-semibold">Que peux-tu affirmer sur l’enchère de {targetName} ({TRAINING_BID_ROLES[exercise.targetPlayerId]}) ?</p>
        {!grade ? <BidReadingForm key={index} exercise={exercise} onAnswer={submit} />
          : <section aria-live="polite" aria-label="Correction de la lecture" className="rounded-xl border border-[var(--border)] bg-[var(--surface-raised)] p-4">
            <p className={`font-black ${grade.correct ? "text-[var(--success)]" : "text-[var(--danger)]"}`}>{grade.correct ? "Bonne réponse !" : "Mauvaise réponse"}</p>
            <p className="mt-2 text-sm">Ta sélection : {answer?.selectedAssertionIds.length
              ? answer.selectedAssertionIds.map((id) => BID_READING_ASSERTION_LABELS[id]).join(" ; ") : "Aucune affirmation"}</p>
            <h2 className="mt-4 font-black">Selon la doctrine de l’application</h2>
            <h3 className="mt-2 font-bold">Tu peux affirmer :</h3>
            {exercise.promise.guaranteed.length > 0 ? <ul className="mt-1 list-disc pl-5 text-sm">{exercise.promise.guaranteed.map((id) =>
              <li key={id}>{BID_READING_ASSERTION_LABELS[id]}</li>)}</ul> : <p className="mt-1 text-sm">Aucune carte précise n’est garantie par cette annonce.</p>}
            <h3 className="mt-3 font-bold">Cette enchère peut correspondre à :</h3>
            <ul className="mt-1 list-disc pl-5 text-sm">{exercise.promise.possibleMeanings.map((meaning) =>
              <li key={meaning}>{BID_READING_MEANING_LABELS[meaning]}</li>)}</ul>
            {exercise.promise.explanation.map((line, lineIndex) => <p key={lineIndex} className="mt-2 text-sm text-[var(--text-secondary)]">{line}</p>)}
            <CompatibleHand exercise={exercise} />
            <button ref={nextButtonRef} className={`${appPrimaryActionClass} mt-4 min-h-11`} onClick={next} type="button">{index === BID_READING_SERIES_LENGTH - 1 ? "Voir le résultat" : "Exercice suivant"}</button>
          </section>}
      </div>
      <Link className="coinche-ui-link mt-4 inline-block text-sm font-semibold" href="/training/conventions/bidding">Voir les conventions</Link>
    </AppSurface>
  </AppPage>;
}
