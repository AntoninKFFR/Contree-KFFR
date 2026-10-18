// Alternative art direction. This prototype is only reachable in the RN Web QA
// harness; neither this screen nor its palette is imported by the Expo app.
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Screen, useGameLayout } from "../../../src/components/ui";
import { tokens as t } from "../../../src/theme/tokens";

const modes = [
  { rank: "A", suit: "♠", title: "Jouer en solo", detail: "À ton rythme" },
  { rank: "R", suit: "♥", title: "Multijoueur", detail: "Autour de la même table" },
  { rank: "V", suit: "♣", title: "Entraînement", detail: "Affûte ton jeu" },
];
export default function SalonProposal() {
  const { compact } = useGameLayout();
  return <Screen title="La contrée" profileLink>
    <View style={s.table}>
      <View style={s.heading}><View style={s.line} /><Text style={s.title}>Le salon des joueurs</Text><View style={s.line} /></View>
      <View style={s.cards}>
        {modes.map((mode) => <Pressable key={mode.title} disabled accessibilityRole="button" accessibilityState={{ disabled: true }} accessibilityLabel={mode.title + ". Bientôt disponible sur iPhone."} style={[s.card, compact && s.compact]}>
          <View style={s.top}><Text allowFontScaling={false} style={s.rank}>{mode.rank}</Text><Text allowFontScaling={false} style={s.rank}>{mode.suit}</Text></View>
          <Text allowFontScaling={false} accessible={false} style={[s.suit, mode.suit === "♥" && s.red, compact && { fontSize: 32, lineHeight: 38 }]}>{mode.suit + "\uFE0E"}</Text>
          <Text style={[s.label, compact && { fontSize: 16, lineHeight: 20 }]}>{mode.title}</Text>
          {!compact ? <Text style={s.detail}>{mode.detail}</Text> : null}
          <View style={s.rule} /><Text style={s.badge}>Bientôt disponible</Text>
        </Pressable>)}
      </View>
    </View>
  </Screen>;
}
const s = StyleSheet.create({
  table: { flex: 1, gap: t.spacing.sm, paddingVertical: t.spacing.xs },
  heading: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: t.spacing.md },
  line: { height: 1, flex: 1, backgroundColor: t.colors.border },
  title: { ...t.type.heading, color: t.colors.accent },
  cards: { flex: 1, minHeight: 0, flexDirection: "row", gap: t.spacing.md },
  card: { flex: 1, minWidth: 0, padding: t.spacing.md, alignItems: "center", justifyContent: "center", backgroundColor: t.colors.paper, borderWidth: 2, borderColor: t.colors.accent, borderRadius: t.radius.sm, boxShadow: t.shadow.card, gap: t.spacing.xxs },
  compact: { padding: t.spacing.xs },
  top: { flexDirection: "row", alignSelf: "stretch", justifyContent: "space-between" },
  rank: { ...t.type.label, color: t.colors.cardInk },
  suit: { color: t.colors.cardInk, fontSize: 44, lineHeight: 50 },
  red: { color: t.colors.cardRed },
  label: { ...t.type.heading, fontSize: 20, lineHeight: 24, color: t.colors.cardInk, textAlign: "center" },
  detail: { ...t.type.caption, color: t.colors.cardInk, textAlign: "center" },
  rule: { height: 1, width: 28, backgroundColor: t.colors.cardInk, marginVertical: t.spacing.xxs },
  badge: { ...t.type.caption, color: t.colors.cardInk, textAlign: "center" },
});
