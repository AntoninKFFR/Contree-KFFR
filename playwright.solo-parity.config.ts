import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./e2e", testMatch: "soloNativeParity.spec.ts", workers: 1, retries: 0,
  reporter: "line", use: { baseURL: "http://127.0.0.1:3100", serviceWorkers: "block" },
  webServer: {
    command: process.env.E2E_PRODUCTION_SERVER === "1" ? "npm run start -- --hostname 127.0.0.1 --port 3100" : "npm run dev -- --hostname 127.0.0.1 --port 3100", url: "http://127.0.0.1:3100", reuseExistingServer: false, timeout: 120000,
    env: { NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321", NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "fixture-public-key" },
  },
});
