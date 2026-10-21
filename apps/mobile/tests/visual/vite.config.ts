import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
const file = (value: string) => fileURLToPath(new URL(value, import.meta.url));
const webExtensions = [".web.tsx", ".web.ts", ".web.js", ".tsx", ".ts", ".jsx", ".js", ".json"];
export default defineConfig({
  root: file("./"),
  // Vite does not transform the optional CJS requires in Reanimated webUtils.
  // Resolve those same real RN Web compiler functions as ESM for this harness.
  plugins: [{ name: "ios-fix-baseline", enforce: "pre", transform(_code, id) {
    if (process.env.IOS_FIX_BASELINE !== "1") return;
    const path = id.replaceAll("\\", "/");
    const source = ["apps/mobile/src/solo/hand.tsx", "apps/mobile/src/multiplayer/lobby.tsx", "apps/mobile/src/app/(connected)/multiplayer.tsx"].find((name) => path.endsWith("/" + name));
    if (source) return execFileSync("git", ["show", `8d1ac9d98c81840401a36b3a401bd06a76b8d60a:${source}`], { encoding: "utf8" });
  } }, { name: "reanimated-real-web-compiler", enforce: "pre", transform(_code, id) {
    if (!/react-native-reanimated\/src\/ReanimatedModule\/js-reanimated\/webUtils(\.web)?\.ts$/.test(id.replaceAll("\\", "/"))) return;
    return `export { default as createReactDOMStyle } from "react-native-web/dist/exports/StyleSheet/compiler/createReactDOMStyle"; export { createTransformValue, createTextShadowValue } from "react-native-web/dist/exports/StyleSheet/preprocess";`;
  } }],
  define: { __DEV__: "true", global: "globalThis", "process.env.EXPO_OS": '"web"' },
  optimizeDeps: { esbuildOptions: { resolveExtensions: webExtensions, jsx: "automatic" } },
  resolve: { extensions: webExtensions, alias: [
    // Enable React's production profiling build for actual render cost evidence.
    { find: /^react-dom\/client$/, replacement: file("../../node_modules/react-dom/profiling.js") },
    { find: "@/lib/supabase", replacement: file("./supabase.ts") },
    ...["multiplayerTablePreferences", "multiplayerTurnTimer", "multiplayerPresence", "roomTypes"].map((name) => ({ find: "@/lib/" + name, replacement: file("../../../../lib/" + name + ".ts") })),
    { find: "@/engine", replacement: file("../../../../engine") },
    { find: "@/lib/preferences", replacement: file("../../../../lib/preferences") },
    { find: "@/lib/solo", replacement: file("../../../../lib/solo") },
    { find: "@/lib/trickPresentation", replacement: file("../../../../lib/trickPresentation.ts") },
    { find: "@/lib/soloBotPacing", replacement: file("../../../../lib/soloBotPacing.ts") },
    { find: "@/lib/soloLastTrick", replacement: file("../../../../lib/soloLastTrick.ts") },
    { find: "@/solo/environment", replacement: file("./solo-environment.ts") },
    { find: "@/auth/AccountProvider", replacement: file("./account.tsx") },
    { find: "expo-router", replacement: file("./router.tsx") },
    { find: "expo-screen-orientation", replacement: file("./orientation.ts") },
    { find: "react-native-safe-area-context", replacement: file("./safe-area.tsx") },
    { find: /^react-native$/, replacement: file("./native.tsx") },
    // Use the actual libraries' extensionless sources so Vite can resolve their
    // .web implementations, just as Metro does. No animation mock in captures.
    { find: /^react-native-reanimated$/, replacement: file("../../node_modules/react-native-reanimated/src/index.ts") },
    { find: /^react-native-worklets$/, replacement: file("../../node_modules/react-native-worklets/src/index.ts") },
    { find: "@", replacement: file("../../src") },
  ] },
  esbuild: { jsx: "automatic" },
  css: { postcss: { plugins: [] } },
  server: { host: "127.0.0.1", port: 8091, strictPort: true },
});
