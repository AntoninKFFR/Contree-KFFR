import { StyleSheet, Text, View } from "react-native";
import { Image } from "expo-image";
import felt from "../../assets/felt-table.png";
import { tokens as t } from "@/theme/tokens";

export function TableBackdrop() {
  return <View style={StyleSheet.absoluteFill} pointerEvents="none" accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants"><Image source={felt} contentFit="cover" cachePolicy="memory-disk" transition={0} style={StyleSheet.absoluteFill} accessible={false} /></View>;
}

/** Decorative cards are original native views, never controls or fake playable cards. */
export function CardFan({ compact = false }: { compact?: boolean }) {
  return <View style={[art.fan, compact && art.smallFan]} accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
    <View style={art.rail} />
    {([{ rank: "R", suit: "♣", angle: "-17deg", left: 22, top: 14 },
      { rank: "A", suit: "♥", angle: "-2deg", left: 66, top: 1 },
      { rank: "A", suit: "♠", angle: "15deg", left: 110, top: 12 }] as const).map((card) => (
      <View key={card.suit} style={[art.card, { left: card.left, top: card.top, transform: [{ rotate: card.angle }] }]}>
        <Text allowFontScaling={false} style={[art.rank, card.suit === "♥" && art.red]}>{card.rank}</Text>
        <Text allowFontScaling={false} style={[art.suit, card.suit === "♥" && art.red]}>{card.suit + "\uFE0E"}</Text>
        <View style={art.cardRule} />
      </View>
    ))}
  </View>;
}

export function ClubSignature({ compact = false }: { compact?: boolean }) {
  return <View style={art.signature}>
    {!compact ? <Text style={art.eyebrow}>LE CLUB KFFR</Text> : null}
    <Text accessibilityRole="header" style={[art.title, compact ? t.type.displayCompact : t.type.display]}>L’art de{"\n"}la contrée.</Text>
    <CardFan compact={compact} />
  </View>;
}

const art = StyleSheet.create({
  signature: { flex: 1, minWidth: 0, alignItems: "center", justifyContent: "center", gap: t.spacing.xs },
  eyebrow: { ...t.type.eyebrow, color: t.colors.accent },
  title: { color: t.colors.text, textAlign: "center" },
  // Optical card geometry: independent of text scaling, hidden from assistive tech.
  fan: { width: 206, height: 124 },
  smallFan: { transform: [{ scale: 0.78 }], height: 104, marginTop: -8 },
  rail: { position: "absolute", left: 2, right: 2, bottom: 0, height: 48, borderBottomWidth: 1, borderColor: t.colors.border, borderRadius: t.radius.round },
  card: { position: "absolute", width: 68, height: 98, padding: 6, borderRadius: t.radius.sm, backgroundColor: t.colors.paper, borderWidth: 1, borderColor: t.colors.accent, boxShadow: t.shadow.card },
  rank: { fontFamily: "Georgia", color: t.colors.cardInk, fontSize: 18, lineHeight: 22 },
  suit: { color: t.colors.cardInk, textAlign: "center", fontSize: 38, lineHeight: 44 },
  red: { color: t.colors.cardRed },
  cardRule: { height: 1, backgroundColor: t.colors.accent, marginTop: 6, marginHorizontal: 10 },
});
