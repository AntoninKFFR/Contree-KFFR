import { Pressable, StyleSheet, Text, View } from "react-native";
import { AccountGate } from "@/components/AccountGate";
import { Screen, useGameLayout } from "@/components/ui";
import { ClubSignature } from "@/components/table-art";
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
        {!largeText ? <ClubSignature compact={compact} /> : null}
        <View style={[local.menu, largeText && local.expandedMenu]}>
          {!compact ? <Text accessibilityRole="header" style={local.eyebrow}>CHOISIS TA TABLE</Text> : null}
          <View style={[local.modes, largeText && local.largeModes]}>
          {modes.map((mode) => <Pressable testID="game-panel" key={mode.title} disabled accessibilityRole="button" accessibilityState={{ disabled: true }}
            accessibilityLabel={mode.title + ". Bientôt disponible sur iPhone."}
            style={[local.mode, largeText && local.largeMode]}>
            {!largeText ? <View style={local.seal} accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants"><Text allowFontScaling={false} style={local.symbol}>{mode.symbol + "\uFE0E"}</Text></View> : null}
            <View style={[local.modeCopy, largeText && local.largeCopy]}>
              <Text style={[local.modeTitle, largeText && local.largeTitle]}>{mode.title.replace("Multijoueur", "Multi\u00adjoueur").replace("Entraînement", "Entraî\u00adnement")}</Text>
              {!compact ? <Text style={local.subtitle}>{mode.subtitle}</Text> : null}
              <Text style={local.badge}>Bientôt disponible</Text>
            </View>
          </Pressable>)}
          </View>
        </View>
      </View>
    </Screen>
  </AccountGate>;
}
const local = StyleSheet.create({
  table: { flex: 1, minHeight: 0, flexDirection: "row", alignItems: "stretch", gap: tokens.spacing.md },
  menu: { flex: 1.6, minWidth: 0, minHeight: 0, justifyContent: "center", gap: tokens.spacing.sm, paddingVertical: tokens.spacing.xs },
  expandedMenu: { flex: 1 },
  eyebrow: { ...tokens.type.eyebrow, color: tokens.colors.muted },
  modes: { flex: 1, minHeight: 0, gap: tokens.spacing.xs, maxHeight: 258 },
  largeModes: { flexDirection: "row" },
  mode: { flex: 1, minWidth: 0, minHeight: 44, maxHeight: 82, flexDirection: "row", alignItems: "center", paddingHorizontal: tokens.spacing.md, gap: tokens.spacing.sm, borderRadius: tokens.radius.md, borderCurve: "continuous", backgroundColor: tokens.colors.surface, borderColor: tokens.colors.border, borderWidth: 1, boxShadow: tokens.shadow.panel },
  largeMode: { maxHeight: "100%", flexDirection: "column", justifyContent: "center", padding: tokens.spacing.xs },
  seal: { width: 38, height: 42, alignItems: "center", justifyContent: "center", borderRightWidth: 1, borderColor: tokens.colors.border, paddingRight: tokens.spacing.xs },
  symbol: { color: tokens.colors.accent, fontSize: 27, lineHeight: 34 },
  modeCopy: { flex: 1, minWidth: 0 },
  largeCopy: { flex: undefined, alignItems: "center", alignSelf: "stretch", gap: tokens.spacing.xs },
  modeTitle: { ...tokens.type.heading, fontSize: 20, lineHeight: 24, color: tokens.colors.text },
  largeTitle: { ...tokens.type.label, textAlign: "center" },
  subtitle: { ...tokens.type.caption, color: tokens.colors.muted },
  badge: { ...tokens.type.caption, color: tokens.colors.accent, flexShrink: 1, textAlign: "left" },
});
