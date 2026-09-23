"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { generatorVersion } from "@/engine/training/generator";
import type { TrickValueExercise } from "@/engine/training/trickValue";
import {
  applyChallengeOutcome, BLITZ_INITIAL_MS, CHALLENGE_ADVANCE_MS, challengeDifficulty,
  expireChallenge, generateChallengeExercise, initialChallengeState, nextChallengeQuestion,
  survivalTier, type ChallengeOutcome, type ChallengeState, type TrickValueChallengeMode,
} from "@/engine/training/trickValueChallenge";
import { AppEyebrow, AppPage, AppSurface, appPrimaryActionClass, appSecondaryActionClass } from "@/components/ui/AppShell";
import { NumberPad } from "@/components/training/NumberPad";
import { TrickValueBoard } from "@/components/training/TrickValueBoard";
import {
  isTrickValueChallengeUnlocked, readTrainingProgress, recordTrickValueChallengeRun,
  saveTrainingProgress, trainingChallengeRunSeed, type TrainingProgress,
} from "@/components/training/progress";
import { usePlayerPreferences } from "@/components/settings/PlayerPreferencesProvider";
import { playPreferenceSound } from "@/lib/preferences/audio";

type ClockPhase = "idle" | "active" | "transition" | "finished" | "stopped";
type BriefFeedback = { text: string; positive: boolean } | null;

function formatTime(milliseconds: number): string {
  return `${(Math.max(0, milliseconds) / 1000).toFixed(1)} s`;
}

export function TrainingChallengeClient({ mode }: { mode: TrickValueChallengeMode }) {
  const { preferences } = usePlayerPreferences();
  const [progress, setProgress] = useState<TrainingProgress | null>(null);
  const [locked, setLocked] = useState(false);
  const [run, setRun] = useState<ChallengeState | null>(null);
  const [exercise, setExercise] = useState<TrickValueExercise | null>(null);
  const [answer, setAnswer] = useState("");
  const [remainingMs, setRemainingMs] = useState(0);
  const [feedback, setFeedback] = useState<BriefFeedback>(null);
  const [announcement, setAnnouncement] = useState("");
  const [newRecord, setNewRecord] = useState(false);
  const progressRef = useRef<TrainingProgress | null>(null);
  const runRef = useRef<ChallengeState | null>(null);
  const exerciseRef = useRef<TrickValueExercise | null>(null);
  const runSeedRef = useRef(0);
  const deadlineRef = useRef(0);
  const phaseRef = useRef<ClockPhase>("idle");
  const advanceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const resolveRef = useRef<(outcome: ChallengeOutcome) => void>(() => undefined);
  const finishRef = useRef<(state: ChallengeState) => void>(() => undefined);

  const startRun = useCallback((saved: TrainingProgress) => {
    if (advanceTimerRef.current !== null) clearTimeout(advanceTimerRef.current);
    advanceTimerRef.current = null;
    const initial = initialChallengeState(mode);
    const runSeed = trainingChallengeRunSeed(saved, mode);
    const first = generateChallengeExercise({
      runSeed, exerciseIndex: 0, generatorVersion,
      difficulty: challengeDifficulty(mode, 0, 0),
    });
    progressRef.current = saved;
    runRef.current = initial;
    exerciseRef.current = first;
    runSeedRef.current = runSeed;
    deadlineRef.current = performance.now() + initial.remainingMs;
    phaseRef.current = "active";
    setProgress(saved);
    setRun(initial);
    setExercise(first);
    setAnswer("");
    setRemainingMs(initial.remainingMs);
    setFeedback(null);
    setAnnouncement("");
    setNewRecord(false);
  }, [mode]);

  const finishRun = useCallback((finished: ChallengeState) => {
    if (phaseRef.current === "finished" || phaseRef.current === "stopped") return;
    phaseRef.current = "finished";
    if (advanceTimerRef.current !== null) clearTimeout(advanceTimerRef.current);
    advanceTimerRef.current = null;
    const saved = progressRef.current;
    if (!saved) return;
    const previousBest = saved.axes["trick-value"].challenges[mode].bestScore;
    const updated = recordTrickValueChallengeRun(saved, finished);
    saveTrainingProgress(updated);
    progressRef.current = updated;
    runRef.current = finished;
    setProgress(updated);
    setRun(finished);
    setRemainingMs(finished.remainingMs);
    setFeedback(null);
    setNewRecord(finished.correctAnswers > previousBest);
    setAnnouncement("Run terminée.");
  }, [mode]);
  finishRef.current = finishRun;

  const resolveQuestion = useCallback((requestedOutcome: ChallengeOutcome) => {
    const current = runRef.current;
    const currentExercise = exerciseRef.current;
    if (phaseRef.current !== "active" || !current || !currentExercise) return;
    const now = performance.now();
    const remaining = Math.max(0, deadlineRef.current - now);
    const questionEndedAt = remaining === 0 ? deadlineRef.current : now;
    if (mode === "blitz" && remaining === 0) {
      finishRun(expireChallenge(current));
      return;
    }
    phaseRef.current = "transition"; // Synchronous lock against double Enter and timeout races.
    const outcome = remaining === 0 ? "timeout" : requestedOutcome;
    const { state: resolved, timeChangeMs } = applyChallengeOutcome(current, outcome, remaining);
    runRef.current = resolved;
    setRun(resolved);
    if (mode === "blitz") {
      deadlineRef.current = now + resolved.remainingMs;
      setRemainingMs(resolved.remainingMs);
    }
    const correct = outcome === "correct";
    playPreferenceSound(correct ? "training-correct" : "training-wrong", preferences);
    if (mode === "survival") {
      setFeedback({ text: correct ? "+1 pli" : "−1 vie", positive: correct });
      if (!correct) setAnnouncement(outcome === "timeout" ? "Temps écoulé. Une vie perdue." : "Mauvaise réponse. Une vie perdue.");
    } else {
      const seconds = Math.abs(timeChangeMs) / 1000;
      setFeedback({ text: `${timeChangeMs >= 0 ? "+" : "−"}${seconds.toLocaleString("fr-FR", { maximumFractionDigits: 1 })} s`, positive: correct });
      if (!correct) setAnnouncement(`Pénalité de ${seconds} secondes.`);
    }
    if (resolved.finished) {
      finishRun(resolved);
      return;
    }
    advanceTimerRef.current = setTimeout(() => {
      advanceTimerRef.current = null;
      if (phaseRef.current !== "transition") return;
      const next = nextChallengeQuestion(resolved);
      const nextExercise = generateChallengeExercise({
        runSeed: runSeedRef.current, exerciseIndex: next.exerciseIndex, generatorVersion,
        difficulty: challengeDifficulty(mode, next.exerciseIndex, next.correctAnswers),
      });
      const nextNow = performance.now();
      if (mode === "blitz" && deadlineRef.current <= nextNow) {
        finishRef.current(expireChallenge(next));
        return;
      }
      if (mode === "survival") deadlineRef.current = questionEndedAt + CHALLENGE_ADVANCE_MS + next.remainingMs;
      runRef.current = next;
      exerciseRef.current = nextExercise;
      phaseRef.current = "active";
      setRun(next);
      setExercise(nextExercise);
      setAnswer("");
      setRemainingMs(Math.max(0, deadlineRef.current - nextNow));
      setFeedback(null);
      setAnnouncement("");
      if (mode === "survival" && deadlineRef.current <= nextNow) resolveRef.current("timeout");
    }, CHALLENGE_ADVANCE_MS);
  }, [finishRun, mode, preferences]);
  resolveRef.current = resolveQuestion;

  useEffect(() => {
    const saved = readTrainingProgress();
    progressRef.current = saved;
    setProgress(saved);
    if (!isTrickValueChallengeUnlocked(saved)) {
      setLocked(true);
      return;
    }
    setLocked(false);
    startRun(saved);
    const ticker = setInterval(() => {
      const current = runRef.current;
      if (!current || (phaseRef.current !== "active" && !(mode === "blitz" && phaseRef.current === "transition"))) return;
      const left = Math.max(0, deadlineRef.current - performance.now());
      setRemainingMs(left);
      if (left > 0) return;
      if (mode === "blitz") finishRef.current(expireChallenge(current));
      else resolveRef.current("timeout");
    }, 50);
    return () => {
      clearInterval(ticker);
      if (advanceTimerRef.current !== null) clearTimeout(advanceTimerRef.current);
      advanceTimerRef.current = null;
      phaseRef.current = "stopped";
    };
  }, [mode, startRun]);

  useEffect(() => {
    if (run && !run.finished && phaseRef.current === "active") document.getElementById("training-answer")?.focus();
  }, [run?.exerciseIndex, run?.finished, run]);

  const submit = () => {
    if (!answer || !exerciseRef.current) return;
    resolveQuestion(Number(answer) === exerciseRef.current.answer ? "correct" : "wrong");
  };

  const label = mode === "survival" ? "Survie" : "Blitz";
  if (locked) return <AppPage width="narrow"><AppSurface className="py-8 text-center">
    <AppEyebrow>Valeur d’un pli · {label}</AppEyebrow>
    <h1 className="mt-3 text-2xl font-black">Mode verrouillé</h1>
    <p className="mt-3 text-[var(--text-secondary)]">Réussis 8/10 en Confirmé pour débloquer ce mode.</p>
    <Link className={`${appPrimaryActionClass} mt-6`} href="/training">Retour aux niveaux</Link>
  </AppSurface></AppPage>;

  if (!progress || !run || !exercise) return <AppPage><AppSurface><p role="status">Préparation du défi…</p></AppSurface></AppPage>;

  if (run.finished) {
    const record = progress.axes["trick-value"].challenges[mode];
    return <AppPage width="medium"><AppSurface className="mx-auto w-full max-w-xl py-8 text-center sm:py-12">
      <AppEyebrow>{label} · Run terminée</AppEyebrow>
      <h1 className="mt-3 text-3xl font-black">Résultat {label}</h1>
      <p className="mt-5 text-5xl font-black text-[var(--accent)]">{run.correctAnswers} {mode === "survival" ? run.correctAnswers === 1 ? "pli" : "plis" : run.correctAnswers === 1 ? "bonne réponse" : "bonnes réponses"}</p>
      {mode === "survival"
        ? <p className="mt-3 font-semibold">Palier atteint : {survivalTier(run.correctAnswers)}</p>
        : <p className="mt-3 font-semibold">Meilleure série de la run : {run.bestStreak}</p>}
      <p className="mt-4 text-sm text-[var(--text-secondary)]">Record personnel : {record.bestScore} {mode === "survival" ? record.bestScore === 1 ? "pli" : "plis" : record.bestScore === 1 ? "bonne réponse" : "bonnes réponses"}</p>
      {newRecord ? <p className="mt-3 font-bold text-[var(--success)]" role="status">Nouveau record !</p> : null}
      <div className="mt-7 flex flex-col justify-center gap-2 sm:flex-row">
        <button className={appPrimaryActionClass} onClick={() => startRun(progress)} type="button">Rejouer</button>
        <Link className={appSecondaryActionClass} href="/training">Retour entraînement</Link>
      </div>
    </AppSurface></AppPage>;
  }

  const totalMs = mode === "survival" ? run.remainingMs : BLITZ_INITIAL_MS;
  const fraction = Math.min(1, remainingMs / totalMs);
  const urgent = mode === "survival" ? remainingMs < 1_000 : remainingMs < 5_000;
  const danger = mode === "survival" ? fraction < 1 / 3 : remainingMs < 10_000;
  const tension = mode === "blitz" && remainingMs < 20_000;
  const tone = urgent || danger ? "text-[var(--danger)]" : tension ? "text-[var(--accent)]" : "text-[var(--text-primary)]";

  return <AppPage width="wide">
    <Link className="coinche-ui-link w-fit text-sm font-bold" href="/training">← Retour entraînement</Link>
    <AppSurface className="mx-auto w-full">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
          <h1 className="text-2xl font-black tracking-tight sm:text-3xl">{label}</h1>
          <p className="text-sm font-semibold text-[var(--text-secondary)]">Valeur d’un pli</p>
        </div>
        <p className="text-sm font-bold">Pli {run.exerciseIndex + 1}</p>
      </header>
      <div className="mt-4 grid gap-6 md:grid-cols-[minmax(0,1.4fr)_minmax(280px,0.8fr)] md:gap-8">
        <div className="min-w-0">
          <TrickValueBoard exercise={exercise} />
        </div>
        <div className="min-w-0 md:border-l md:border-[var(--border)] md:pl-8">
          <div className="mx-auto max-w-xs">
            <div className="flex flex-wrap items-end justify-between gap-2">
              <div>
                <p className="text-xs font-black uppercase tracking-widest text-[var(--text-secondary)]">Temps restant</p>
                <p aria-label={`Temps restant : ${formatTime(remainingMs)}`} className={`text-4xl font-black tabular-nums ${tone}`}>{formatTime(remainingMs)}</p>
              </div>
              {mode === "survival" ? <div className="text-right">
                <p aria-label={`Vies restantes : ${run.lives}`} className="text-xl">{"❤️".repeat(run.lives)}</p>
                <p className="text-xs font-bold">Score {run.correctAnswers} · Palier {survivalTier(run.correctAnswers)}</p>
              </div> : <div className="text-right text-xs font-bold">
                <p>Score {run.correctAnswers}</p><p>Série ×{run.correctStreak}</p>
              </div>}
            </div>
            <div aria-hidden="true" className="mt-2 h-2 overflow-hidden rounded-full bg-[var(--surface-raised)]">
              <div className={`h-full ${danger || urgent ? "bg-[var(--danger)]" : tension ? "bg-[var(--accent)]" : "bg-[var(--success)]"}`} style={{ width: `${fraction * 100}%` }} />
            </div>
            <div className="h-6 pt-1 text-right text-sm font-black" aria-hidden="true">
              {feedback ? <span className={feedback.positive ? "text-[var(--success)]" : "text-[var(--danger)]"}>{feedback.text}</span> : null}
            </div>
          </div>
          <NumberPad disabled={phaseRef.current !== "active"} onChange={setAnswer} onSubmit={submit} value={answer} />
        </div>
      </div>
      <p className="sr-only" role="status">{announcement}</p>
    </AppSurface>
  </AppPage>;
}
