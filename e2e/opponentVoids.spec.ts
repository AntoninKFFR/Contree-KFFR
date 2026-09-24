import { expect, test, type Page } from "@playwright/test";
import { emptyTrainingProgress, opponentVoidsSeriesSeed, recordOpponentVoidsSeries, TRAINING_PROGRESS_KEY } from "@/components/training/progress";
import { generatorVersion } from "@/engine/training/generator";
import { generateOpponentVoidsSeries, type OpponentVoidsExercise } from "@/engine/training/opponentVoids";
import { monitorBrowserErrors } from "./helpers/browserErrors";

async function preload(page: Page, unlockedLevel: number) {
  const progress = emptyTrainingProgress();
  progress.axes["opponent-voids"].unlockedLevel = unlockedLevel;
  await page.goto("/training");
  await page.evaluate(([key, value]) => localStorage.setItem(key, value), [TRAINING_PROGRESS_KEY, JSON.stringify(progress)]);
  return progress;
}

function grid(page: Page) { return page.getByRole("group", { name: "Grille des coupures" }); }

async function answer(page: Page, exercise: OpponentVoidsExercise, correct: boolean, last: boolean) {
  await expect(page.getByRole("region", { name: "Phase d’observation" })).toBeVisible();
  await page.getByRole("button", { name: "Répondre" }).click();
  const key = correct ? exercise.expectedCells[0] : exercise.expectedCells.length === 0
    ? `${exercise.players[0]}:${exercise.suits[0]}` : null;
  if (key) await grid(page).locator(`button[data-cell="${key}"]`).click();
  await page.getByRole("button", { name: "Valider la réponse" }).click();
  await expect(page.getByText(correct ? "Bonne réponse !" : "Mauvaise réponse", { exact: false })).toBeVisible();
  await page.getByRole("button", { name: last ? "Voir le résultat" : "Exercice suivant" }).click();
}

test("@smoke deduction hub and locked routes keep the existing training paths", async ({ page }) => {
  const monitor = monitorBrowserErrors(page);
  await page.goto("/training");
  await expect(page.getByText("Déduire", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Jeu des autres" })).toBeVisible();
  for (const label of ["Valeur d’un pli", "Compter son tas", "Cartes maîtresses", "Maîtresses en main", "Cartes tombées", "Mémoire d’un pli", "Survie", "Blitz"]) {
    await expect(page.getByRole("heading", { name: label })).toBeVisible();
  }
  await page.goto("/training/puzzle/opponent-voids?level=2");
  await expect(page.getByRole("heading", { name: "Niveau 2 verrouillé" })).toBeVisible();
  monitor.assertClean();
  await page.goto("/training/puzzle/opponent-voids?level=4");
  await expect(page.getByRole("heading", { name: "404" })).toBeVisible();
});

test("@smoke level one observes, corrects proven and unproven cells, unlocks at 8/10 and stores progress", async ({ page }) => {
  const monitor = monitorBrowserErrors(page);
  const reactWarnings: string[] = [];
  page.on("console", (message) => { if (message.type() === "warning" && /react|hydration|hook/i.test(message.text())) reactWarnings.push(message.text()); });
  const initial = emptyTrainingProgress();
  const first = generateOpponentVoidsSeries({ level: 1, seed: opponentVoidsSeriesSeed(initial, 1), generatorVersion });
  await page.goto("/training/puzzle/opponent-voids?level=1");
  for (const [index, exercise] of first.entries()) {
    await expect(page.getByLabel(`Exercice ${index + 1} sur 10`)).toBeVisible();
    await expect(page.getByText("Ta main", { exact: true })).toHaveCount(0);
    await answer(page, exercise, index < 8, index === 9);
  }
  await expect(page.getByRole("heading", { name: "Résultat" })).toBeVisible();
  await expect(page.getByText("Niveau 2 débloqué !")).toBeVisible();
  const stored = await page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? "null"), TRAINING_PROGRESS_KEY);
  expect(stored.axes["opponent-voids"].unlockedLevel).toBe(2);
  expect(stored.axes["opponent-voids"].levels[1]).toEqual({ bestScore: 8, completedSeries: 1 });
  expect(stored.axes["trick-value"].levels[1].bestScore).toBe(0);
  const replayProgress = recordOpponentVoidsSeries(initial, 1, 8);
  const second = generateOpponentVoidsSeries({ level: 1, seed: opponentVoidsSeriesSeed(replayProgress, 1), generatorVersion });
  await page.getByRole("button", { name: "Rejouer" }).click();
  for (const [index, exercise] of second.entries()) await answer(page, exercise, false, index === 9);
  await expect(page.getByText(/Niveau \d+ débloqué !/)).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Niveau 2", exact: true })).toHaveCount(0);
  expect(reactWarnings).toEqual([]);
  monitor.assertClean();
});

test("@smoke level two uses twelve toggles and explains public proof without showing opponent hands", async ({ page }) => {
  const monitor = monitorBrowserErrors(page);
  const progress = await preload(page, 2);
  const exercise = generateOpponentVoidsSeries({ level: 2, seed: opponentVoidsSeriesSeed(progress, 2), generatorVersion })[0];
  await page.goto("/training/puzzle/opponent-voids?level=2");
  await page.getByRole("button", { name: "Répondre" }).click();
  const buttons = grid(page).getByRole("button");
  await expect(buttons).toHaveCount(12);
  await expect(grid(page).getByRole("button", { name: /Joueur 0/ })).toHaveCount(0);
  const proven = grid(page).locator(`button[data-cell="${exercise.expectedCells[0]}"]`);
  await proven.click(); await expect(proven).toHaveAttribute("aria-pressed", "true");
  await proven.click(); await expect(proven).toHaveAttribute("aria-pressed", "false");
  await proven.click();
  const unproved = exercise.players.flatMap((playerId) => exercise.suits.map((suit) => `${playerId}:${suit}`)).find((key) => !exercise.expectedCells.includes(key))!;
  await grid(page).locator(`button[data-cell="${unproved}"]`).click();
  await page.getByRole("button", { name: "Valider la réponse" }).click();
  await expect(proven).toBeDisabled();
  await expect(proven).toHaveAttribute("data-feedback", "Prouvé ✓");
  await expect(grid(page).locator(`button[data-cell="${unproved}"]`)).toHaveAttribute("data-feedback", "Pas prouvé ×");
  await expect(page.getByText(/Au pli \d+, .* n’a pas fourni/).first()).toBeVisible();
  await expect(page.getByText("Pas prouvé par les plis observés.")).toBeVisible();
  await expect(page.getByText("Ta main", { exact: true })).toHaveCount(0);
  monitor.assertClean();
});

test("@smoke level three combines the full grid and a 0–8 trump answer", async ({ page }) => {
  const monitor = monitorBrowserErrors(page);
  const progress = await preload(page, 3);
  const exercise = generateOpponentVoidsSeries({ level: 3, seed: opponentVoidsSeriesSeed(progress, 3), generatorVersion })[0];
  await page.goto("/training/puzzle/opponent-voids?level=3");
  await expect(page.getByText("Ta main", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Répondre" }).click();
  await expect(page.getByText("Ta main", { exact: true })).toBeVisible();
  await expect(grid(page).getByRole("button")).toHaveCount(12);
  for (const key of exercise.expectedCells) await grid(page).locator(`button[data-cell="${key}"]`).click();
  await page.getByRole("textbox", { name: "Combien d’atouts restent hors de ta main ?" }).fill(String(exercise.expectedTrumpCount));
  await page.getByRole("button", { name: "Valider", exact: true }).click();
  await expect(page.getByText("Bonne réponse !", { exact: false })).toBeVisible();
  await expect(page.getByText(`Atouts hors de ta main : ${exercise.expectedTrumpCount}. Nombre correct.`)).toBeVisible();
  monitor.assertClean();
});

for (const viewport of [{ width: 360, height: 800 }, { width: 390, height: 844 }]) {
  test(`@smoke deduction grid stays touchable without horizontal overflow at ${viewport.width}px`, async ({ page }) => {
    const monitor = monitorBrowserErrors(page);
    await page.setViewportSize(viewport);
    await preload(page, 3);
    await page.goto("/training/puzzle/opponent-voids?level=3");
    await page.getByRole("button", { name: "Répondre" }).click();
    const buttons = grid(page).getByRole("button");
    await expect(buttons).toHaveCount(12);
    for (const button of await buttons.all()) {
      const bounds = await button.boundingBox();
      expect(bounds).not.toBeNull();
      expect(bounds!.height).toBeGreaterThanOrEqual(44);
      expect(bounds!.width).toBeGreaterThanOrEqual(44);
      expect(bounds!.x).toBeGreaterThanOrEqual(0);
      expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(viewport.width + 1);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    await expect(page.getByRole("textbox", { name: "Combien d’atouts restent hors de ta main ?" })).toBeVisible();
    monitor.assertClean();
  });
}
