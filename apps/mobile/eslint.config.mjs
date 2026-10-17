import { defineConfig } from "eslint/config";
import expoConfig from "eslint-config-expo/flat.js";

export default defineConfig([
  { ignores: ["dist/**", ".expo/**", "expo-env.d.ts"] },
  expoConfig,
]);
