"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { SUIT_LABELS } from "@/engine/cards";
import { generatorVersion } from "@/engine/training/generator";
import { generateOpponentVoidsSeries, gradeOpponentVoidsExercise, OPPONENT_VOIDS_SERIES_LENGTH, type OpponentVoidsExercise, type OpponentVoidsGrade } from "@/engine/training/opponentVoids";
import type { PlayerId, Suit } from "@/engine/types";
import { AppEyebrow, AppPage, AppSurface, appPrimaryActionClass, appSecondaryActionClass } from "@/components/ui/AppShell";
import { TrainingOwnHand, TrainingStudyPhase } from "@/components/training/MemoryStudyPhase";
import { NumberPad } from "@/components/training/NumberPad";
import { PlayerSuitGrid } from "@/components/training/PlayerSuitGrid";
import { isOpponentVoidsLevelUnlocked, opponentVoidsSeriesSeed, readTrainingProgress, recordOpponentVoidsSeries, saveTrainingProgress, type TrainingProgress } from "@/components/training/progress";

function cellLabel(exercise: OpponentVoidsExercise, key: string): string {
  const [player, suit] = key.split(":");
  return `${exercise.playerNames[Number(player) as PlayerId]} · ${SUIT_LABELS[suit as Suit]}`;
}

export function TrainingOpponentVoidsClient({ level }: { level: number }) {
  const [progress, setProgress] = useState<TrainingProgress | null>(null);
  const [locked, setLocked] = useState(false);
  const [series, setSeries] = useState<OpponentVoidsExercise[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [index, setIndex] = useState(0);
  const [studying, setStudying] = useState(true);
  const [selected, setSelected] = useState<string[]>([]);
  const [trumpCountInput, setTrumpCountInput] = useState("");
  const [grade, setGrade] = useState<OpponentVoidsGrade | null>(null);
  const [score, setScore] = useState(0);
  const [finished, setFinished] = useState(false);
  const [newlyUnlockedLevel, setNewlyUnlockedLevel] = useState<number | null>(null);

  useEffect(() => {
    const saved = readTrainingProgress();
    setProgress(saved);
    if (!isOpponentVoidsLevelUnlocked(saved, level)) { setLocked(true); return; }
    try { setSeries(generateOpponentVoidsSeries({ level, seed: opponentVoidsSeriesSeed(saved, level), generatorVersion })); }
    catch { setError("Impossible de préparer cette série."); }
  }, [level]);

  const exercise = series?.[index];
  const toggle = (key: string) => {
    if (grade) return;
    setSelected((current) => current.includes(key) ? current.filter((cell) => cell !== key) : [...current, key]);
  };
  const submit = () => {
    if (!exercise || grade || (level === 3 && trumpCountInput === "")) return;
    setGrade(gradeOpponentVoidsExercise(exercise, selected, level === 3 ? Number(trumpCountInput) : null));
  };
  const next = () => {
    if (!series || !progress || !grade) return;
    const nextScore = score + grade.score;
    if (index === OPPONENT_VOIDS_SERIES_LENGTH - 1) {
      const previousUnlocked = progress.axes["opponent-voids"].unlockedLevel;
      const updated = recordOpponentVoidsSeries(progress, level, nextScore);
      setNewlyUnlockedLevel(updated.axes["opponent-voids"].unlockedLevel > previousUnlocked ? updated.axes["opponent-voids"].unlockedLevel : null);
      saveTrainingProgress(updated);
      setProgress(updated);
      setScore(nextScore);
      setFinished(true);
    } else {
      setScore(nextScore); setIndex(index + 1); setStudying(true); setSelected([]); setTrumpCountInput(""); setGrade(null);
    }
  };
  const replay = () => {
    if (!progress) return;
    try {
      setSeries(generateOpponentVoidsSeries({ level, seed: opponentVoidsSeriesSeed(progress, level), generatorVersion }));
      setError(null); setIndex(0); setStudying(true); setSelected([]); setTrumpCountInput(""); setGrade(null);
      setScore(0); setFinished(false); setNewlyUnlockedLevel(null);
    } catch { setError("Impossible de préparer cette série."); }
  };

  if (locked) return <AppPage width="narrow"><AppSurface className="py-8 text-center">
    <AppEyebrow>Jeu des autres</AppEyebrow>
    <h1 className="mt-3 text-2xl font-black">Niveau {level} verrouillé</h1>
    <p className="mt-3 text-[var(--text-secondary)]">Obtiens 8/10 au niveau précédent pour débloquer ce niveau.</p>
    <Link className={`${appPrimaryActionClass} mt-6`} href="/training">Retour à l’entraînement</Link>
  </AppSurface></AppPage>;
  if (error) return <AppPage><AppSurface><p role="alert">{error}</p><Link href="/training">Retour à l’entraînement</Link></AppSurface></AppPage>;
  if (!progress || !series || !exercise) return <AppPage><AppSurface><p role="status">Préparation de la série…</p></AppSurface></AppPage>;
  if (finished) return <AppPage width="medium"><AppSurface className="mx-auto w-full max-w-xl py-8 text-center">
    <AppEyebrow>Série terminée · Jeu des autres · Niveau {level}</AppEyebrow>
    <h1 className="mt-3 text-3xl font-black">Résultat</h1>
    <p className="mt-5 text-5xl font-black text-[var(--accent)]">{score} / {OPPONENT_VOIDS_SERIES_LENGTH}</p>
    <p className="mt-3 text-sm">Meilleur score : {progress.axes["opponent-voids"].levels[level].bestScore} / 10</p>
    {newlyUnlockedLevel !== null ? <p className="mt-3 font-bold text-[var(--success)]">Niveau {newlyUnlockedLevel} débloqué !</p> : null}
    <div className="mt-6 flex flex-wrap justify-center gap-2">
      <button className={appPrimaryActionClass} onClick={replay} type="button">Rejouer</button>
      {newlyUnlockedLevel !== null ? <Link className={appSecondaryActionClass} href={`/training/puzzle/opponent-voids?level=${newlyUnlockedLevel}`}>Niveau {newlyUnlockedLevel}</Link> : null}
      <Link className={appSecondaryActionClass} href="/training">Retour à l’entraînement</Link>
    </div>
  </AppSurface></AppPage>;

  const players = exercise.players.map((id) => ({ id, name: exercise.playerNames[id] }));
  return <AppPage width="wide">
    <Link className="coinche-ui-link w-fit text-sm font-bold" href="/training">← Retour à l’entraînement</Link>
    <AppSurface className="mx-auto mt-3 w-full min-w-0">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div><AppEyebrow>Déduire · Niveau {level}</AppEyebrow><h1 className="mt-1 text-2xl font-black">Jeu des autres</h1></div>
        <span aria-label={`Exercice ${index + 1} sur ${OPPONENT_VOIDS_SERIES_LENGTH}`} className="rounded-full border border-[var(--border)] px-3 py-1.5 text-sm font-bold">{index + 1} / {OPPONENT_VOIDS_SERIES_LENGTH}</span>
      </div>
      <div className="mt-5 min-w-0">
        {studying ? <TrainingStudyPhase observation={exercise.observation} trump={exercise.trump} playerNames={exercise.playerNames}
          instruction="Observe les plis joués : une carte hors de la couleur demandée peut prouver une coupure." onAnswer={() => setStudying(false)} /> :
          <section aria-label="Question de déduction">
            <h2 className="text-lg font-black">{level === 1
              ? `Peut-on affirmer que ${exercise.playerNames[exercise.players[0]]} est coupé à ${SUIT_LABELS[exercise.suits[0]].toLowerCase()} ?`
              : "D’après les plis joués, quelles coupures sont certaines ?"}</h2>
            <p className="mt-2 text-sm">Coche uniquement les couleurs dont l’absence est prouvée par le jeu.</p>
            <p className="mt-1 text-xs text-[var(--text-secondary)]">Une case non cochée signifie « pas prouvé », pas « le joueur possède forcément cette couleur ».</p>
            {exercise.observation.ownHand ? <div className="mt-4"><TrainingOwnHand cards={exercise.observation.ownHand} /></div> : null}
            <div className="mt-4"><PlayerSuitGrid players={players} suits={exercise.suits} selected={selected} onToggle={toggle} disabled={grade !== null} feedback={grade ?? undefined} /></div>
            {level === 3 ? <div className="mt-5 max-w-sm">
              <NumberPad value={trumpCountInput} onChange={(value) => { if (value === "" || /^[0-8]$/.test(value)) setTrumpCountInput(value); }}
                onSubmit={submit} disabled={grade !== null} label="Combien d’atouts restent hors de ta main ?" />
            </div> : null}
            {!grade && level !== 3 ? <button className={`${appPrimaryActionClass} mt-5 min-h-11`} onClick={submit} type="button">Valider la réponse</button> : null}
            {grade ? <div aria-live="polite" className="mt-5 rounded-xl border border-[var(--border)] bg-[var(--surface-raised)] p-4">
              <p className={`font-black ${grade.correct ? "text-[var(--success)]" : "text-[var(--danger)]"}`}>{grade.correct ? "Bonne réponse !" : "Mauvaise réponse"} · {grade.score} point</p>
              {exercise.level === 1 && exercise.expectedCells.length === 0 ? <p className="mt-2 text-sm font-bold">Pas prouvé par les plis observés.</p> : null}
              <p className="mt-2 text-sm">Coupures correctement trouvées : {grade.correctCells.map((key) => cellLabel(exercise, key)).join(", ") || "aucune"}</p>
              <p className="text-sm">Coupures certaines oubliées : {grade.missedCells.map((key) => cellLabel(exercise, key)).join(", ") || "aucune"}</p>
              <p className="text-sm">Cases cochées sans preuve : {grade.unprovedCells.map((key) => cellLabel(exercise, key)).join(", ") || "aucune"}</p>
              {grade.unprovedCells.length > 0 ? <p className="text-sm">Pas prouvé par les plis observés.</p> : null}
              {Object.entries(exercise.proofs).map(([key, proof]) => <p key={key} className="mt-1 text-sm">Au pli {proof.trickNumber}, {exercise.playerNames[proof.playerId]} n’a pas fourni {SUIT_LABELS[proof.suit]}.</p>)}
              {level === 3 ? <p className="mt-2 text-sm font-bold">Atouts hors de ta main : {exercise.expectedTrumpCount}. {grade.trumpCountCorrect ? "Nombre correct." : "Nombre à revoir."}</p> : null}
              <button className={`${appPrimaryActionClass} mt-4 min-h-11`} onClick={next} type="button">{index === OPPONENT_VOIDS_SERIES_LENGTH - 1 ? "Voir le résultat" : "Exercice suivant"}</button>
            </div> : null}
          </section>}
      </div>
    </AppSurface>
  </AppPage>;
}
