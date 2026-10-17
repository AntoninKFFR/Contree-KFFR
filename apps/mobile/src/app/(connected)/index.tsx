import { Pressable, StyleSheet, Text, View } from "react-native";
import { AccountGate } from "@/components/AccountGate";
import { Screen, styles, useGameLayout } from "@/components/ui";
import { tokens } from "@/theme/tokens";

const modes = [
  { symbol: "♠", title: "Jouer en solo", subtitle: "À ton rythme" },
  { symbol: "♥", title: "Multijoueur", subtitle: "Autour de la même table" },
  { symbol: "♣", title: "Entraînement", subtitle: "Affûte ton jeu" },
];
export default function HomeScreen() {
  const { compact, largeText } = useGameLayout();
  return <AccountGate>
    <Screen title="La contrée" profileLink>
      <View testID="home-table" style={local.table}>
        {!largeText ? <Text accessibilityRole="header" style={local.title}>Choisis ta table</Text> : null}
        <View style={[local.modes, { gap: compact ? 10 : 18 }]}>
          {modes.map((mode) => <Pressable testID="game-panel" key={mode.title} disabled accessibilityRole="button" accessibilityState={{ disabled: true }}
            accessibilityLabel={mode.title + ". Bientôt disponible sur iPhone."}
            style={[local.mode, { padding: compact ? 10 : 18, gap: compact ? 8 : 12 }]}>
            {!largeText ? <Text accessible={false} style={[local.symbol, { fontSize: compact ? 32 : 44 }]}>{mode.symbol}</Text> : null}
            <Text style={[local.modeTitle, { fontSize: largeText ? 14 : compact ? 16 : 19 }]}>{mode.title.replace("Multijoueur", "Multi\u00adjoueur").replace("Entraînement", "Entraî\u00adnement")}</Text>
            {!compact ? <Text style={styles.hint}>{mode.subtitle}</Text> : null}
            <Text style={local.badge}>Bientôt disponible</Text>
          </Pressable>)}
        </View>
      </View>
    </Screen>
  </AccountGate>;
}
const local = StyleSheet.create({
  table: { flex: 1, minHeight: 0, padding: 12, borderRadius: 28, borderWidth: 1, borderColor: "#244B36", backgroundColor: "#0B261A", gap: 12, justifyContent: "center" },
  title: { color: tokens.colors.text, fontSize: 18, lineHeight: 23, fontWeight: "600", textAlign: "center" },
  modes: { flexDirection: "row", justifyContent: "center", alignItems: "stretch", flex: 1, minHeight: 0, maxHeight: 260 },
  mode: { flex: 1, minWidth: 0, maxWidth: 290, backgroundColor: "#123522", borderColor: "#476544", borderWidth: 1, borderRadius: 16, justifyContent: "center", alignItems: "center" },
  symbol: { color: tokens.colors.accent },
  modeTitle: { color: tokens.colors.text, fontWeight: "800", textAlign: "center", maxWidth: "100%", flexShrink: 1 },
  badge: { color: tokens.colors.accent, fontSize: 12, lineHeight: 17, textAlign: "center", fontWeight: "600" },
});
