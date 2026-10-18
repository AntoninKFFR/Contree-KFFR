import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { tokens } from "@/theme/tokens";

export function GameNavigation({ active, onSelect }: { active: string; onSelect: (name: "index" | "profile") => void }) {
  const insets = useSafeAreaInsets();
  return <View testID="game-navigation" style={[nav.bar, { paddingBottom: insets.bottom, paddingLeft: Math.max(8, insets.left), paddingRight: Math.max(8, insets.right) }]}>
    {(["index", "profile"] as const).map((name) => (
      <Pressable key={name} accessibilityRole="tab" accessibilityLabel={"Onglet " + (name === "index" ? "Accueil" : "Profil")}
        accessibilityState={{ selected: active === name }} onPress={() => onSelect(name)}
        style={({ pressed }) => [nav.item, active === name && nav.active, pressed && nav.pressed]}>
        <View style={[nav.indicator, active === name && nav.selectedIndicator]} />
        <Text style={[nav.label, active === name && nav.activeLabel]}>{name === "index" ? "Accueil" : "Profil"}</Text>
      </Pressable>
    ))}
  </View>;
}
const nav = StyleSheet.create({
  bar: { backgroundColor: tokens.colors.background, borderTopWidth: 1, borderColor: tokens.colors.hairline, flexDirection: "row", justifyContent: "center", gap: tokens.spacing.lg, paddingTop: 1 },
  item: { flex: 1, maxWidth: 180, height: 46, alignItems: "center", justifyContent: "center", borderRadius: tokens.radius.sm },
  active: { backgroundColor: tokens.colors.inset },
  pressed: { backgroundColor: tokens.colors.raised },
  indicator: { position: "absolute", top: 0, width: 28, height: 2, backgroundColor: tokens.colors.clear },
  selectedIndicator: { backgroundColor: tokens.colors.accent },
  label: { ...tokens.type.label, color: tokens.colors.muted, lineHeight: 19 },
  activeLabel: { color: tokens.colors.accent, fontWeight: "800" },
});
