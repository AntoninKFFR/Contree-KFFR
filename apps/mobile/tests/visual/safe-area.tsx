import type { ReactNode } from "react";
import { View, StyleSheet, type ViewProps } from "react-native";
const params = new URLSearchParams(location.search);
const insets = { top: Number(params.get("top") || 0), bottom: Number(params.get("bottom") || 21), left: Number(params.get("left") || 47), right: Number(params.get("right") || 47) };
export function useSafeAreaInsets() { return insets; }
export function SafeAreaView({ children, edges = ["top", "right", "bottom", "left"], style, ...props }: ViewProps & { children: ReactNode; edges?: (keyof typeof insets)[] }) {
  const flattened = StyleSheet.flatten(style);
  return <View {...props} style={[style, {
    paddingTop: (Number(flattened?.paddingTop ?? flattened?.padding ?? 0)) + (edges.includes("top") ? insets.top : 0),
    paddingBottom: (Number(flattened?.paddingBottom ?? flattened?.padding ?? 0)) + (edges.includes("bottom") ? insets.bottom : 0),
    paddingLeft: (Number(flattened?.paddingLeft ?? flattened?.padding ?? 0)) + (edges.includes("left") ? insets.left : 0),
    paddingRight: (Number(flattened?.paddingRight ?? flattened?.padding ?? 0)) + (edges.includes("right") ? insets.right : 0),
  }]}>{children}</View>;
}
