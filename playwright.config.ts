import { defineConfig, devices } from "@playwright/test";

const remoteBaseUrl = process.env.E2E_BASE_URL?.trim().replace(/\/$/, "");
const localBaseUrl = "http://127.0.0.1:3000";
const productionServer = process.env.E2E_PRODUCTION_SERVER === "1";

export default defineConfig({
  testDir: "./e2e",
  outputDir: "test-results",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [["line"], ["html", { open: "never", outputFolder: "playwright-report" }]],
  use: {
    baseURL: remoteBaseUrl || localBaseUrl,
    screenshot: "only-on-failure",
    video: "off",
  },
  webServer: remoteBaseUrl
    ? undefined
    : {
        command: productionServer ? "npm run start -- --hostname 127.0.0.1" : "npm run dev -- --hostname 127.0.0.1",
        url: localBaseUrl,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      },
  projects: [
    {
      name: "progression-ui",
      grep: /@progression-ui/,
      use: { ...devices["Desktop Chrome"], trace: "off" },
    },
    {
      name: "smoke",
      grep: /@smoke/,
      use: { ...devices["Desktop Chrome"], trace: "retain-on-failure" },
    },
    {
      name: "multiplayer",
      grep: /@multiplayer/,
      // Auth actions can contain passwords. Never put those action arguments in a trace.
      use: { ...devices["Desktop Chrome"], trace: "off" },
    },
    {
      name: "training-duo",
      grep: /@training-duo/,
      // Auth actions contain passwords; never record them in a Playwright trace.
      use: { ...devices["Desktop Chrome"], trace: "off" },
    },
    {
      name: "social",
      grep: /@social/,
      // Authenticated actions must never be recorded in a trace.
      use: { ...devices["Desktop Chrome"], trace: "off" },
    },
  ],
});
