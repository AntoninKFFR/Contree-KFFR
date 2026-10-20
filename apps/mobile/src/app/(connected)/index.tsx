import { Pressable, StyleSheet, Text, View } from "react-native";
import { AccountGate } from "@/components/AccountGate";
import { Brand, Screen, useGameLayout } from "@/components/ui";
import { tokens } from "@/theme/tokens";

const modes = ["Solo", "Multijoueur", "Entraînement"] as const;
export default function HomeScreen() {
  const { largeText } = useGameLayout();
  return <AccountGate bottomInset>
    <Screen bottomInset minimalHeader profileLink>
      <View testID="home-table" style={local.table}>
        <View testID="home-brand" style={local.brand}><Brand placement="table" /></View>
        <View style={local.modes}>
          {modes.map((title) => <Pressable testID="game-panel" key={title} disabled accessibilityRole="button" accessibilityState={{ disabled: true }}
            accessibilityLabel={title + ". Bientôt disponible sur iPhone."} style={local.mode}>
            <Text style={[local.modeTitle, largeText && local.largeTitle]}>{title}</Text>
          </Pressable>)}
        </View>
      </View>
    </Screen>
  </AccountGate>;
}
const local = StyleSheet.create({
  table: { flex: 1, minHeight: 0, width: "100%", maxWidth: 760, alignSelf: "center", flexDirection: "row", alignItems: "center", gap: tokens.spacing.lg },
  brand: { flex: 1, minWidth: 0, alignItems: "center", justifyContent: "center" },
  modes: { flex: 1.5, minWidth: 0, height: "100%", maxHeight: 244, justifyContent: "center", gap: tokens.spacing.md, paddingVertical: tokens.spacing.xs },
  mode: { flex: 1, minWidth: 0, minHeight: 44, maxHeight: 64, alignItems: "center", justifyContent: "center", paddingHorizontal: tokens.spacing.sm, borderRadius: tokens.radius.md, borderCurve: "continuous", backgroundColor: tokens.colors.surface, borderColor: tokens.colors.border, borderWidth: 1, boxShadow: tokens.shadow.panel },
  modeTitle: { ...tokens.type.heading, color: tokens.colors.text, textAlign: "center", maxWidth: "100%" },
  largeTitle: { ...tokens.type.label },
});
