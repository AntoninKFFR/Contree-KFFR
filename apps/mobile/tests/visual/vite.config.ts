import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";
const file = (value: string) => fileURLToPath(new URL(value, import.meta.url));
const webExtensions = [".web.tsx", ".web.ts", ".web.js", ".tsx", ".ts", ".jsx", ".js", ".json"];
export default defineConfig({
  root: file("./"),
  define: { __DEV__: "true", global: "globalThis", "process.env.EXPO_OS": '"web"' },
  optimizeDeps: { esbuildOptions: { resolveExtensions: webExtensions, jsx: "automatic" } },
  resolve: { extensions: webExtensions, alias: [
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
