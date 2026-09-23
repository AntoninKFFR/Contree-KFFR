"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { cardPoints } from "@/engine/rules";
import { generatorVersion } from "@/engine/training/generator";
import { generateTrickValueSeries, TRICK_VALUE_SERIES_LENGTH, type TrickValueExercise, type TrickValueLevel } from "@/engine/training/trickValue";
import type { Rank } from "@/engine/types";
import { AppEyebrow, AppPage, AppSurface, appPrimaryActionClass, appSecondaryActionClass } from "@/components/ui/AppShell";
import { NumberPad } from "@/components/training/NumberPad";
import { TrickValueBoard } from "@/components/training/TrickValueBoard";
import { isTrickValueLevelUnlocked, readTrainingProgress, recordTrickValueSeries, saveTrainingProgress, trickValueSeriesSeed, type TrainingProgress } from "@/components/training/progress";
import { usePlayerPreferences } from "@/components/settings/PlayerPreferencesProvider";
import { playPreferenceSound } from "@/lib/preferences/audio";

const TRUMP_RANKS: Rank[] = ["J", "9", "A", "10", "K", "Q", "8", "7"];
const SIDE_RANKS: Rank[] = ["A", "10", "K", "Q", "J", "9", "8", "7"];
const GUIDE_MODE = { kind: "suit", suit: "hearts" } as const;

function ValueGuide() {
  const groups = [
    { label: "À l’atout", suit: "hearts" as const, ranks: TRUMP_RANKS },
    { label: "Hors atout", suit: "clubs" as const, ranks: SIDE_RANKS },
  ];
  return <aside aria-label="Aide des valeurs des cartes" className="mt-5 rounded-xl border border-[var(--border)] bg-[var(--surface-raised)] p-3">
    <p className="text-xs font-black uppercase tracking-widest text-[var(--ui-kicker)]">Aide · Valeur des cartes</p>
    <div className="mt-2 grid gap-3 sm:grid-cols-2 sm:gap-4">
      {groups.map(({ label, suit, ranks }) => <div key={label}>
        <p className="mb-1.5 text-xs font-bold">{label}</p>
        <div className="grid grid-cols-8 gap-0.5 text-center">
          {ranks.map((rank) => <div className="rounded-md border border-[var(--border)] px-0.5 py-1" key={rank}>
            <span className="block text-xs font-bold">{rank}</span>
            <span className="block text-xs text-[var(--text-secondary)]">{cardPoints({ rank, suit }, GUIDE_MODE)}</span>
          </div>)}
        </div>
      </div>)}
    </div>
  </aside>;
}

export function TrainingPuzzleClient({ level }: { level: TrickValueLevel }) {
  const { preferences } = usePlayerPreferences();
  const advanceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [progress, setProgress] = useState<TrainingProgress | null>(null);
  const [locked, setLocked] = useState(false);
  const [series, setSeries] = useState<TrickValueExercise[] | null>(null);
  const [index, setIndex] = useState(0);
  const [answer, setAnswer] = useState("");
  const [feedback, setFeedback] = useState<boolean | null>(null);
  const [score, setScore] = useState(0);
  const [finished, setFinished] = useState(false);
  const [justUnlocked, setJustUnlocked] = useState(false);
  const levelName = level === 1 ? "Fondamentaux" : "Confirmé";

  useEffect(() => {
    const saved = readTrainingProgress();
    setProgress(saved);
    if (!isTrickValueLevelUnlocked(saved, level)) {
      setLocked(true);
      return;
    }
    setLocked(false);
    setSeries(generateTrickValueSeries({ seed: trickValueSeriesSeed(saved, level), generatorVersion, level }));
  }, [level]);

  useEffect(() => () => {
    if (advanceTimer.current !== null) clearTimeout(advanceTimer.current);
  }, []);

  useEffect(() => {
    if (level === 2 && feedback === null && series && !finished) {
      document.getElementById("training-answer")?.focus();
    }
  }, [feedback, finished, index, level, series]);

  const startSeries = (saved: TrainingProgress) => {
    if (advanceTimer.current !== null) clearTimeout(advanceTimer.current);
    advanceTimer.current = null;
    setSeries(generateTrickValueSeries({ seed: trickValueSeriesSeed(saved, level), generatorVersion, level }));
    setIndex(0);
    setAnswer("");
    setFeedback(null);
    setScore(0);
    setFinished(false);
    setJustUnlocked(false);
  };

  const exercise = series?.[index];
  const advance = (nextScore: number) => {
    if (!series || !progress) return;
    if (index === TRICK_VALUE_SERIES_LENGTH - 1) {
      const updated = recordTrickValueSeries(progress, level, nextScore);
      setJustUnlocked(level === 1 && !isTrickValueLevelUnlocked(progress, 2) && isTrickValueLevelUnlocked(updated, 2));
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
  const submit = () => {
    if (!exercise || feedback !== null || !answer) return;
    const correct = Number(answer) === exercise.answer;
    setFeedback(correct);
    playPreferenceSound(correct ? "training-correct" : "training-wrong", preferences);
    if (level === 2) {
      advanceTimer.current = setTimeout(() => {
        advanceTimer.current = null;
        advance(score + Number(correct));
      }, 190);
    }
  };
  const next = () => {
    if (feedback !== null) advance(score + Number(feedback));
  };

  if (locked) {
    return <AppPage width="narrow"><AppSurface className="py-8 text-center">
      <AppEyebrow>Valeur d’un pli</AppEyebrow>
      <h1 className="mt-3 text-2xl font-black">Niveau 2 verrouillé</h1>
      <p className="mt-3 text-[var(--text-secondary)]">Obtiens 8/10 au niveau 1 pour débloquer ce niveau.</p>
      <Link className={`${appPrimaryActionClass} mt-6`} href="/training">Retour aux niveaux</Link>
    </AppSurface></AppPage>;
  }

  if (!progress || !series || !exercise) {
    return <AppPage><AppSurface><p role="status">Préparation de la série…</p></AppSurface></AppPage>;
  }

  if (finished) {
    const best = progress.axes["trick-value"].levels[level].bestScore;
    return <AppPage width="medium">
      <AppSurface className="mx-auto w-full max-w-xl py-8 text-center sm:py-12">
        <AppEyebrow>Série terminée · Niveau {level} · {levelName}</AppEyebrow>
        <h1 className="mt-3 text-3xl font-black">Résultat</h1>
        <p className="mt-5 text-5xl font-black text-[var(--accent)]">{score} / {TRICK_VALUE_SERIES_LENGTH}</p>
        <p className="mt-2 text-lg font-semibold">{score * 10} % de bonnes réponses</p>
        <p className="mt-4 text-sm text-[var(--text-secondary)]">Meilleur score du niveau {level} : {best} / 10</p>
        {justUnlocked ? <p className="mt-3 font-bold text-[var(--success)]" role="status">Niveau 2 débloqué !</p> : null}
        <div className="mt-7 flex flex-col justify-center gap-2 sm:flex-row sm:flex-wrap">
          <button className={appPrimaryActionClass} onClick={() => startSeries(progress)} type="button">Rejouer le niveau {level}</button>
          {justUnlocked ? <Link className={appSecondaryActionClass} href="/training/puzzle/trick-value?level=2">Passer au niveau 2</Link> : null}
          <Link className={appSecondaryActionClass} href="/training">Retour aux niveaux</Link>
        </div>
      </AppSurface>
    </AppPage>;
  }

  return <AppPage width="wide">
    <Link className="coinche-ui-link w-fit text-sm font-bold" href="/training">← Changer de niveau</Link>
    <AppSurface className="mx-auto w-full">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
          <h1 className="whitespace-nowrap text-2xl font-black tracking-tight sm:text-3xl">Valeur d’un pli</h1>
          <p className="text-sm font-bold text-[var(--accent)]">Niveau {level} · {levelName}</p>
        </div>
        <span aria-label={`Exercice ${index + 1} sur ${TRICK_VALUE_SERIES_LENGTH}`} className="rounded-full border border-[var(--border)] bg-[var(--surface-raised)] px-3 py-1.5 text-sm font-bold">{index + 1} / {TRICK_VALUE_SERIES_LENGTH}</span>
      </div>
      <div className="mt-4 grid gap-6 md:grid-cols-[minmax(0,1.4fr)_minmax(280px,0.8fr)] md:gap-8">
        <div className="min-w-0">
          <TrickValueBoard exercise={exercise} />
          {level === 1 ? <ValueGuide /> : null}
        </div>
        <div className="min-w-0 md:border-l md:border-[var(--border)] md:pl-8">
          {level === 1 && feedback !== null ? <div aria-live="polite" className="mx-auto max-w-xs rounded-xl border border-[var(--border)] bg-[var(--surface-raised)] p-4 text-center">
          <p className={`font-black ${feedback ? "text-[var(--success)]" : "text-[var(--danger)]"}`}>{feedback ? "Bonne réponse !" : "Mauvaise réponse"}</p>
          <p className="mt-1">Ce pli vaut <strong>{exercise.answer} points</strong>.</p>
          <button className={`${appPrimaryActionClass} mt-3 min-h-11 w-full`} onClick={next} type="button">{index === TRICK_VALUE_SERIES_LENGTH - 1 ? "Voir le résultat" : "Exercice suivant"}</button>
          </div> : <NumberPad disabled={feedback !== null} onChange={setAnswer} onSubmit={submit} value={answer} />}
        </div>
      </div>
    </AppSurface>
  </AppPage>;
}
