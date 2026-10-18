import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { tokens } from "@/theme/tokens";

export function GameNavigation({ active, onSelect }: { active: string; onSelect: (name: "index" | "profile") => void }) {
  const insets = useSafeAreaInsets();
  return <View testID="game-navigation" style={[nav.bar, { paddingBottom: insets.bottom, paddingLeft: Math.max(8, insets.left), paddingRight: Math.max(8, insets.right) }]}>
    {(["index", "profile"] as const).map((name) => (
      <Pressable key={name} accessibilityRole="tab" accessibilityLabel={"Onglet " + (name === "index" ? "Accueil" : "Profil")}
        accessibilityState={{ selected: active === name }} onPress={() => onSelect(name)}
        style={({ pressed }) => [nav.item, active === name && nav.active, pressed && { opacity: 0.7 }]}>
        <Text style={[nav.label, active === name && nav.activeLabel]}>{name === "index" ? "Accueil" : "Profil"}</Text>
      </Pressable>
    ))}
  </View>;
}
const nav = StyleSheet.create({
  bar: { backgroundColor: tokens.colors.background, borderTopWidth: 1, borderColor: tokens.colors.border, flexDirection: "row", gap: 12, paddingTop: 1 },
  item: { flex: 1, height: 46, alignItems: "center", justifyContent: "center", borderRadius: 10 },
  active: { backgroundColor: tokens.colors.surface },
  label: { color: tokens.colors.muted, fontSize: 14, lineHeight: 19, fontWeight: "600" },
  activeLabel: { color: tokens.colors.accent, fontWeight: "800" },
});
