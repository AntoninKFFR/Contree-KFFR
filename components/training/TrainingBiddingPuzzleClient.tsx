"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { BiddingPanel } from "@/components/BiddingPanel";
import { BiddingExerciseBoard } from "@/components/training/BiddingExerciseBoard";
import { AppEyebrow, AppPage, AppSurface, appPrimaryActionClass, appSecondaryActionClass } from "@/components/ui/AppShell";
import {
  biddingSeriesSeed, isBiddingLevelUnlocked, readTrainingProgress, recordBiddingSeries,
  saveTrainingProgress, type TrainingProgress,
} from "@/components/training/progress";
import { canCoinche, canSurcoinche } from "@/engine/bidding";
import {
  BIDDING_AXIS_VERSION, BIDDING_LEVEL_NAMES, BIDDING_SERIES_LENGTH,
  formatBiddingAnswer, generateBiddingSeries, gradeBiddingExercise,
  type BiddingAnswer, type BiddingExercise, type BiddingLevel,
} from "@/engine/training/bidding";
import { explainBiddingTrace } from "@/engine/training/biddingFeedback";
import { generatorVersion } from "@/engine/training/generator";
import { CONTREE_KFFR_RULESET } from "@/engine/rulesets/presets";

export function TrainingBiddingPuzzleClient({ level }: { level: BiddingLevel }) {
  const [progress, setProgress] = useState<TrainingProgress | null>(null);
  const [series, setSeries] = useState<BiddingExercise[] | null>(null);
  const [locked, setLocked] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [index, setIndex] = useState(0);
  const [submitted, setSubmitted] = useState<BiddingAnswer | null>(null);
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
    if (!isBiddingLevelUnlocked(saved, level)) { setLocked(true); return; }
    try {
      const seed = biddingSeriesSeed(saved, level);
      setSeries(generateBiddingSeries({ seed, level, generatorVersion, axisVersion: BIDDING_AXIS_VERSION }));
    } catch { setError("Impossible de préparer cette série d’annonces."); }
  }, [level]);

  const exercise = series?.[index];
  const submit = (answer: BiddingAnswer) => {
    if (!exercise || submittedRef.current) return;
    submittedRef.current = true;
    setSubmitted(answer);
    setGrade(gradeBiddingExercise(exercise, answer));
  };
  const next = () => {
    if (!series || !progress || !grade) return;
    const nextScore = score + grade.score;
    if (index === BIDDING_SERIES_LENGTH - 1) {
      const previousUnlocked = progress.axes.bidding.unlockedLevel;
      const updated = recordBiddingSeries(progress, level, nextScore);
      setNewlyUnlockedLevel(updated.axes.bidding.unlockedLevel > previousUnlocked ? updated.axes.bidding.unlockedLevel : null);
      saveTrainingProgress(updated);
      setProgress(updated);
      setScore(nextScore);
      setFinished(true);
    } else {
      setScore(nextScore); setIndex(index + 1); setSubmitted(null); setGrade(null); submittedRef.current = false;
    }
  };
  const replay = () => {
    if (!progress) return;
    try {
      setSeries(generateBiddingSeries({ seed: biddingSeriesSeed(progress, level), level,
        generatorVersion, axisVersion: BIDDING_AXIS_VERSION }));
      setError(null); setIndex(0); setSubmitted(null); setGrade(null); setScore(0);
      setFinished(false); setNewlyUnlockedLevel(null); submittedRef.current = false;
    } catch { setError("Impossible de préparer cette série d’annonces."); }
  };

  if (locked) return <AppPage width="narrow"><AppSurface className="py-8 text-center">
    <AppEyebrow>Faire son annonce</AppEyebrow><h1 className="mt-3 text-2xl font-black">Niveau {level} verrouillé</h1>
    <p className="mt-3 text-[var(--text-secondary)]">Obtiens 8/10 au niveau précédent pour débloquer ce niveau.</p>
    <Link className={`${appPrimaryActionClass} mt-6`} href="/training">Retour à l’entraînement</Link>
  </AppSurface></AppPage>;
  if (error) return <AppPage width="narrow"><AppSurface><p role="alert">{error}</p><Link href="/training">Retour à l’entraînement</Link></AppSurface></AppPage>;
  if (!progress || !series || !exercise) return <AppPage width="narrow"><AppSurface><p role="status">Préparation de la série…</p></AppSurface></AppPage>;
  if (finished) return <AppPage width="medium"><AppSurface className="mx-auto w-full max-w-xl py-8 text-center">
    <AppEyebrow>Faire son annonce · Niveau {level}</AppEyebrow>
    <h1 className="mt-3 text-3xl font-black">Résultat</h1>
    <p className="mt-5 text-5xl font-black text-[var(--accent)]">{score} / {BIDDING_SERIES_LENGTH}</p>
    <p className="mt-3 text-sm">Meilleur score local : {progress.axes.bidding.levels[level].bestScore} / 10</p>
    {newlyUnlockedLevel !== null ? <p className="mt-3 font-bold text-[var(--success)]">Niveau {newlyUnlockedLevel} débloqué !</p> : null}
    <p className="mt-3 text-xs text-[var(--text-secondary)]">Cette progression reste sur cet appareil.</p>
    <div className="mt-6 flex flex-wrap justify-center gap-2">
      <button className={appPrimaryActionClass} onClick={replay} type="button">Rejouer</button>
      {newlyUnlockedLevel !== null ? <Link className={appSecondaryActionClass} href={`/training/puzzle/bidding?level=${newlyUnlockedLevel}`}>Niveau {newlyUnlockedLevel}</Link> : null}
      <Link className={appSecondaryActionClass} href="/training">Retour à l’entraînement</Link>
      <Link className={appSecondaryActionClass} href="/training/conventions/bidding">Voir les conventions</Link>
    </div>
  </AppSurface></AppPage>;

  const contract = exercise.currentContract;
  const rules = CONTREE_KFFR_RULESET.bidding;
  return <AppPage width="wide">
    <Link className="coinche-ui-link w-fit text-sm font-bold" href="/training">← Retour à l’entraînement</Link>
    <AppSurface className="mx-auto mt-3 w-full min-w-0">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div><AppEyebrow>Annoncer · Niveau {level}</AppEyebrow><h1 className="mt-1 text-2xl font-black">Faire son annonce</h1>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">{BIDDING_LEVEL_NAMES[level]} · Doctrine KFFR Advanced Rules V4.1</p></div>
        <span aria-label={`Exercice ${index + 1} sur ${BIDDING_SERIES_LENGTH}`} className="rounded-full border border-[var(--border)] px-3 py-1.5 text-sm font-bold">{index + 1} / {BIDDING_SERIES_LENGTH}</span>
      </div>
      <div className="mt-4"><BiddingExerciseBoard exercise={exercise} /></div>
      <div className="mt-4 min-w-0">
        {!grade ? <BiddingPanel key={index} exerciseMode compact bids={exercise.publicBids} playerId={0} canBid
          canCoinche={canCoinche(0, contract, rules)} canSurcoinche={canSurcoinche(0, contract, rules)}
          currentContract={contract} biddingRules={rules}
          onBid={(value, mode) => { if (mode.kind === "suit") submit({ action: "bid", value, trump: mode.suit }); }}
          onCapot={(mode) => { if (mode.kind === "suit") submit({ action: "capot", trump: mode.suit }); }}
          onGenerale={() => undefined} onCoinche={() => submit({ action: "coinche" })}
          onPass={() => submit({ action: "pass" })} onSurcoinche={() => submit({ action: "surcoinche" })} />
          : <section aria-live="polite" aria-label="Correction de l’annonce" className="rounded-xl border border-[var(--border)] bg-[var(--surface-raised)] p-4">
            <p className={`font-black ${grade.correct ? "text-[var(--success)]" : "text-[var(--danger)]"}`}>{grade.correct ? "Bonne réponse !" : "Mauvaise réponse"}</p>
            <p className="mt-2 text-sm">Ta réponse : <strong>{submitted ? formatBiddingAnswer(submitted) : "—"}</strong></p>
            <p className="mt-1 text-sm">Selon la doctrine de l’application : <strong>{formatBiddingAnswer(exercise.expected)}</strong></p>
            <p className="mt-2 text-sm text-[var(--text-secondary)]">{explainBiddingTrace(exercise.trace)}</p>
            <button ref={nextButtonRef} className={`${appPrimaryActionClass} mt-4 min-h-11`} onClick={next} type="button">{index === BIDDING_SERIES_LENGTH - 1 ? "Voir le résultat" : "Exercice suivant"}</button>
          </section>}
      </div>
      <Link className="coinche-ui-link mt-4 inline-block text-sm font-semibold" href="/training/conventions/bidding">Voir les conventions</Link>
    </AppSurface>
  </AppPage>;
}
