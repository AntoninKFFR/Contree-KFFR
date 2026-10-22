import { test, expect } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { emptyTrainingProgress } from "@/lib/training/progress";
import { recordPuzzle } from "../apps/mobile/src/training/puzzles";
import { MEMORY_AXIS_IDS } from "@/engine/training/memory";
import { generateTrickValueSeries } from "@/engine/training/trickValue";
const directory = "apps/mobile/docs/training-153/captures";
for (const viewport of [{ width: 568, height: 320 }, { width: 844, height: 390 }, { width: 932, height: 430 }]) {
  test(`@smoke training web reference for native parity ${viewport.width}`, async ({ page }) => {
    let progress = emptyTrainingProgress();
    for (const axis of ["trick-value", ...MEMORY_AXIS_IDS, "opponent-voids", "bidding", "bid-reading"] as const) {
      const count = axis === "trick-value" || axis === "master-in-hand" ? 2 : axis === "master-cards" || axis === "opponent-voids" ? 3 : axis === "played-cards" ? 5 : 4;
      for (let level = 1; level <= count; level++) progress = recordPuzzle(progress, axis, level, 10);
    }
    await page.addInitScript((value) => localStorage.setItem("coinche:training-progress:v1", JSON.stringify(value)), progress);
    await page.setViewportSize(viewport); await page.emulateMedia({ reducedMotion: "reduce" }); mkdirSync(directory, { recursive: true });
    await page.goto("/training"); await expect(page.getByRole("heading", { name: "Entraînement", exact: true })).toBeVisible();
    await page.screenshot({ path: `${directory}/web-catalogue-${viewport.width}.png` });
    await page.goto("/training/puzzle/trick-value?level=1"); await expect(page.getByText("Combien vaut ce pli ?", { exact: true })).toBeVisible();
    await page.screenshot({ path: `${directory}/web-number-${viewport.width}.png` });
    await page.getByRole("textbox", { name: "Ta réponse en points" }).fill("0"); await page.getByRole("button", { name: "Valider", exact: true }).click();
    const expected = generateTrickValueSeries({ seed: 480010, level: 1, generatorVersion: 1 })[0];
    await expect(page.getByText(`Ce pli vaut ${expected.answer} points.`, { exact: true })).toBeVisible();
    await page.screenshot({ path: `${directory}/web-correction-${viewport.width}.png` });
    writeFileSync(`${directory}/comparison-${viewport.width}.json`, JSON.stringify({ viewport, web: "actual Next.js training clients", native: "actual React Native Web components, not a physical iPhone", axis: "trick-value", level: 1, seed: 480010, firstExercise: expected, sharedProgress: progress }, null, 2));
  });
}
