import { StyleSheet, Text, View } from "react-native";
import { SUIT_LABELS, SUIT_SYMBOLS } from "@/engine/cards";
import type { Card } from "./contract";
export const cardLabel = (card: Card) => `${card.rank} ${SUIT_LABELS[card.suit]}`;
export function CardFace({ card, height, width = height * .68, modern = false, contrast = false }: { card: Card; height: number; width?: number; modern?: boolean; contrast?: boolean }) {
  const red = card.suit === "hearts" || card.suit === "diamonds";
  const ink = red ? "#b91c1c" : "#1c1917";
  const rank = { color: ink, fontWeight: "700" as const, fontSize: Math.min(24, Math.max(16, height * .2)), lineHeight: Math.min(24, Math.max(16, height * .2)) };
  return <View pointerEvents="none" accessible={false} style={[face.card, { width, height, borderRadius: modern ? 12 : 8, borderWidth: contrast ? 2 : 1, borderColor: contrast ? ink : red ? "#fecaca" : "#d6d3d1", backgroundColor: modern ? "#f7f8f7" : "#fffef9" }]}>
    <Text allowFontScaling={false} style={[rank, face.top]}>{card.rank}</Text>
    <Text allowFontScaling={false} style={{ color: ink, fontSize: Math.max(26, Math.min(40, height * .32)), lineHeight: Math.max(28, Math.min(42, height * .34)) }}>{SUIT_SYMBOLS[card.suit] + "\uFE0E"}</Text>
    <Text allowFontScaling={false} style={[rank, face.bottom]}>{card.rank}</Text>
  </View>;
}
const face = StyleSheet.create({ card: { alignItems: "center", justifyContent: "center", boxShadow: "0 7px 18px #00000038" }, top: { position: "absolute", top: 6, left: 6 }, bottom: { position: "absolute", bottom: 6, right: 6 } });
