"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { COUNTING_PASSING_SCORE, COUNTING_SERIES_LENGTH, gradeCountingAnswers } from "@/engine/training/counting";
import { generatorVersion } from "@/engine/training/generator";
import { generateRoundCountSeries } from "@/engine/training/roundCount";
import { generateRunningScoreSeries } from "@/engine/training/runningScore";
import { AppEyebrow, AppPage, AppSurface, appPrimaryActionClass, appSecondaryActionClass } from "@/components/ui/AppShell";
import { NumberPad } from "@/components/training/NumberPad";
import { TrickReplay, type ReplaySpeed } from "@/components/training/TrickReplay";
import {
  COUNTING_AXIS_COPY, countingExplanation, countingQuestion, formatPoints, formatScore, type CountingExercise,
} from "@/components/training/countingCopy";
import {
  countingSeriesSeed, isCountingLevelUnlocked, readTrainingProgress, recordCountingSeries, saveTrainingProgress,
  type CountingAxisId, type CountingLevel, type TrainingProgress,
} from "@/components/training/progress";
import { usePlayerPreferences } from "@/components/settings/PlayerPreferencesProvider";
import { playPreferenceSound } from "@/lib/preferences/audio";

type Phase = "replay" | "answer" | "feedback";

function generateSeries(axisId: CountingAxisId, progress: TrainingProgress, level: CountingLevel): CountingExercise[] {
  const seed = countingSeriesSeed(progress, axisId, level);
  return axisId === "round-count"
    ? generateRoundCountSeries({ seed, generatorVersion, level })
    : generateRunningScoreSeries({ seed, generatorVersion, level });
}

function Feedback({ exercise, answers, grade, isLast, onNext }: {
  exercise: CountingExercise;
  answers: number[];
  grade: number;
  isLast: boolean;
  onNext: () => void;
}) {
  const { prompts } = countingQuestion(exercise);
  const single = exercise.expected.length === 1;
  const status = grade === 1 ? "Bonne réponse !" : grade > 0 ? "Réponse partielle" : "Mauvaise réponse";
  const tone = grade === 1 ? "text-[var(--success)]" : grade > 0 ? "text-[var(--accent)]" : "text-[var(--danger)]";
  return <div aria-live="polite" className="mx-auto max-w-sm rounded-xl border border-[var(--border)] bg-[var(--surface-raised)] p-4">
    <p className={`font-black ${tone}`}>{status}</p>
    <ul className="mt-2 space-y-1 text-sm">
      {exercise.expected.map((value, index) => <li key={index}>
        {single ? "Réponse" : prompts[index]} : <strong>{formatPoints(value)}</strong>
        {answers[index] === value ? " ✓" : ` (ta réponse : ${answers[index]})`}
      </li>)}
    </ul>
    <p className="mt-3 text-sm text-[var(--text-secondary)]">{countingExplanation(exercise)}</p>
    {exercise.question.kind === "round-score"
      ? <Link className="coinche-ui-link mt-2 inline-block text-sm font-bold" href="/rules">Revoir le calcul du score</Link>
      : null}
    <button className={`${appPrimaryActionClass} mt-4 min-h-11 w-full`} onClick={onNext} type="button">
      {isLast ? "Voir le résultat" : "Exercice suivant"}
    </button>
  </div>;
}

export function CountingPuzzleClient({ axisId, level }: { axisId: CountingAxisId; level: CountingLevel }) {
  const { preferences } = usePlayerPreferences();
  const copy = COUNTING_AXIS_COPY[axisId];
  const levelName = copy.levels[level].name;
  const [progress, setProgress] = useState<TrainingProgress | null>(null);
  const [locked, setLocked] = useState(false);
  const [series, setSeries] = useState<CountingExercise[] | null>(null);
  const [index, setIndex] = useState(0);
  const [phase, setPhase] = useState<Phase>("replay");
  const [answers, setAnswers] = useState<number[]>([]);
  const [draft, setDraft] = useState("");
  const [grade, setGrade] = useState(0);
  const [score, setScore] = useState(0);
  const [finished, setFinished] = useState(false);
  const [justUnlocked, setJustUnlocked] = useState(false);
  const [speed, setSpeed] = useState<ReplaySpeed>("normal");

  useEffect(() => {
    const saved = readTrainingProgress();
    setProgress(saved);
    if (!isCountingLevelUnlocked(saved, axisId, level)) {
      setLocked(true);
      return;
    }
    setLocked(false);
    setSeries(generateSeries(axisId, saved, level));
  }, [axisId, level]);

  // Keyboard users get the focus on the answer; touch users keep the on-screen pad without a keyboard popping up.
  useEffect(() => {
    if (phase === "answer" && window.matchMedia?.("(pointer: fine)").matches) {
      document.getElementById("training-answer")?.focus();
    }
  }, [phase, answers.length]);

  const onReplayFinished = useCallback(() => setPhase("answer"), []);
  const exercise = series?.[index];

  const startSeries = (saved: TrainingProgress) => {
    setSeries(generateSeries(axisId, saved, level));
    setIndex(0);
    setPhase("replay");
    setAnswers([]);
    setDraft("");
    setGrade(0);
    setScore(0);
    setFinished(false);
    setJustUnlocked(false);
  };

  const submit = () => {
    if (!exercise || phase !== "answer" || !draft) return;
    const nextAnswers = [...answers, Number(draft)];
    setDraft("");
    setAnswers(nextAnswers);
    if (nextAnswers.length < exercise.expected.length) return;
    const nextGrade = gradeCountingAnswers(exercise.expected, nextAnswers);
    setGrade(nextGrade);
    setPhase("feedback");
    playPreferenceSound(nextGrade === 1 ? "training-correct" : "training-wrong", preferences);
  };

  const next = () => {
    if (!series || !progress || phase !== "feedback") return;
    const nextScore = score + grade;
    setScore(nextScore);
    if (index === series.length - 1) {
      const updated = recordCountingSeries(progress, axisId, level, nextScore);
      const following = level < 3 ? (level + 1) as CountingLevel : null;
      setJustUnlocked(following !== null
        && !isCountingLevelUnlocked(progress, axisId, following) && isCountingLevelUnlocked(updated, axisId, following));
      saveTrainingProgress(updated);
      setProgress(updated);
      setFinished(true);
      return;
    }
    setIndex(index + 1);
    setPhase("replay");
    setAnswers([]);
    setGrade(0);
  };

  if (locked) {
    return <AppPage width="narrow"><AppSurface className="py-8 text-center">
      <AppEyebrow>{copy.title}</AppEyebrow>
      <h1 className="mt-3 text-2xl font-black">Niveau {level} verrouillé</h1>
      <p className="mt-3 text-[var(--text-secondary)]">
        Obtiens {COUNTING_PASSING_SCORE}/{COUNTING_SERIES_LENGTH} au niveau {level - 1} pour débloquer ce niveau.
      </p>
      <Link className={`${appPrimaryActionClass} mt-6`} href="/training">Retour à l’entraînement</Link>
    </AppSurface></AppPage>;
  }

  if (!progress || !series || !exercise) {
    return <AppPage><AppSurface><p role="status">Préparation de la série…</p></AppSurface></AppPage>;
  }

  if (finished) {
    const best = progress.axes[axisId].levels[level].bestScore;
    return <AppPage width="medium">
      <AppSurface className="mx-auto w-full max-w-xl py-8 text-center sm:py-12">
        <AppEyebrow>Série terminée · {copy.title} · Niveau {level}</AppEyebrow>
        <h1 className="mt-3 text-3xl font-black">Résultat</h1>
        <p className="mt-5 text-5xl font-black text-[var(--accent)]">{formatScore(score)} / {COUNTING_SERIES_LENGTH}</p>
        <p className="mt-2 text-lg font-semibold">{Math.round((score / COUNTING_SERIES_LENGTH) * 100)} % de bonnes réponses</p>
        <p className="mt-4 text-sm text-[var(--text-secondary)]">Meilleur score du niveau {level} : {formatScore(best)} / {COUNTING_SERIES_LENGTH}</p>
        {justUnlocked ? <p className="mt-3 font-bold text-[var(--success)]" role="status">Niveau {level + 1} débloqué !</p> : null}
        <div className="mt-7 flex flex-col justify-center gap-2 sm:flex-row sm:flex-wrap">
          <button className={appPrimaryActionClass} onClick={() => startSeries(progress)} type="button">Rejouer le niveau {level}</button>
          {justUnlocked
            ? <Link className={appSecondaryActionClass} href={`/training/puzzle/${axisId}?level=${level + 1}`}>Passer au niveau {level + 1}</Link>
            : null}
          <Link className={appSecondaryActionClass} href="/training">Retour à l’entraînement</Link>
        </div>
      </AppSurface>
    </AppPage>;
  }

  const { text, prompts } = countingQuestion(exercise);
  return <AppPage width="wide">
    <Link className="coinche-ui-link w-fit text-sm font-bold" href="/training">← Changer d’exercice</Link>
    <AppSurface className="mx-auto w-full">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
          <h1 className="text-2xl font-black tracking-tight sm:text-3xl">{copy.title}</h1>
          <p className="text-sm font-bold text-[var(--accent)]">Niveau {level} · {levelName}</p>
        </div>
        <span aria-label={`Exercice ${index + 1} sur ${COUNTING_SERIES_LENGTH}`} className="rounded-full border border-[var(--border)] bg-[var(--surface-raised)] px-3 py-1.5 text-sm font-bold">
          {index + 1} / {COUNTING_SERIES_LENGTH}
        </span>
      </div>
      {phase === "replay"
        ? <div className="mt-4">
          <p className="mb-4 text-sm text-[var(--text-secondary)]">{copy.watch}</p>
          <TrickReplay key={`${exercise.seed}-${index}`} onFinished={onReplayFinished} onSpeedChange={setSpeed} replay={exercise} speed={speed} />
        </div>
        : <div className="mt-4 grid gap-6 md:grid-cols-[minmax(0,1.2fr)_minmax(280px,0.8fr)] md:gap-8">
          <div className="min-w-0">
            <p className="text-lg font-black">{text}</p>
            {phase === "answer" && prompts.length > 1
              ? <p className="mt-2 text-sm text-[var(--text-secondary)]">Étape {answers.length + 1} sur {prompts.length}</p>
              : null}
          </div>
          <div className="min-w-0 md:border-l md:border-[var(--border)] md:pl-8">
            {phase === "answer"
              ? <NumberPad label={prompts[answers.length]} onChange={setDraft} onSubmit={submit} value={draft} />
              : <Feedback answers={answers} exercise={exercise} grade={grade} isLast={index === series.length - 1} onNext={next} />}
          </div>
        </div>}
    </AppSurface>
  </AppPage>;
}
