import { expect, test, type Page } from "@playwright/test";
import { monitorBrowserErrors } from "./helpers/browserErrors";
import { generatorVersion } from "@/engine/training/generator";
import { generateRoundCountSeries } from "@/engine/training/roundCount";
import { generateRunningScoreSeries } from "@/engine/training/runningScore";
import { countingSeriesSeed, emptyTrainingProgress, recordCountingSeries } from "@/components/training/progress";

const PROGRESS_KEY = "coinche:training-progress:v1";

/** Switches to the untimed mode and advances trick by trick until the question. */
async function stepThroughReplay(page: Page) {
  await page.getByRole("button", { name: "Pas à pas" }).click();
  const control = page.getByRole("button", { name: /^(Pli suivant|Répondre)$/ });
  for (let guard = 0; guard < 9; guard += 1) {
    const label = (await control.textContent())?.trim();
    await control.click();
    if (label === "Répondre") return;
  }
  throw new Error("The replay never reached the question.");
}

test("@smoke training hub lists the counting axes with only level 1 open", async ({ page }) => {
  const browserErrors = monitorBrowserErrors(page);
  await page.goto("/training");
  await expect(page.getByRole("heading", { name: "Compter une manche" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Points en cours de donne" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Commencer Compter une manche, niveau 1" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Commencer Points en cours de donne, niveau 1" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Commencer Compter une manche, niveau 2" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Commencer Points en cours de donne, niveau 3" })).toHaveCount(0);
  // The trick-value entry points stay unique next to the new axes.
  await expect(page.getByRole("link", { name: "Jouer le niveau 1" })).toHaveCount(1);
  browserErrors.assertClean();
});

test("@smoke round-count: a perfect level 1 series on mobile unlocks level 2", async ({ page }) => {
  const browserErrors = monitorBrowserErrors(page);
  await page.setViewportSize({ width: 390, height: 844 });
  const series = generateRoundCountSeries({
    seed: countingSeriesSeed(emptyTrainingProgress(), "round-count", 1),
    generatorVersion,
    level: 1,
  });
  await page.goto("/training");
  await page.getByRole("link", { name: "Commencer Compter une manche, niveau 1" }).click();
  await expect(page).toHaveURL(/round-count\?level=1/);
  for (const [index, exercise] of series.entries()) {
    await expect(page.getByLabel(`Exercice ${index + 1} sur 5`)).toBeVisible();
    const replay = page.getByRole("region", { name: "Rejeu de la donne" });
    await expect(replay).toBeVisible();
    // The replay shows cards and winners, never points that would give the answer away.
    await expect(replay).not.toContainText("point");
    await stepThroughReplay(page);
    const answer = page.getByRole("textbox", { name: "Ta réponse en points" });
    await answer.fill(String(exercise.expected[0]));
    await answer.press("Enter");
    await expect(page.getByText("Bonne réponse !")).toBeVisible();
    await page.getByRole("button", { name: index === series.length - 1 ? "Voir le résultat" : "Exercice suivant" }).click();
  }
  await expect(page.getByRole("heading", { name: "Résultat" })).toBeVisible();
  await expect(page.getByText("5 / 5", { exact: true })).toBeVisible();
  await expect(page.getByText("Niveau 2 débloqué !")).toBeVisible();
  const stored = await page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? "null"), PROGRESS_KEY);
  expect(stored.axes["round-count"].levels["1"]).toEqual({ bestScore: 5, completedSeries: 1 });
  expect(stored.axes["round-count"].unlockedLevel).toBe(2);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  browserErrors.assertClean();
});

test("@smoke running-score: a two-team question takes two steps and grades by halves", async ({ page }) => {
  const browserErrors = monitorBrowserErrors(page);
  const progress = recordCountingSeries(emptyTrainingProgress(), "running-score", 1, 4);
  await page.goto("/training");
  await page.evaluate(([key, value]) => localStorage.setItem(key, value), [PROGRESS_KEY, JSON.stringify(progress)]);
  await page.goto("/training/puzzle/running-score?level=2");
  const [first] = generateRunningScoreSeries({
    seed: countingSeriesSeed(progress, "running-score", 2),
    generatorVersion,
    level: 2,
  });
  await stepThroughReplay(page);
  await expect(page.getByText("Étape 1 sur 2")).toBeVisible();
  await page.locator("#training-answer").fill(String(first.expected[0]));
  await page.locator("#training-answer").press("Enter");
  await expect(page.getByText("Étape 2 sur 2")).toBeVisible();
  await page.locator("#training-answer").fill(String(first.expected[1] + 1));
  await page.locator("#training-answer").press("Enter");
  await expect(page.getByText("Réponse partielle")).toBeVisible();
  browserErrors.assertClean();
});

test("@smoke counting levels: locked, invalid and missing levels are handled", async ({ page }) => {
  const locked = await page.goto("/training/puzzle/round-count?level=3");
  expect(locked?.status()).toBe(200);
  await expect(page.getByRole("heading", { name: "Niveau 3 verrouillé" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Retour à l’entraînement" })).toBeVisible();
  const invalid = await page.goto("/training/puzzle/running-score?level=4");
  expect(invalid?.status()).toBe(404);
  await page.goto("/training/puzzle/round-count");
  await expect(page).toHaveURL(/\/training$/);
});
