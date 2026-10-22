import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { Button, styles } from "@/components/ui";
import { tokens } from "@/theme/tokens";
import { cardId, SUIT_LABELS, SUIT_SYMBOLS } from "@/engine/cards";
import { MEMORY_PLAYERS, type MemoryExercise } from "@/engine/training/memory";
import { voidCellId, type OpponentVoidsExercise } from "@/engine/training/opponentVoids";
import type { SubmittedTrainingAnswer } from "@/engine/training/seriesContract";
import type { PlayerId } from "@/engine/types";
import { Cards, PlayedCards, Trump, NumberPad } from "./primitives";
import { cardLabel } from "@/solo/card-face";

export function Observation({ exercise, onAnswer }: { exercise: MemoryExercise | OpponentVoidsExercise; onAnswer: () => void }) {
  return <View style={{ gap: 12 }}><Text style={styles.body}>Observe les cartes jouées dans l’ordre des plis, puis mémorise-les.</Text><Trump suit={exercise.trump} />{exercise.observation.completedTricks.map((cards, i) => <View key={i} style={{ gap: 6 }}><Text style={styles.heading}>Pli {i + 1}</Text><PlayedCards cards={cards} names={exercise.playerNames} /></View>)}{exercise.observation.currentCards.length ? <><Text style={styles.heading}>Pli en cours</Text><PlayedCards cards={exercise.observation.currentCards} names={exercise.playerNames} /></> : null}{exercise.observation.ownHand ? <><Text style={styles.heading}>Ta main</Text><Cards cards={exercise.observation.ownHand} /></> : null}<Button label="Répondre" onPress={onAnswer} /></View>;
}
export function MemoryQuestion({ exercise, onSubmit, disabled }: { exercise: MemoryExercise; onSubmit: (a: SubmittedTrainingAnswer) => void; disabled: boolean }) {
  const [selected, select] = useState<string[]>([]), [assignments, assign] = useState<Partial<Record<string, PlayerId>>>({});
  return <View style={{ gap: 12 }}><Text accessibilityRole="header" style={styles.heading}>{exercise.question}</Text><Trump suit={exercise.trump} /><Cards cards={exercise.candidates} selected={selected} disabled={disabled} onToggle={(id) => {
    if (selected.includes(id)) { select(selected.filter((s) => s !== id)); assign((p) => { const next = { ...p }; delete next[id]; return next; }); }
    else if (exercise.maxSelections === undefined || selected.length < exercise.maxSelections) select([...selected, id]);
  }} />{exercise.requiresPlayers ? selected.map((id) => <View key={id}><Text style={styles.body}>{cardLabel(exercise.candidates.find((c) => cardId(c) === id)!)} · qui l’a jouée ?</Text><View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>{MEMORY_PLAYERS.map((playerId) => <Button key={playerId} label={exercise.playerNames[playerId]} secondary={assignments[id] !== playerId} disabled={disabled} onPress={() => assign({ ...assignments, [id]: playerId })} />)}</View></View>) : null}<Button label={selected.length ? "Valider la réponse" : "Valider : aucune carte"} disabled={disabled || exercise.axisId === "trick-recall" && selected.length !== 4} onPress={() => onSubmit({ kind: "cards", selectedIds: [...selected], assignments: { ...assignments } })} /></View>;
}
export function VoidsQuestion({ exercise, onSubmit, disabled }: { exercise: OpponentVoidsExercise; onSubmit: (a: SubmittedTrainingAnswer) => void; disabled: boolean }) {
  const [selected, select] = useState<string[]>([]), [count, setCount] = useState("");
  const submit = () => onSubmit({ kind: "voids", selectedCells: selected, trumpCount: exercise.level === 3 ? Number(count) : null });
  return <View style={{ gap: 12 }}><Text accessibilityRole="header" style={styles.heading}>Quelles coupures sont certaines ?</Text><Text style={styles.body}>Coche uniquement les couleurs dont l’absence est prouvée par les plis.</Text><Trump suit={exercise.trump} />{exercise.players.map((player) => <View key={player} style={{ gap: 8 }}><Text style={styles.body}>{exercise.playerNames[player]}</Text><View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>{exercise.suits.map((suit) => {
    const id = voidCellId(player, suit), checked = selected.includes(id);
    return <Pressable key={id} accessibilityRole="checkbox" accessibilityLabel={`${exercise.playerNames[player]} coupé à ${SUIT_LABELS[suit]}`} accessibilityState={{ checked, disabled }} disabled={disabled} onPress={() => select(checked ? selected.filter((s) => s !== id) : [...selected, id])} style={{ minWidth: 64, minHeight: 48, padding: 12, borderWidth: 1, borderRadius: 8, borderColor: checked ? tokens.colors.accent : tokens.colors.border, backgroundColor: checked ? tokens.colors.raised : tokens.colors.inset }}><Text style={styles.body}>{checked ? "✓ " : ""}{SUIT_SYMBOLS[suit]}</Text></Pressable>;
  })}</View></View>)}{exercise.observation.ownHand ? <><Text style={styles.heading}>Ta main</Text><Cards cards={exercise.observation.ownHand} /></> : null}{exercise.level === 3 ? <NumberPad label="Nombre d’atouts encore chez les autres joueurs" value={count} onChange={setCount} onSubmit={submit} disabled={disabled} /> : <Button label={selected.length ? "Confirmer" : "Confirmer : aucune coupure prouvée"} onPress={submit} disabled={disabled} />}</View>;
}
