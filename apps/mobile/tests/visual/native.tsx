// Browser-only test adapter; production Metro never imports this directory.
import { forwardRef, type ComponentRef } from "react";
import * as Web from "react-native-web";
import type { TextProps } from "react-native";
// RN Web implements these native contracts; its separate community types lag the SDK.
const { Text: NativeText, StyleSheet, useWindowDimensions: dimensions } = Web as unknown as Pick<typeof import("react-native"), "Text" | "StyleSheet" | "useWindowDimensions">;
export * from "react-native-web";
const factor = Number(new URLSearchParams(location.search).get("font") || "1");
export function useWindowDimensions() { return { ...dimensions(), fontScale: factor }; }
export const Text = forwardRef<ComponentRef<typeof NativeText>, TextProps>(function Text(props, ref) {
  const style = StyleSheet.flatten(props.style) as { fontSize?: number; lineHeight?: number } | undefined;
  const scale = props.allowFontScaling === false ? 1 : Math.min(factor, props.maxFontSizeMultiplier || factor);
  return <NativeText {...props} ref={ref} style={[props.style, style?.fontSize ? { fontSize: style.fontSize * scale } : undefined,
    style?.lineHeight ? { lineHeight: style.lineHeight * scale } : undefined]} />;
});
