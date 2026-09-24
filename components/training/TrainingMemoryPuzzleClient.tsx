"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { cardId } from "@/engine/cards";
import { generatorVersion } from "@/engine/training/generator";
import { generateMemorySeries, gradeMemoryExercise, MEMORY_LABELS, MEMORY_PLAYERS, MEMORY_SERIES_LENGTH, type MemoryAxisId, type MemoryExercise, type MemoryGrade } from "@/engine/training/memory";
import type { PlayerId } from "@/engine/types";
import { AppEyebrow, AppPage, AppSurface, appPrimaryActionClass, appSecondaryActionClass } from "@/components/ui/AppShell";
import { CardSelection, cardAccessibleName } from "@/components/training/CardSelection";
import { MemoryStudyPhase } from "@/components/training/MemoryStudyPhase";
import { isMemoryLevelUnlocked, memorySeriesSeed, readTrainingProgress, recordMemorySeries, saveTrainingProgress, type TrainingProgress } from "@/components/training/progress";

function cardNames(exercise: MemoryExercise, ids: readonly string[]): string {
  const byId = new Map(exercise.candidates.map((card) => [cardId(card), cardAccessibleName(card)]));
  return ids.map((id) => byId.get(id) ?? id).join(", ") || "aucune";
}

export function TrainingMemoryPuzzleClient({ axisId, level }: { axisId: MemoryAxisId; level: number }) {
  const [progress, setProgress] = useState<TrainingProgress | null>(null);
  const [locked, setLocked] = useState(false);
  const [series, setSeries] = useState<MemoryExercise[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [index, setIndex] = useState(0);
  const [studying, setStudying] = useState(true);
  const [selected, setSelected] = useState<string[]>([]);
  const [assignments, setAssignments] = useState<Partial<Record<string, PlayerId>>>({});
  const [grade, setGrade] = useState<MemoryGrade | null>(null);
  const [score, setScore] = useState(0);
  const [finished, setFinished] = useState(false);

  useEffect(() => {
    const saved = readTrainingProgress();
    setProgress(saved);
    if (!isMemoryLevelUnlocked(saved, axisId, level)) { setLocked(true); return; }
    try { setSeries(generateMemorySeries({ axisId, level, seed: memorySeriesSeed(saved, axisId, level), generatorVersion })); }
    catch { setError("Impossible de préparer cette série."); }
  }, [axisId, level]);

  const exercise = series?.[index];
  const startSeries = (saved: TrainingProgress) => {
    try {
      setSeries(generateMemorySeries({ axisId, level, seed: memorySeriesSeed(saved, axisId, level), generatorVersion }));
      setError(null);
      setIndex(0); setStudying(true); setSelected([]); setAssignments({}); setGrade(null); setScore(0); setFinished(false);
    } catch { setError("Impossible de préparer cette série."); }
  };
  const toggle = (id: string) => {
    if (!exercise || grade) return;
    if (selected.includes(id)) {
      setSelected(selected.filter((value) => value !== id));
      setAssignments((previous) => { const next = { ...previous }; delete next[id]; return next; });
    } else if (exercise.maxSelections === undefined || selected.length < exercise.maxSelections) {
      setSelected([...selected, id]);
    }
  };
  const submit = () => {
    if (!exercise || grade || (exercise.axisId === "trick-recall" && selected.length !== 4)) return;
    setGrade(gradeMemoryExercise(exercise, selected, assignments));
  };
  const next = () => {
    if (!series || !progress || !grade) return;
    const nextScore = score + grade.score;
    if (index === MEMORY_SERIES_LENGTH - 1) {
      const updated = recordMemorySeries(progress, axisId, level, nextScore);
      saveTrainingProgress(updated);
      setProgress(updated);
      setScore(nextScore);
      setFinished(true);
    } else {
      setScore(nextScore); setIndex(index + 1); setStudying(true); setSelected([]); setAssignments({}); setGrade(null);
    }
  };

  if (locked) return <AppPage width="narrow"><AppSurface className="py-8 text-center">
    <AppEyebrow>{MEMORY_LABELS[axisId]}</AppEyebrow>
    <h1 className="mt-3 text-2xl font-black">Niveau {level} verrouillé</h1>
    <p className="mt-3 text-[var(--text-secondary)]">Obtiens 8/10 au niveau précédent pour débloquer ce niveau.</p>
    <Link className={`${appPrimaryActionClass} mt-6`} href="/training">Retour à l’entraînement</Link>
  </AppSurface></AppPage>;
  if (error) return <AppPage><AppSurface><p role="alert">{error}</p><Link href="/training">Retour à l’entraînement</Link></AppSurface></AppPage>;
  if (!progress || !series || !exercise) return <AppPage><AppSurface><p role="status">Préparation de la série…</p></AppSurface></AppPage>;
  if (finished) return <AppPage width="medium"><AppSurface className="mx-auto w-full max-w-xl py-8 text-center">
    <AppEyebrow>Série terminée · {MEMORY_LABELS[axisId]} · Niveau {level}</AppEyebrow>
    <h1 className="mt-3 text-3xl font-black">Résultat</h1>
    <p className="mt-5 text-5xl font-black text-[var(--accent)]">{score} / {MEMORY_SERIES_LENGTH}</p>
    <p className="mt-3 text-sm">Meilleur score : {progress.axes[axisId].levels[level].bestScore} / 10</p>
    {level < progress.axes[axisId].unlockedLevel ? <p className="mt-3 font-bold text-[var(--success)]">Niveau {level + 1} débloqué !</p> : null}
    <div className="mt-6 flex flex-wrap justify-center gap-2">
      <button className={appPrimaryActionClass} onClick={() => startSeries(progress)} type="button">Rejouer</button>
      {level < progress.axes[axisId].unlockedLevel ? <Link className={appSecondaryActionClass} href={`/training/puzzle/${axisId}?level=${level + 1}`}>Niveau {level + 1}</Link> : null}
      <Link className={appSecondaryActionClass} href="/training">Retour à l’entraînement</Link>
    </div>
  </AppSurface></AppPage>;

  return <AppPage width="wide">
    <Link className="coinche-ui-link w-fit text-sm font-bold" href="/training">← Retour à l’entraînement</Link>
    <AppSurface className="mx-auto mt-3 w-full min-w-0">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div><AppEyebrow>Mémoriser · Niveau {level}</AppEyebrow><h1 className="mt-1 text-2xl font-black">{MEMORY_LABELS[axisId]}</h1></div>
        <span aria-label={`Exercice ${index + 1} sur ${MEMORY_SERIES_LENGTH}`} className="rounded-full border border-[var(--border)] px-3 py-1.5 text-sm font-bold">{index + 1} / {MEMORY_SERIES_LENGTH}</span>
      </div>
      <div className="mt-5 min-w-0">
        {studying ? <MemoryStudyPhase exercise={exercise} onAnswer={() => setStudying(false)} /> : <section aria-label="Question mémoire">
          <h2 className="text-lg font-black">{exercise.question}</h2>
          {exercise.axisId === "master-in-hand" ? <p className="mt-1 text-sm text-[var(--text-secondary)]">Sélectionne parmi les cartes de ta main.</p> : null}
          <div className="mt-4"><CardSelection cards={exercise.candidates} selectedCardIds={selected} onToggle={toggle} disabled={grade !== null} maxSelections={exercise.maxSelections} /></div>
          {exercise.requiresPlayers && selected.length > 0 ? <div className="mt-4 grid gap-2 sm:grid-cols-2">
            {selected.map((id) => {
              const card = exercise.candidates.find((candidate) => cardId(candidate) === id)!;
              return <fieldset key={id} disabled={grade !== null} className="rounded-xl border border-[var(--border)] p-2">
                <legend className="px-1 text-sm font-bold">{cardAccessibleName(card)} · qui l’a jouée ?</legend>
                <div className="grid grid-cols-4 gap-1">
                  {MEMORY_PLAYERS.map((playerId) => <button type="button" key={playerId} aria-pressed={assignments[id] === playerId}
                    onClick={() => setAssignments({ ...assignments, [id]: playerId })}
                    className={`min-h-11 min-w-0 rounded-md border px-1 text-xs font-bold focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)] ${assignments[id] === playerId ? "border-[var(--accent)] bg-[var(--accent)] text-white" : "border-[var(--border)]"}`}>
                    {exercise.playerNames[playerId]}
                  </button>)}
                </div>
              </fieldset>;
            })}
          </div> : null}
          {grade ? <div aria-live="polite" className="mt-5 rounded-xl border border-[var(--border)] bg-[var(--surface-raised)] p-4">
            <p className={`font-black ${grade.correct ? "text-[var(--success)]" : "text-[var(--danger)]"}`}>{grade.correct ? "Bonne réponse !" : "Mauvaise réponse"} · {grade.score} point{grade.score > 1 ? "s" : ""}</p>
            <p className="mt-2 text-sm">Bonnes sélections : {cardNames(exercise, grade.correctIds)}</p>
            <p className="text-sm">Cartes oubliées : {cardNames(exercise, grade.missedIds)}</p>
            <p className="text-sm">Cartes en trop : {cardNames(exercise, grade.extraIds)}</p>
            {exercise.axisId === "trick-recall" ? <p className="mt-1 text-sm">{grade.correctIds.length}/4 cartes retrouvées{exercise.requiresPlayers ? ` · ${grade.correctPlayers}/4 joueurs correctement attribués` : ""}</p> : null}
            {grade.wrongPlayers.length > 0 ? <p className="text-sm">Attributions à revoir : {cardNames(exercise, grade.wrongPlayers)}.</p> : null}
            <button type="button" className={`${appPrimaryActionClass} mt-4 min-h-11`} onClick={next}>{index === MEMORY_SERIES_LENGTH - 1 ? "Voir le résultat" : "Exercice suivant"}</button>
          </div> : <button type="button" className={`${appPrimaryActionClass} mt-5 min-h-11`} onClick={submit}
            disabled={exercise.axisId === "trick-recall" && selected.length !== 4}>
            {selected.length === 0 ? "Valider : aucune carte" : "Valider la réponse"}
          </button>}
        </section>}
      </div>
    </AppSurface>
  </AppPage>;
}
