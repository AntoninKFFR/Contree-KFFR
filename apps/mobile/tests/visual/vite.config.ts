import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";
const file = (value: string) => fileURLToPath(new URL(value, import.meta.url));
export default defineConfig({
  root: file("./"),
  resolve: { alias: [
    { find: "@/auth/AccountProvider", replacement: file("./account.tsx") },
    { find: "expo-router", replacement: file("./router.tsx") },
    { find: "expo-screen-orientation", replacement: file("./orientation.ts") },
    { find: "react-native-safe-area-context", replacement: file("./safe-area.tsx") },
    { find: /^react-native$/, replacement: file("./native.tsx") },
    { find: "@", replacement: file("../../src") },
  ] },
  esbuild: { jsx: "automatic" },
  css: { postcss: { plugins: [] } },
  server: { host: "127.0.0.1", port: 8091, strictPort: true },
});
