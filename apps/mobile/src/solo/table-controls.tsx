import { useState } from "react";
import { Pressable, StyleSheet, type StyleProp, type ViewStyle } from "react-native";
import Animated from "react-native-reanimated";
import { SoloText as Text, useSoloAppearance } from "./appearance";

// The game's bespoke controls match KFFR web. Platform form controls use Expo UI.
export function TableButton({ label, onPress, disabled = false, selected = false, primary = false, accessibilityLabel = label, style, symbol = false, reduced = false, chrome = false, paper = false }: {
  label: string; onPress: () => void; disabled?: boolean; selected?: boolean; primary?: boolean; accessibilityLabel?: string; style?: StyleProp<ViewStyle>; symbol?: boolean; reduced?: boolean; chrome?: boolean; paper?: boolean;
}) {
  const [focused, setFocused] = useState(false);
  const appearance = useSoloAppearance();
  return <Pressable accessibilityRole="button" accessibilityLabel={accessibilityLabel} accessibilityState={{ disabled, selected }} aria-selected={selected} disabled={disabled} onPress={() => { appearance.sound(); onPress(); }}
    onFocus={() => setFocused(true)} onBlur={() => setFocused(false)} style={[control.target, style, focused && { outlineWidth: 2, outlineColor: "#ead8a6", outlineOffset: 2 }]}>
    {({ pressed }) => <Animated.View style={[control.face, appearance.contrast && { borderWidth: 2, borderColor: "#ffffffcc" }, chrome && { borderRadius: 14, borderColor: "#ead8a659", backgroundColor: "#10251bed" }, (primary || selected) && control.chosen, paper && { backgroundColor: "#f3ead2" }, disabled && { opacity: .58 }, { transform: [{ scale: pressed && !reduced && !appearance.reduced ? .98 : 1 }], transitionProperty: "transform", transitionDuration: reduced || appearance.reduced ? 0 : 100 }]}>
      <Text maxFontSizeMultiplier={1.5} style={[control.label, symbol && { fontSize: chrome ? 24 : 18 }, (primary || selected) && { color: "#17201a" }]}>{label}</Text>
    </Animated.View>}
  </Pressable>;
}
const control = StyleSheet.create({ target: { minWidth: 44, minHeight: 44 }, face: { flex: 1, minHeight: 44, alignItems: "center", justifyContent: "center", paddingHorizontal: 6, borderWidth: 1, borderColor: "#ffffff30", backgroundColor: "#ffffff0f", borderRadius: 8 }, chosen: { backgroundColor: "#ead8a6", borderColor: "#ead8a6" }, label: { color: "#f5f1e7", fontSize: 12, fontWeight: "800", textAlign: "center" } });
