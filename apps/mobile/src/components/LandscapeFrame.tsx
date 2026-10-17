import { useEffect, type ReactNode } from "react";
import { AppState, Platform, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import * as Orientation from "expo-screen-orientation";
import { tokens } from "@/theme/tokens";

export async function requestLandscape(isCurrent: () => boolean = () => true) {
  if (Platform.OS !== "ios" || !isCurrent()) return;
  try {
    if (await Orientation.supportsOrientationLockAsync(Orientation.OrientationLock.LANDSCAPE) && isCurrent()) {
      await Orientation.lockAsync(Orientation.OrientationLock.LANDSCAPE);
    }
  } catch {
    // Expo Go / iOS may refuse a lock. WindowGuard remains the usable fallback.
  }
}

/** Uses the actual window shape, including when iOS reports a portrait device in a landscape window. */
export function WindowGuard({ children }: { children: ReactNode }) {
  const { width, height } = useWindowDimensions();
  const portrait = height > width;
  return <View style={layout.fill}>
    <View style={layout.fill} aria-hidden={portrait} accessibilityElementsHidden={portrait} importantForAccessibility={portrait ? "no-hide-descendants" : "auto"} pointerEvents={portrait ? "none" : "auto"}>
      {children}
    </View>
    {portrait ? <View testID="rotation-notice" style={layout.notice} accessibilityViewIsModal>
      <Text accessible={false} style={layout.symbol}>↻</Text>
      <Text accessibilityRole="header" style={layout.title}>Tourne ton iPhone</Text>
      <Text style={layout.body}>La table KFFR se découvre en paysage.</Text>
      <Text style={layout.hint}>Si nécessaire, désactive le verrouillage portrait dans le Centre de contrôle.</Text>
    </View> : null}
  </View>;
}

export function LandscapeFrame({ children }: { children: ReactNode }) {
  useEffect(() => {
    let mounted = true;
    const request = () => { void requestLandscape(() => mounted && AppState.currentState === "active"); };
    request();
    const listener = AppState.addEventListener("change", (state) => { if (state === "active") request(); });
    return () => { mounted = false; listener.remove(); };
  }, []);
  return <WindowGuard>{children}</WindowGuard>;
}
const layout = StyleSheet.create({
  fill: { flex: 1, minHeight: 0, backgroundColor: tokens.colors.background },
  notice: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0, backgroundColor: tokens.colors.background, justifyContent: "center", alignItems: "center", padding: 28, gap: 16 },
  symbol: { color: tokens.colors.accent, fontSize: 48 },
  title: { color: tokens.colors.text, fontSize: 24, fontWeight: "700", textAlign: "center" },
  body: { color: tokens.colors.text, fontSize: 17, lineHeight: 25, textAlign: "center" },
  hint: { color: tokens.colors.muted, fontSize: 14, lineHeight: 21, textAlign: "center" },
});
