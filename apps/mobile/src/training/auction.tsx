import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { Button, styles } from "@/components/ui";
import { tokens } from "@/theme/tokens";
import { BID_VALUES, canCoinche, canSurcoinche, canBidCapot, getAvailableBidValues } from "@/engine/bidding";
import { SUITS, SUIT_SYMBOLS, SUIT_LABELS } from "@/engine/cards";
import { type BiddingAnswer, type BiddingExercise } from "@/engine/training/bidding";
import { BID_READING_ASSERTION_LABELS, BID_READING_MEANING_LABELS, type BidReadingAnswer, type BidReadingExercise } from "@/engine/training/bidReading";
import type { PublicBidReadingExerciseView, RevealedBidReadingExerciseView } from "../../../../lib/trainingDuoTypes";
import { Auction, Cards } from "./primitives";

export function BiddingQuestion({ exercise, disabled, onSubmit }: { exercise: BiddingExercise; disabled: boolean; onSubmit: (v: BiddingAnswer) => void }) {
  const [suit, setSuit] = useState(SUITS[0]), [value, setValue] = useState<typeof BID_VALUES[number]>(() => getAvailableBidValues(exercise.currentContract)[0] ?? 80);
  const values = getAvailableBidValues(exercise.currentContract);
  return <View style={{ gap: 12 }}><Text style={styles.heading}>{exercise.question}</Text><Cards cards={exercise.ownHand} /><Auction bids={exercise.publicBids} names={exercise.playerNames} /><Text style={styles.body}>Choisis la couleur et le palier de ton annonce.</Text><View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>{SUITS.map((s) => <Button key={s} label={SUIT_SYMBOLS[s]} accessibilityLabel={`Couleur ${SUIT_LABELS[s]}`} secondary={suit !== s} onPress={() => setSuit(s)} disabled={disabled} />)}</View><View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>{BID_VALUES.map((n) => <Button key={n} label={String(n)} secondary={n !== value} disabled={disabled || !values.includes(n)} onPress={() => setValue(n)} />)}</View><Button label={`Annoncer ${value} ${SUIT_SYMBOLS[suit]}`} disabled={disabled || !values.includes(value)} onPress={() => onSubmit({ action: "bid", value, trump: suit })} /><View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>{(["pass", "coinche", "surcoinche"] as const).map((action) => <Button key={action} label={{ pass: "Passer", coinche: "Coincher", surcoinche: "Surcoincher" }[action]} secondary disabled={disabled || action === "coinche" && !canCoinche(0, exercise.currentContract) || action === "surcoinche" && !canSurcoinche(0, exercise.currentContract)} onPress={() => onSubmit({ action })} />)}<Button label={`Capot ${SUIT_SYMBOLS[suit]}`} secondary disabled={disabled || !canBidCapot(exercise.currentContract)} onPress={() => onSubmit({ action: "capot", trump: suit })} /></View></View>;
}
type PublicReading = Pick<BidReadingExercise, "publicBids" | "playerNames" | "targetBidIndex" | "targetPlayerId" | "assertionChoices"> | PublicBidReadingExerciseView;
export function ReadingQuestion({ exercise, disabled, onSubmit }: { exercise: PublicReading; disabled: boolean; onSubmit: (v: BidReadingAnswer) => void }) {
  const [selected, select] = useState<BidReadingAnswer["selectedAssertionIds"]>([]);
  return <View style={{ gap: 12 }}><Auction bids={exercise.publicBids} names={exercise.playerNames} targetIndex={exercise.targetBidIndex} /><Text accessibilityRole="header" style={styles.heading}>Que peux-tu affirmer sur l’enchère de {exercise.playerNames[exercise.targetPlayerId]} ?</Text>{exercise.assertionChoices.map((id) => {
    const checked = selected.includes(id);
    return <Pressable key={id} accessibilityRole="checkbox" accessibilityState={{ checked, disabled }} disabled={disabled} onPress={() => select(checked ? selected.filter((s) => s !== id) : [...selected, id])} style={{ minHeight: 48, padding: 12, borderWidth: 1, borderColor: checked ? tokens.colors.accent : tokens.colors.border, borderRadius: 12, backgroundColor: checked ? tokens.colors.raised : tokens.colors.inset }}><Text style={styles.body}>{checked ? "✓ " : ""}{BID_READING_ASSERTION_LABELS[id]}</Text></Pressable>;
  })}<Button label={selected.length ? "Valider les affirmations" : "Valider : aucune affirmation"} disabled={disabled} onPress={() => onSubmit({ selectedAssertionIds: selected })} /></View>;
}
export function ReadingCorrection({ exercise }: { exercise: Pick<BidReadingExercise, "promise" | "illustrationHand"> | RevealedBidReadingExerciseView }) {
  return <View style={{ gap: 8 }}><Text style={styles.heading}>Ce que promet la doctrine</Text>{exercise.promise.guaranteed.map((id) => <Text key={id} style={styles.body}>• {BID_READING_ASSERTION_LABELS[id]}</Text>)}<Text style={styles.body}>Sens possibles : {exercise.promise.possibleMeanings.map((id) => BID_READING_MEANING_LABELS[id]).join(" ; ")}</Text>{exercise.promise.explanation.map((line, i) => <Text key={i} style={styles.body}>{line}</Text>)}<Text style={styles.body}>Une main possible compatible avec cette annonce :</Text><Cards cards={exercise.illustrationHand} /><Text style={styles.hint}>Cette illustration ne révèle pas toutes les mains possibles.</Text></View>;
}

