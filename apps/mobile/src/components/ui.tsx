import type { ReactNode } from "react";
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { tokens } from "@/theme/tokens";

export function Screen({ children, bottomInset = false }: { children: ReactNode; bottomInset?: boolean }) {
  return (
    <SafeAreaView style={styles.screen} edges={bottomInset ? ["top", "left", "right", "bottom"] : ["top", "left", "right"]}>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.scroll}>
        <View style={styles.content}>{children}</View>
      </ScrollView>
    </SafeAreaView>
  );
}
export function Brand() {
  return <Image source={require("../../assets/kffr-logo.png")} resizeMode="contain" style={styles.logo} accessibilityLabel="KFFR Contrée" />;
}
export function Button({ label, onPress, disabled = false, secondary = false }: {
  label: string; onPress: () => void; disabled?: boolean; secondary?: boolean;
}) {
  return (
    <Pressable accessibilityRole="button" accessibilityState={{ disabled }} disabled={disabled} onPress={onPress}
      style={({ pressed }) => [styles.button, secondary && styles.secondaryButton, (disabled || pressed) && styles.dimmed]}>
      <Text style={[styles.buttonText, secondary && styles.secondaryText]}>{label}</Text>
    </Pressable>
  );
}
export const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: tokens.colors.background },
  scroll: { flexGrow: 1, padding: 22, paddingBottom: 32 },
  content: { width: "100%", maxWidth: 600, alignSelf: "center", gap: 20 },
  logo: { width: 126, height: 76, alignSelf: "flex-start" },
  eyebrow: { color: tokens.colors.accent, fontSize: 12, fontWeight: "800", letterSpacing: 2 },
  title: { color: tokens.colors.text, fontSize: 34, lineHeight: 41, fontWeight: "800" },
  heading: { color: tokens.colors.text, fontSize: 23, lineHeight: 30, fontWeight: "700" },
  body: { color: tokens.colors.muted, fontSize: 16, lineHeight: 24 },
  hint: { color: tokens.colors.muted, fontSize: 13, lineHeight: 20 },
  panel: { padding: 22, gap: 16, borderRadius: 20, borderWidth: 1, borderColor: tokens.colors.border, backgroundColor: tokens.colors.surface },
  button: { minHeight: 50, padding: 15, borderRadius: 12, backgroundColor: tokens.colors.accent, alignItems: "center", justifyContent: "center" },
  buttonText: { color: tokens.colors.background, fontSize: 16, fontWeight: "800", textAlign: "center" },
  secondaryButton: { backgroundColor: "transparent", borderWidth: 1, borderColor: tokens.colors.border },
  secondaryText: { color: tokens.colors.accent },
  dimmed: { opacity: 0.6 },
  error: { color: tokens.colors.danger, fontSize: 15, lineHeight: 23 },
});
