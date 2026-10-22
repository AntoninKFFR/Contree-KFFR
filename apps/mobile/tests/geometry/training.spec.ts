import { test, expect, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { emptyTrainingProgress } from "../../../../lib/training/progress";
import { recordPuzzle } from "../../src/training/puzzles";
import { MEMORY_AXIS_IDS } from "../../../../engine/training/memory";
import { generateTrickValueSeries } from "../../../../engine/training/trickValue";
const directory = "docs/training-153/captures";
const sizes = [{ width: 568, height: 320 }, { width: 844, height: 390 }, { width: 932, height: 430 }];
async function fixture(page: Page) {
  let p = emptyTrainingProgress();
  for (const axis of ["trick-value", ...MEMORY_AXIS_IDS, "opponent-voids", "bidding", "bid-reading"] as const) for (let level = 1; level <= (axis === "trick-value" || axis === "master-in-hand" ? 2 : axis === "master-cards" || axis === "opponent-voids" ? 3 : axis === "played-cards" ? 5 : 4); level++) p = recordPuzzle(p, axis, level, 10);
  await page.addInitScript((progress) => localStorage.setItem("coinche:ios-training-progress:v1:visual-test-only", JSON.stringify(progress)), p);
  await page.route("**/api/training/**", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ data: { saved: true } }) }));
}
for (const size of sizes) {
  test(`training catalogue, navigation and corrections at ${size.width}`, async ({ page }) => {
    const errors: string[] = []; page.on("pageerror", (e) => errors.push(e.message));
    await page.setViewportSize(size); await fixture(page); await page.goto("/?screen=training");
    await expect(page.getByTestId("training-catalogue")).toBeVisible();
    await expect(page.getByRole("button", { name: /^Commencer / })).toHaveCount(17);
    await expect(page.getByText("04 — Annoncer", { exact: true })).toBeAttached();
    mkdirSync(directory, { recursive: true }); await page.screenshot({ path: `${directory}/native-catalogue-${size.width}.png` });
    await page.getByTestId("training-mode:trick-value:").getByRole("button", { name: "Niveau 1", exact: true }).click();
    await page.getByRole("button", { name: "Commencer Valeur d’un pli", exact: true }).click();
    await expect(page.getByTestId("training-answer")).toBeVisible();
    await page.screenshot({ path: `${directory}/native-number-${size.width}.png` });
    await page.getByRole("button", { name: "0", exact: true }).click(); await page.getByRole("button", { name: "Valider", exact: true }).click();
    await expect(page.getByText(/Ce pli vaut/)).toBeVisible();
    await page.screenshot({ path: `${directory}/native-correction-${size.width}.png` });
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBe(0);
    expect(errors).toEqual([]);
  });
  test(`training memory cards, deduction, auctions, conventions at ${size.width}`, async ({ page }) => {
    const errors: string[] = []; page.on("pageerror", (e) => errors.push(e.message)); await page.setViewportSize(size); await fixture(page);
    for (const axis of [...MEMORY_AXIS_IDS, "opponent-voids", "bidding", "bid-reading", "conventions", "pile-count", "challenge", "game"] as const) {
      await page.goto(`/?screen=training&axis=${axis}&level=1&mode=${axis === "pile-count" ? "beginner" : "survival"}`);
      if (MEMORY_AXIS_IDS.includes(axis as typeof MEMORY_AXIS_IDS[number]) || axis === "opponent-voids") { await page.getByRole("button", { name: "Répondre", exact: true }).click(); await expect(page.getByRole("checkbox").first()).toBeVisible(); }
      else if (axis === "bidding") await expect(page.getByRole("button", { name: /^Annoncer / })).toBeVisible();
      else if (axis === "bid-reading") await expect(page.getByRole("checkbox").first()).toBeVisible();
      else if (axis === "conventions") await expect(page.getByText("Choisir une couleur", { exact: true })).toBeVisible();
      else if (axis === "pile-count") { await page.getByRole("button", { name: "Voir le tas", exact: true }).click(); await expect(page.getByText(/Carte 1\//)).toBeVisible(); }
      else if (axis === "game") await expect(page.getByRole("button", { name: "Ouvrir la table d’entraînement", exact: true })).toBeVisible();
      else await expect(page.getByTestId("training-answer")).toBeVisible();
      await page.screenshot({ path: `${directory}/native-${axis}-${size.width}.png` });
      expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth), axis).toBe(0);
    }
    expect(errors).toEqual([]);
  });
}
test("training ten answers persist once, survive reload, and emit official verified-series fields", async ({ page }) => {
  await page.setViewportSize(sizes[1]);
  const bodies: Record<string, unknown>[] = [];
  await page.route("**/api/training/series", async (route) => { bodies.push(route.request().postDataJSON()); await route.fulfill({ json: { data: { saved: true } } }); });
  await page.goto("/?screen=training&axis=trick-value&level=1");
  for (const exercise of generateTrickValueSeries({ seed: 480000, level: 1, generatorVersion: 1 })) {
    for (const digit of String(exercise.answer)) await page.getByRole("button", { name: digit, exact: true }).click();
    await page.getByRole("button", { name: "Valider", exact: true }).click();
    await page.getByRole("button", { name: /Exercice suivant|Voir le résultat/ }).click();
  }
  await expect(page.getByText("Résultat : 10 / 10", { exact: true })).toBeVisible();
  await expect(page.getByText("Série vérifiée et sauvegardée sur ton compte.", { exact: true })).toBeVisible();
  expect(bodies).toHaveLength(1); expect(bodies[0]).toMatchObject({ axisId: "trick-value", axisVersion: 1, generatorVersion: 1, rulesetVersion: 1, seed: 480000, timed: true }); expect(bodies[0]).not.toHaveProperty("score");
  await page.goto("/?screen=training"); await page.getByTestId("training-mode:trick-value:").getByRole("button", { name: "Niveau 1", exact: true }).click(); await expect(page.getByText("Record local · 10 / 10 · 1 série(s)", { exact: true }).first()).toBeVisible();
});
