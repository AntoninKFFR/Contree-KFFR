import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/geometry", fullyParallel: false, workers: 1, retries: 0,
  reporter: [["list"], ["html", { outputFolder: "geometry-report", open: "never" }]],
  outputDir: "geometry-results",
  use: { baseURL: "http://127.0.0.1:8091", browserName: "chromium", trace: "retain-on-failure" },
  webServer: { command: "node scripts/serve-visual-tests.mjs", url: "http://127.0.0.1:8091", reuseExistingServer: false, timeout: 120000 },
});
