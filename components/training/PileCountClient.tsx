"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { SUIT_LABELS, SUIT_SYMBOLS } from "@/engine/cards";
import {
  generatePileCountSeries, PILE_COUNT_SERIES_LENGTH, pileGeneratorVersion, type PileCountExercise, type PileCountMode,
} from "@/engine/training/pileCount";
import type { Card, Suit } from "@/engine/types";
import { AppEyebrow, AppPage, AppSurface, appPrimaryActionClass, appSecondaryActionClass } from "@/components/ui/AppShell";
import { NumberPad } from "@/components/training/NumberPad";
import { ValueGuide } from "@/components/training/TrainingPuzzleClient";
import {
  clampFreeDelay, FREE_SPEED, formatPoints, formatSeconds, PILE_COUNT_MODE_COPY, PILE_COUNT_TITLE, readFreeDelay, saveFreeDelay,
} from "@/components/training/pileCountCopy";
import {
  isPileCountModeUnlocked, PASSING_SCORE, pileCountSeriesSeed, readTrainingProgress, recordPileCountSeries,
  saveTrainingProgress, type TrainingProgress,
} from "@/components/training/progress";
import { usePlayerPreferences } from "@/components/settings/PlayerPreferencesProvider";
import { playPreferenceSound } from "@/lib/preferences/audio";

type Phase = "briefing" | "scrolling" | "answer" | "feedback";

const isRed = (suit: Suit) => suit === "hearts" || suit === "diamonds";

function TrumpBadge({ suit, size = "large" }: { suit: Suit; size?: "large" | "small" }) {
  const box = size === "large" ? "h-16 w-16 text-5xl" : "h-9 w-9 text-2xl";
  return <span aria-hidden="true" className={`flex ${box} items-center justify-center rounded-xl border leading-none shadow-sm ${isRed(suit) ? "border-red-200 bg-[#fff5ed] text-red-700" : "border-stone-300 bg-[#fffef9] text-stone-900"}`}>
    {SUIT_SYMBOLS[suit]}
  </span>;
}

function PileCard({ card, position, total }: { card: Card; position: number; total: number }) {
  const red = isRed(card.suit);
  return <div
    aria-label={`Carte ${position} sur ${total} : ${card.rank} de ${SUIT_LABELS[card.suit]}`}
    className={`coinche-card relative mx-auto flex aspect-[0.7] w-36 items-center justify-center rounded-2xl border bg-[#fffef9] shadow-xl sm:w-44 ${red ? "border-red-200 text-red-700" : "border-stone-300 text-stone-900"}`}
    role="img"
  >
    <span className="absolute left-2.5 top-2 text-3xl font-bold leading-none">{card.rank}</span>
    <span aria-hidden="true" className="text-7xl">{SUIT_SYMBOLS[card.suit]}</span>
    <span className="absolute bottom-2 right-2.5 text-3xl font-bold leading-none">{card.rank}</span>
  </div>;
}

/** Trump, ten de der and belote: shown before the scroll and kept on screen during it. */
function PileFacts({ exercise, compact = false }: { exercise: PileCountExercise; compact?: boolean }) {
  const facts = [
    { label: "10 de der", yes: exercise.hasTenDeDer, yesText: "ton équipe l’a (+10)", noText: "pour l’autre équipe" },
    { label: "Belote", yes: exercise.hasBelote, yesText: "ton équipe l’a (+20)", noText: "pas pour ton équipe" },
  ];
  if (compact) {
    return <ul aria-label="Rappel de la donne" className="flex flex-wrap items-center justify-center gap-2 text-sm font-bold">
      <li className="flex items-center gap-2"><TrumpBadge size="small" suit={exercise.trump} /><span>Atout {SUIT_LABELS[exercise.trump]}</span></li>
      {facts.map((fact) => <li className={`rounded-full border px-3 py-1 ${fact.yes ? "border-[var(--accent)] text-[var(--accent)]" : "border-[var(--border)] text-[var(--text-secondary)]"}`} key={fact.label}>
        {fact.label} {fact.yes ? "✓" : "✗"}
      </li>)}
    </ul>;
  }
  return <dl className="grid gap-3 sm:grid-cols-3">
    <div className="flex items-center gap-3 rounded-2xl border border-[var(--border)] bg-[var(--surface-raised)] p-3">
      <TrumpBadge suit={exercise.trump} />
      <div><dt className="text-xs font-black uppercase tracking-widest text-[var(--text-secondary)]">Atout</dt><dd className="text-lg font-black">{SUIT_LABELS[exercise.trump]}</dd></div>
    </div>
    {facts.map((fact) => <div className={`rounded-2xl border p-3 ${fact.yes ? "border-[var(--accent)] bg-[var(--accent-soft)]" : "border-[var(--border)] bg-[var(--surface-raised)]"}`} key={fact.label}>
      <dt className="text-xs font-black uppercase tracking-widest text-[var(--text-secondary)]">{fact.label}</dt>
      <dd className="mt-1 text-lg font-black">{fact.yes ? `✓ ${fact.yesText}` : `✗ ${fact.noText}`}</dd>
    </div>)}
  </dl>;
}

function Breakdown({ exercise }: { exercise: PileCountExercise }) {
  const parts = [`${exercise.cardPoints} de cartes`];
  if (exercise.hasTenDeDer) parts.push(`${exercise.tenDeDerPoints} de der`);
  if (exercise.hasBelote) parts.push(`${exercise.belotePoints} de belote`);
  return <>
    <p className="mt-2 text-sm">
      {parts.length === 1
        ? "Ni 10 de der ni belote pour ton équipe : seules les cartes comptent."
        : <>{parts.join(" + ")} = <strong>{formatPoints(exercise.answer)}</strong></>}
    </p>
    <p className="mt-2 text-sm text-[var(--text-secondary)]">
      Astuce : les plis valent 162 points au total. L’autre équipe a donc fait 162 − {exercise.teamTrickPoints} = {exercise.otherTeamTrickPoints} points de plis.
      Compter le plus petit tas puis faire la soustraction va souvent plus vite.
    </p>
  </>;
}

export function PileCountClient({ mode }: { mode: PileCountMode }) {
  const { preferences } = usePlayerPreferences();
  const copy = PILE_COUNT_MODE_COPY[mode];
  const [progress, setProgress] = useState<TrainingProgress | null>(null);
  const [locked, setLocked] = useState(false);
  const [series, setSeries] = useState<PileCountExercise[] | null>(null);
  const [index, setIndex] = useState(0);
  const [phase, setPhase] = useState<Phase>("briefing");
  const [shown, setShown] = useState(0);
  const [paused, setPaused] = useState(false);
  const [draft, setDraft] = useState("");
  const [correct, setCorrect] = useState(false);
  const [score, setScore] = useState(0);
  const [finished, setFinished] = useState(false);
  const [justUnlocked, setJustUnlocked] = useState(false);
  const [freeDelay, setFreeDelay] = useState<number>(FREE_SPEED.defaultMs);
  const delay = copy.delayMs ?? freeDelay;

  useEffect(() => {
    const saved = readTrainingProgress();
    setProgress(saved);
    if (mode === "free") setFreeDelay(readFreeDelay());
    if (!isPileCountModeUnlocked(saved, mode)) {
      setLocked(true);
      return;
    }
    setLocked(false);
    setSeries(generatePileCountSeries({ seed: pileCountSeriesSeed(saved, mode), generatorVersion: pileGeneratorVersion }));
  }, [mode]);

  const exercise = series?.[index];

  useEffect(() => {
    if (phase !== "scrolling" || paused || !exercise) return;
    const timer = setTimeout(() => {
      if (shown < exercise.cards.length - 1) setShown(shown + 1);
      else setPhase("answer");
    }, delay);
    return () => clearTimeout(timer);
  }, [delay, exercise, paused, phase, shown]);

  // Keyboard users get the focus on the answer; touch users keep the on-screen pad without a keyboard popping up.
  useEffect(() => {
    if (phase === "answer" && window.matchMedia?.("(pointer: fine)").matches) document.getElementById("training-answer")?.focus();
  }, [phase]);

  const startScrolling = () => {
    setShown(0);
    setPaused(false);
    setPhase("scrolling");
  };

  const submit = () => {
    if (!exercise || phase !== "answer" || !draft) return;
    const isCorrect = Number(draft) === exercise.answer;
    setCorrect(isCorrect);
    setPhase("feedback");
    playPreferenceSound(isCorrect ? "training-correct" : "training-wrong", preferences);
  };

  const next = () => {
    if (!series || !progress || phase !== "feedback") return;
    const nextScore = score + Number(correct);
    setScore(nextScore);
    setDraft("");
    if (index === series.length - 1) {
      const updated = recordPileCountSeries(progress, mode, nextScore);
      setJustUnlocked(mode === "beginner" && !isPileCountModeUnlocked(progress, "normal") && isPileCountModeUnlocked(updated, "normal"));
      saveTrainingProgress(updated);
      setProgress(updated);
      setFinished(true);
      return;
    }
    setIndex(index + 1);
    setPhase("briefing");
  };

  const restart = (saved: TrainingProgress) => {
    setSeries(generatePileCountSeries({ seed: pileCountSeriesSeed(saved, mode), generatorVersion: pileGeneratorVersion }));
    setIndex(0);
    setPhase("briefing");
    setDraft("");
    setScore(0);
    setFinished(false);
    setJustUnlocked(false);
  };

  if (locked) {
    return <AppPage width="narrow"><AppSurface className="py-8 text-center">
      <AppEyebrow>{PILE_COUNT_TITLE}</AppEyebrow>
      <h1 className="mt-3 text-2xl font-black">Mode {copy.name} verrouillé</h1>
      <p className="mt-3 text-[var(--text-secondary)]">Réussis {PASSING_SCORE}/{PILE_COUNT_SERIES_LENGTH} en Débutant pour débloquer ce mode.</p>
      <Link className={`${appPrimaryActionClass} mt-6`} href="/training">Retour à l’entraînement</Link>
    </AppSurface></AppPage>;
  }

  if (!progress || !series || !exercise) {
    return <AppPage><AppSurface><p role="status">Préparation des tas…</p></AppSurface></AppPage>;
  }

  if (finished) {
    const best = mode === "free" ? null : progress.axes["pile-count"].modes[mode].bestScore;
    return <AppPage width="medium">
      <AppSurface className="mx-auto w-full max-w-xl py-8 text-center sm:py-12">
        <AppEyebrow>Série terminée · {PILE_COUNT_TITLE} · {copy.name}</AppEyebrow>
        <h1 className="mt-3 text-3xl font-black">Résultat</h1>
        <p className="mt-5 text-5xl font-black text-[var(--accent)]">{score} / {PILE_COUNT_SERIES_LENGTH}</p>
        <p className="mt-2 text-lg font-semibold">{score * 10} % de bonnes réponses</p>
        {best !== null
          ? <p className="mt-4 text-sm text-[var(--text-secondary)]">Meilleur score en {copy.name} : {best} / {PILE_COUNT_SERIES_LENGTH}</p>
          : <p className="mt-4 text-sm text-[var(--text-secondary)]">Mode libre : ce score n’est pas enregistré comme record.</p>}
        {justUnlocked ? <p className="mt-3 font-bold text-[var(--success)]" role="status">Mode Normal débloqué !</p> : null}
        <div className="mt-7 flex flex-col justify-center gap-2 sm:flex-row sm:flex-wrap">
          <button className={appPrimaryActionClass} onClick={() => restart(progress)} type="button">Rejouer en {copy.name}</button>
          {justUnlocked ? <Link className={appSecondaryActionClass} href="/training/puzzle/pile-count?mode=normal">Passer en Normal</Link> : null}
          <Link className={appSecondaryActionClass} href="/training">Retour à l’entraînement</Link>
        </div>
      </AppSurface>
    </AppPage>;
  }

  const cardTotal = exercise.cards.length;
  return <AppPage width="wide">
    <Link className="coinche-ui-link w-fit text-sm font-bold" href="/training">← Changer d’exercice</Link>
    <AppSurface className="mx-auto w-full">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
          <h1 className="text-2xl font-black tracking-tight sm:text-3xl">{PILE_COUNT_TITLE}</h1>
          <p className="text-sm font-bold text-[var(--accent)]">Mode {copy.name}</p>
        </div>
        <span aria-label={`Tas ${index + 1} sur ${PILE_COUNT_SERIES_LENGTH}`} className="rounded-full border border-[var(--border)] bg-[var(--surface-raised)] px-3 py-1.5 text-sm font-bold">
          {index + 1} / {PILE_COUNT_SERIES_LENGTH}
        </span>
      </div>

      {phase === "briefing" ? <div className="mt-5">
        <p className="text-lg font-black">Voici le tas de plis de ton équipe : {exercise.trickCount} pli{exercise.trickCount > 1 ? "s" : ""}, soit {cardTotal} cartes.</p>
        <p className="mt-1 text-sm text-[var(--text-secondary)]">Retiens bien ces informations, puis compte les points au fil des cartes.</p>
        <div className="mt-4"><PileFacts exercise={exercise} /></div>
        {mode === "free" ? <div className="mt-5 max-w-sm">
          <label className="block text-sm font-bold" htmlFor="pile-speed">Vitesse : {formatSeconds(freeDelay)} par carte</label>
          <input
            className="mt-2 w-full accent-[var(--accent)]"
            id="pile-speed"
            max={FREE_SPEED.maxMs}
            min={FREE_SPEED.minMs}
            onChange={(event) => { const value = clampFreeDelay(Number(event.target.value)); setFreeDelay(value); saveFreeDelay(value); }}
            step={FREE_SPEED.stepMs}
            type="range"
            value={freeDelay}
          />
          <p className="mt-1 flex justify-between text-xs text-[var(--text-secondary)]"><span>Rapide</span><span>Lent</span></p>
        </div> : null}
        <button className={`${appPrimaryActionClass} mt-6 w-full sm:w-auto`} onClick={startScrolling} type="button">Lancer le défilement</button>
      </div> : null}

      {phase === "scrolling" ? <div className="mt-5">
        <PileFacts compact exercise={exercise} />
        <div className="mt-5"><PileCard card={exercise.cards[shown]} position={shown + 1} total={cardTotal} /></div>
        <p className="mt-4 text-center text-sm font-bold">Carte {shown + 1} / {cardTotal}</p>
        <div aria-hidden="true" className="mx-auto mt-2 h-1.5 w-full max-w-xs overflow-hidden rounded-full bg-[var(--border)]">
          <div className="h-full bg-[var(--accent)] transition-all" style={{ width: `${((shown + 1) / cardTotal) * 100}%` }} />
        </div>
        <div className="mt-4 flex justify-center">
          <button aria-pressed={paused} className={`${appSecondaryActionClass} min-w-32`} onClick={() => setPaused(!paused)} type="button">{paused ? "Reprendre" : "Pause"}</button>
        </div>
        {mode === "beginner" ? <ValueGuide /> : null}
      </div> : null}

      {phase === "answer" || phase === "feedback" ? <div className="mt-5 grid gap-6 md:grid-cols-[minmax(0,1.2fr)_minmax(280px,0.8fr)] md:gap-8">
        <div className="min-w-0">
          <p className="text-lg font-black">Combien de points ton équipe a-t-elle faits sur cette donne ?</p>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">Cartes du tas, plus le 10 de der et la belote si ton équipe les a.</p>
          <div className="mt-4"><PileFacts compact exercise={exercise} /></div>
        </div>
        <div className="min-w-0 md:border-l md:border-[var(--border)] md:pl-8">
          {phase === "answer"
            ? <NumberPad label="Ton total en points" onChange={setDraft} onSubmit={submit} value={draft} />
            : <div aria-live="polite" className="mx-auto max-w-sm rounded-xl border border-[var(--border)] bg-[var(--surface-raised)] p-4">
              <p className={`font-black ${correct ? "text-[var(--success)]" : "text-[var(--danger)]"}`}>{correct ? "Bonne réponse !" : "Mauvaise réponse"}</p>
              <p className="mt-1">Total : <strong>{formatPoints(exercise.answer)}</strong>{correct ? "" : ` (ta réponse : ${draft})`}</p>
              <Breakdown exercise={exercise} />
              <button className={`${appPrimaryActionClass} mt-4 min-h-11 w-full`} onClick={next} type="button">
                {index === series.length - 1 ? "Voir le résultat" : "Tas suivant"}
              </button>
            </div>}
        </div>
      </div> : null}
    </AppSurface>
  </AppPage>;
}
