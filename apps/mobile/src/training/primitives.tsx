import { Pressable, Text, View } from "react-native";
import { Button, styles } from "@/components/ui";
import { CardFace, cardLabel } from "@/solo/card-face";
import { tokens } from "@/theme/tokens";
import { cardId, SUIT_SYMBOLS } from "@/engine/cards";
import { cardPoints } from "@/engine/rules";
import type { Bid, Card, PlayedCard, PlayerId, Rank, Suit } from "@/engine/types";
import { formatBidLabel } from "@/lib/solo/tableAnnouncements";

export function Cards({ cards, selected = [], onToggle, disabled = false }: { cards: Card[]; selected?: string[]; onToggle?: (id: string) => void; disabled?: boolean }) {
  return <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>{cards.map((card) => {
    const id = cardId(card), checked = selected.includes(id);
    return <Pressable key={id} accessibilityRole={onToggle ? "checkbox" : "image"} accessibilityLabel={cardLabel(card)} accessibilityState={onToggle ? { checked, disabled } : undefined} disabled={!onToggle || disabled} onPress={() => onToggle?.(id)} style={{ padding: 3, minWidth: 50, minHeight: 76, borderWidth: 2, borderColor: checked ? tokens.colors.accent : "transparent", borderRadius: 10, backgroundColor: checked ? tokens.colors.raised : "transparent" }}><CardFace card={card} height={70} /></Pressable>;
  })}</View>;
}
export function PlayedCards({ cards, names, compact = false }: { cards: PlayedCard[]; names: Record<PlayerId, string>; compact?: boolean }) {
  return <View style={{ flexDirection: "row", flexWrap: "wrap", gap: compact ? 6 : 12 }}>{cards.map(({ card, playerId }) => <View key={cardId(card)} style={{ alignItems: "center", gap: 4, width: compact ? 48 : undefined }}><View accessible accessibilityLabel={`${names[playerId]} : ${cardLabel(card)}`}><CardFace card={card} height={compact ? 66 : 76} /></View><Text numberOfLines={1} style={[styles.hint, { maxWidth: compact ? 48 : 100 }]}>{names[playerId]}</Text></View>)}</View>;
}
export function NumberPad({ value, onChange, onSubmit, disabled = false, label = "Réponse en points", submitLabel = "Valider" }: { value: string; onChange: (s: string) => void; onSubmit: () => void; disabled?: boolean; label?: string; submitLabel?: string }) {
  return <View style={{ gap: 4, width: "100%", maxWidth: 340, alignSelf: "center" }}>
    <Text testID="training-answer" accessibilityLabel={`${label} : ${value || "vide"}`} accessibilityLiveRegion="polite" style={[styles.heading, { padding: 8, textAlign: "center", backgroundColor: tokens.colors.inset, minHeight: 44 }]}>{label} : {value || "—"}</Text>
    {[ ["1", "2", "3"], ["4", "5", "6"], ["7", "8", "9"], ["⌫", "0", submitLabel] ].map((row, i) => <View key={i} style={{ flexDirection: "row", gap: 8 }}>{row.map((key) => <View key={key} style={{ flex: 1 }}><Button label={key} disabled={disabled || key === submitLabel && !value} secondary={key !== submitLabel} accessibilityLabel={key === "⌫" ? "Supprimer le dernier chiffre" : key} onPress={() => key === submitLabel ? onSubmit() : onChange(key === "⌫" ? value.slice(0, -1) : value.length < 3 ? (value === "0" ? key : value + key) : value)} /></View>)}</View>)}
  </View>;
}
export function ValueGuide() {
  return <View style={{ gap: 8 }}><Text accessibilityRole="header" style={styles.heading}>Aide · Valeur des cartes</Text>{[{ label: "À l’atout", suit: "hearts" as const, ranks: ["J", "9", "A", "10", "K", "Q", "8", "7"] }, { label: "Hors atout", suit: "clubs" as const, ranks: ["A", "10", "K", "Q", "J", "9", "8", "7"] }].map((g) => <View key={g.label}><Text style={styles.body}>{g.label}</Text><View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>{g.ranks.map((rank) => <Text style={styles.hint} key={rank}>{rank} : {cardPoints({ rank: rank as Rank, suit: g.suit }, { kind: "suit", suit: "hearts" })}</Text>)}</View></View>)}</View>;
}
export function Auction({ bids, names, targetIndex }: { bids: Bid[]; names: Record<PlayerId, string>; targetIndex?: number }) {
  return <View style={{ gap: 6 }}><Text accessibilityRole="header" style={styles.heading}>Annonces précédentes</Text>{bids.length ? bids.map((bid, i) => <Text key={i} style={[styles.body, i === targetIndex && { color: tokens.colors.accent, fontWeight: "700" }]}>{i === targetIndex ? "→ " : ""}{names[bid.playerId]} : {formatBidLabel(bid).label}</Text>) : <Text style={styles.body}>Aucune annonce</Text>}</View>;
}
export function Trump({ suit }: { suit: Suit }) { return <Text style={[styles.body, { color: tokens.colors.accent }]}>Atout : {SUIT_SYMBOLS[suit]}</Text>; }
