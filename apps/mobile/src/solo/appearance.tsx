import { createContext, use } from "react";
import { StyleSheet, Text as NativeText, type TextProps } from "react-native";
export const SoloAppearance = createContext({ textSize: "normal", contrast: false, reduced: true, sound: () => {} });
export function useSoloAppearance() { return use(SoloAppearance); }
/** Solo-only typography; the validated Home/Profile/Auth are outside this scope. */
export function SoloText(props: TextProps) {
  const appearance = useSoloAppearance(), style = StyleSheet.flatten(props.style);
  const factor = appearance.textSize === "large" ? 1.125 : 1;
  return <NativeText {...props} style={[props.style, factor !== 1 ? { fontSize: (style?.fontSize ?? 14) * factor, ...(style?.lineHeight ? { lineHeight: style.lineHeight * factor } : {}) } : null]} />;
}
