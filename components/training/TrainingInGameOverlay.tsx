"use client";

import { useState } from "react";
import { cardId, SUIT_LABELS } from "@/engine/cards";
import { trainingAxes } from "@/engine/training/axes";
import type { InGameAnswer, InGameGrade } from "@/engine/training/inGame";
import { MEMORY_PLAYERS } from "@/engine/training/memory";
import type { PlayerId, Suit } from "@/engine/types";
import type { ScheduledInGameQuestion } from "@/lib/training/inGameScheduler";
import { AccessibleDialog } from "@/components/ui/AccessibleDialog";
import { appPrimaryActionClass } from "@/components/ui/AppShell";
import { CardSelection, cardAccessibleName } from "@/components/training/CardSelection";
import { NumberPad } from "@/components/training/NumberPad";
import { PlayerSuitGrid } from "@/components/training/PlayerSuitGrid";
import { TrickValueBoard } from "@/components/training/TrickValueBoard";
import { ValueGuide } from "@/components/training/TrainingPuzzleClient";

function namesFor(exercise: Extract<ScheduledInGameQuestion["exercise"], { kind: "cards" }>["data"], ids: readonly string[]): string {
  const names = new Map(exercise.candidates.map((card) => [cardId(card), cardAccessibleName(card)]));
  return ids.map((id) => names.get(id) ?? id).join(", ") || "aucune";
}

function VoidCorrection({ question, grade }: {
  question: Extract<ScheduledInGameQuestion["exercise"], { kind: "voids" }>;
  grade: Extract<InGameGrade, { kind: "voids" }>;
}) {
  const exercise = question.data;
  const label = (key: string) => {
    const [player, suit] = key.split(":");
    return `${exercise.playerNames[Number(player) as PlayerId]} · ${SUIT_LABELS[suit as Suit]}`;
  };
  return <div className="mt-3 space-y-1 text-sm">
    <p>Coupures prouvées trouvées : {grade.details.correctCells.map(label).join(", ") || "aucune"}.</p>
    <p>Coupures prouvées oubliées : {grade.details.missedCells.map(label).join(", ") || "aucune"}.</p>
    <p>Cases cochées sans preuve : {grade.details.unprovedCells.map(label).join(", ") || "aucune"}.</p>
    <p>Une case non prouvée ne dit rien de la main réelle du joueur.</p>
    {Object.entries(exercise.proofs).map(([key, proof]) => <p key={key}>Au pli {proof.trickNumber}, {exercise.playerNames[proof.playerId]} n’a pas fourni {SUIT_LABELS[proof.suit]}.</p>)}
    {exercise.level === 3 ? <p>Atouts restant hors de ta main : {exercise.expectedTrumpCount}.</p> : null}
  </div>;
}

export function TrainingInGameOverlay({ question, grade, onGrade, onResume }: {
  question: ScheduledInGameQuestion;
  grade: InGameGrade | null;
  onGrade: (answer: InGameAnswer) => void;
  onResume: () => void;
}) {
  const [numberInput, setNumberInput] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [assignments, setAssignments] = useState<Partial<Record<string, PlayerId>>>({});
  const [selectedCells, setSelectedCells] = useState<string[]>([]);
  const [trumpCountInput, setTrumpCountInput] = useState("");
  const exercise = question.exercise;
  const title = trainingAxes.resolve(question.axisId).label;
  const toggleCard = (id: string) => setSelectedIds((current) => current.includes(id)
    ? current.filter((value) => value !== id)
    : exercise.kind === "cards" && exercise.data.maxSelections !== undefined && current.length >= exercise.data.maxSelections
      ? current : [...current, id]);
  const submit = () => {
    if (grade) return;
    if (exercise.kind === "number" && numberInput) onGrade({ kind: "number", value: Number(numberInput) });
    if (exercise.kind === "cards" && (exercise.axisId !== "trick-recall" || selectedIds.length === 4)) {
      onGrade({ kind: "cards", selectedIds, assignments });
    }
    if (exercise.kind === "voids" && (exercise.data.level !== 3 || trumpCountInput !== "")) {
      onGrade({ kind: "voids", selectedCells, trumpCount: exercise.data.level === 3 ? Number(trumpCountInput) : null });
    }
  };

  return <AccessibleDialog title={title} description="La partie est en pause pendant cette question." onClose={() => {}} showCloseButton={false} width="medium">
    <div className="min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-contain px-4 py-5 sm:px-6">
      <p className="text-xs font-black uppercase tracking-widest text-[var(--ui-kicker)]">Entraînement en partie · Niveau {question.level}</p>
      {exercise.kind === "number" ? <>
        <p className="mt-2 text-lg font-black">Combien vaut ce pli ?</p>
        <div className="mt-4"><TrickValueBoard exercise={exercise.data} /></div>
        {question.level === 1 ? <ValueGuide /> : null}
        <div className="mt-5"><NumberPad value={numberInput} onChange={setNumberInput} onSubmit={submit} disabled={grade !== null} /></div>
      </> : null}
      {exercise.kind === "cards" ? <>
        <h3 className="mt-2 text-lg font-black">{exercise.data.question}</h3>
        {exercise.axisId === "master-in-hand" ? <p className="mt-1 text-sm">Sélectionne parmi les cartes de ta main.</p> : null}
        <div className="mt-4"><CardSelection cards={exercise.data.candidates} selectedCardIds={selectedIds}
          onToggle={toggleCard} disabled={grade !== null} maxSelections={exercise.data.maxSelections} /></div>
        {exercise.data.requiresPlayers && selectedIds.length > 0 ? <div className="mt-4 grid gap-2 sm:grid-cols-2">
          {selectedIds.map((id) => <fieldset key={id} disabled={grade !== null} className="min-w-0 rounded-xl border border-[var(--border)] p-2">
            <legend className="px-1 text-sm font-bold">{namesFor(exercise.data, [id])} · qui l’a jouée ?</legend>
            <div className="grid grid-cols-4 gap-1">{MEMORY_PLAYERS.map((playerId) => <button key={playerId} type="button"
              aria-pressed={assignments[id] === playerId} onClick={() => setAssignments({ ...assignments, [id]: playerId })}
              className={`min-h-11 min-w-0 rounded-md border px-1 text-xs font-bold ${assignments[id] === playerId ? "border-[var(--accent)] bg-[var(--accent)] text-white" : "border-[var(--border)]"}`}>
              {exercise.data.playerNames[playerId]}</button>)}</div>
          </fieldset>)}
        </div> : null}
        {!grade ? <button className={`${appPrimaryActionClass} mt-5 min-h-11`} disabled={exercise.axisId === "trick-recall" && selectedIds.length !== 4}
          onClick={submit} type="button">Valider la réponse</button> : null}
      </> : null}
      {exercise.kind === "voids" ? <>
        <h3 className="mt-2 text-lg font-black">{exercise.data.level === 1
          ? `Peut-on affirmer que ${exercise.data.playerNames[exercise.data.players[0]]} est coupé à ${SUIT_LABELS[exercise.data.suits[0]].toLowerCase()} ?`
          : "D’après les plis joués, quelles coupures sont certaines ?"}</h3>
        <p className="mt-2 text-sm">Coche seulement ce que les plis joués prouvent. Une case vide signifie « pas prouvé ».</p>
        <div className="mt-4"><PlayerSuitGrid players={exercise.data.players.map((id) => ({ id, name: exercise.data.playerNames[id] }))}
          suits={exercise.data.suits} selected={selectedCells} onToggle={(key) => setSelectedCells((current) => current.includes(key)
            ? current.filter((value) => value !== key) : [...current, key])} disabled={grade !== null}
          feedback={grade?.kind === "voids" ? grade.details : undefined} /></div>
        {exercise.data.level === 3 ? <div className="mt-5 max-w-sm"><NumberPad value={trumpCountInput}
          onChange={(value) => { if (value === "" || /^[0-8]$/.test(value)) setTrumpCountInput(value); }} onSubmit={submit}
          disabled={grade !== null} label="Combien d’atouts restent hors de ta main ?" /></div> : null}
        {!grade && exercise.data.level !== 3 ? <button className={`${appPrimaryActionClass} mt-5 min-h-11`} onClick={submit} type="button">Valider la réponse</button> : null}
      </> : null}
      {grade ? <section aria-live="polite" className="mt-5 rounded-xl border border-[var(--border)] bg-[var(--surface-raised)] p-4">
        <p className={`font-black ${grade.correct ? "text-[var(--success)]" : "text-[var(--danger)]"}`}>
          {grade.correct ? "Bonne réponse !" : "Correction"} · {grade.earnedScore} / {grade.possibleScore}
        </p>
        {exercise.kind === "number" ? <p className="mt-2">Ce pli vaut <strong>{exercise.data.answer} points</strong>.</p> : null}
        {exercise.kind === "cards" && grade.kind === "cards" ? <div className="mt-2 space-y-1 text-sm">
          <p>Bonnes sélections : {namesFor(exercise.data, grade.details.correctIds)}.</p>
          <p>Cartes oubliées : {namesFor(exercise.data, grade.details.missedIds)}.</p>
          <p>Cartes en trop : {namesFor(exercise.data, grade.details.extraIds)}.</p>
          {exercise.data.requiresPlayers ? <p>{grade.details.correctPlayers}/4 joueurs correctement attribués.</p> : null}
          {grade.details.wrongPlayers.length > 0 ? <p>Attributions à revoir : {namesFor(exercise.data, grade.details.wrongPlayers)}.</p> : null}
        </div> : null}
        {exercise.kind === "voids" && grade.kind === "voids" ? <VoidCorrection question={exercise} grade={grade} /> : null}
        <button className={`${appPrimaryActionClass} mt-5 min-h-11`} onClick={onResume} type="button">Reprendre la partie</button>
      </section> : null}
    </div>
  </AccessibleDialog>;
}
