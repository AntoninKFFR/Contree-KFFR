import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./e2e", testMatch: ["multiplayerNativeParity.spec.ts", "multiplayerNativeCrossplay.spec.ts", "finalTrickPresentation.spec.ts"], workers: 1, retries: 0,
  reporter: "line", use: { baseURL: "http://127.0.0.1:3100", serviceWorkers: "block" },
  webServer: [{ command: "npm run start -- --hostname 127.0.0.1 --port 3100", url: "http://127.0.0.1:3100", reuseExistingServer: false, timeout: 120000,
    env: { NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321", NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "fixture-public-key" } },
    { command: "node apps/mobile/scripts/serve-visual-tests.mjs", url: "http://127.0.0.1:8091", reuseExistingServer: false, timeout: 120000 }],
});
