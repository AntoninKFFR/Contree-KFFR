import { defineConfig } from "@playwright/test";
if (process.env.FINALIZATION_LOCAL !== "1" || !["127.0.0.1", "localhost"].includes(new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "https://invalid").hostname)) throw new Error("Local finalization tests require explicit disposable loopback configuration");
export default defineConfig({
  testDir: "./e2e", testMatch: ["multiplayerFinalizationLocal.spec.ts", "multiplayer.spec.ts"], grepInvert: /@rating/,
  fullyParallel: false, workers: 1, retries: 0, reporter: "line", outputDir: "test-results/finalization-local",
  use: { baseURL: "http://127.0.0.1:3100", browserName: "chromium", trace: "off" },
  webServer: [
    { command: "npm run start -- --hostname 127.0.0.1 --port 3100", url: "http://127.0.0.1:3100", reuseExistingServer: false, timeout: 120000 },
    ...(process.env.FINALIZATION_WEB_ONLY === "1" ? [] : [{ command: "node apps/mobile/scripts/serve-visual-tests.mjs", url: "http://127.0.0.1:8091", reuseExistingServer: false, timeout: 120000 }]),
  ],
});
