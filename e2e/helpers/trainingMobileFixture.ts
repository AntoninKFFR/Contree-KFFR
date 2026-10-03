import { expect, type Page } from "@playwright/test";
import { emptyTrainingProgress, recordTrickValueSeries, recordMemorySeries, recordOpponentVoidsSeries, recordBiddingSeries, recordBidReadingSeries, recordPileCountSeries, TRAINING_PROGRESS_KEY } from "../../components/training/progress";
import { MEMORY_AXIS_IDS, MEMORY_LEVELS } from "../../engine/training/memory";
import { installMobileNavigationFixture } from "./mobileNavigationFixture";
import { MOBILE_VIEWPORTS, DESKTOP_VIEWPORTS } from "./mobile";

export const TRAINING_VIEWPORTS = [...MOBILE_VIEWPORTS, { width: 768, height: 900 }, { width: 1024, height: 900 }, ...DESKTOP_VIEWPORTS];

// Use the real progression operations, including their unlock thresholds and axis versions.
export function trainingMobileProgress(unlocked = false) {
  let progress = emptyTrainingProgress();
  if (!unlocked) return progress;
  for (const level of [1, 2] as const) progress = recordTrickValueSeries(progress, level, 10);
  for (const axis of MEMORY_AXIS_IDS) for (let level = 1; level <= MEMORY_LEVELS[axis]; level++) progress = recordMemorySeries(progress, axis, level, 10);
  for (let level = 1; level <= 3; level++) progress = recordOpponentVoidsSeries(progress, level, 10);
  for (const level of [1, 2, 3, 4] as const) {
    progress = recordBiddingSeries(progress, level, 10);
    progress = recordBidReadingSeries(progress, level, 10);
  }
  progress = recordPileCountSeries(progress, "beginner", 10);
  progress = recordPileCountSeries(progress, "normal", 10);
  progress = recordPileCountSeries(progress, "manual", 10, 123400);
  return progress;
}

export async function installTrainingMobileFixture(page: Page, { theme = "dark", unlocked = false, records = "guest" }:
  { theme?: "dark" | "light"; unlocked?: boolean; records?: "guest" | "empty" | "multiple" | "error" } = {}) {
  await installMobileNavigationFixture(page, { theme, authenticated: records !== "guest", notifications: false });
  const progress = trainingMobileProgress(unlocked);
  await page.addInitScript(({ key, progress }) => localStorage.setItem(key, JSON.stringify(progress)), { key: TRAINING_PROGRESS_KEY, progress });
  // UI captures include the existing offline-sync message; account writes are covered by DB E2E.
  await page.route("**/api/training/series", (route) => route.fulfill({ status: 503, json: { error: "Offline UI fixture" } }));
  await page.route("http://127.0.0.1:54321/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (!path.endsWith("/training_records") && !path.endsWith("/get_friends_training_leaderboard")) { await route.fallback(); return; }
    const data = records === "multiple" && path.endsWith("/training_records")
      ? [{ axis_id: "trick-value", level: 1, best_score: 9, best_duration_ms: 123400 }, { axis_id: "trick-value", level: 2, best_score: 10, best_duration_ms: 123400 },
        { axis_id: "played-cards", level: 4, best_score: 10, best_duration_ms: 123400 }]
      : [];
    await route.fulfill({ status: records === "error" && path.endsWith("/training_records") && route.request().method() !== "OPTIONS" ? 500 : 200, json: data, headers: {
      "Access-Control-Allow-Origin": route.request().headers().origin ?? "*",
      "Access-Control-Allow-Headers": route.request().headers()["access-control-request-headers"] ?? "authorization, apikey, x-client-info, content-type, prefer, x-supabase-api-version",
      "Access-Control-Allow-Methods": "GET, HEAD, POST, OPTIONS",
    } });
  });
  return progress;
}

export async function completeTrickSeries(page: Page) {
  for (let index = 1; index <= 10; index++) {
    await expect(page.getByLabel(`Exercice ${index} sur 10`)).toBeVisible();
    await page.getByRole("textbox", { name: "Ta réponse en points" }).fill("0");
    await page.getByRole("button", { name: "Valider", exact: true }).click();
    await page.getByRole("button", { name: index === 10 ? "Voir le résultat" : "Exercice suivant" }).click();
  }
  await expect(page.getByRole("heading", { name: "Résultat", exact: true })).toBeVisible();
}
