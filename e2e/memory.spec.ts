import { expect, test, type Page } from "@playwright/test";
import { cardId } from "@/engine/cards";
import { cardAccessibleName } from "@/components/training/CardSelection";
import { generatorVersion } from "@/engine/training/generator";
import { generateMemorySeries } from "@/engine/training/memory";
import { monitorBrowserErrors } from "./helpers/browserErrors";

const progress = {
  version: 1,
  axes: {
    "trick-value": { unlockedLevel: 1, levels: { 1: { bestScore: 0, completedSeries: 0 }, 2: { bestScore: 0, completedSeries: 0 } } },
    "played-cards": { unlockedLevel: 5, levels: Object.fromEntries(Array.from({ length: 5 }, (_, index) => [index + 1, { bestScore: 8, completedSeries: 1 }])) },
    "trick-recall": { unlockedLevel: 2, levels: { 1: { bestScore: 8, completedSeries: 1 }, 2: { bestScore: 0, completedSeries: 0 } } },
  },
};

async function preload(page: Page) {
  await page.goto("/training");
  await page.evaluate((value) => localStorage.setItem("coinche:training-progress:v1", JSON.stringify(value)), progress);
}

test("@smoke memory hub exposes all four axes", async ({ page }) => {
  const monitor = monitorBrowserErrors(page);
  await page.goto("/training");
  await expect(page.getByText("Mémoriser", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Compter son tas" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Compter son tas en mode Débutant" })).toBeVisible();
  for (const label of ["Cartes maîtresses", "Maîtresses en main", "Cartes tombées", "Mémoire d’un pli"]) {
    await expect(page.getByRole("heading", { name: label })).toBeVisible();
  }
  monitor.assertClean();
});

test("@smoke master cards moves from observation to selection and useful correction", async ({ page }) => {
  const monitor = monitorBrowserErrors(page);
  const reactWarnings: string[] = [];
  page.on("console", (message) => { if (message.type() === "warning" && /react|hydration|hook/i.test(message.text())) reactWarnings.push(message.text()); });
  await page.goto("/training/puzzle/master-cards?level=1");
  await expect(page).toHaveTitle(/Cartes maîtresses \| Entraînement/);
  await expect(page.getByRole("region", { name: "Phase d’observation" })).toBeVisible();
  await page.getByRole("button", { name: "Répondre" }).click();
  await expect(page.getByRole("region", { name: "Phase d’observation" })).toHaveCount(0);
  const question = page.getByRole("region", { name: "Question mémoire" });
  const cards = question.locator('[aria-label="Sélection des cartes"] button[aria-pressed]');
  await expect(cards).toHaveCount(8);
  const first = cards.first();
  await first.click();
  await expect(first).toHaveAttribute("aria-pressed", "true");
  await first.click();
  await expect(first).toHaveAttribute("aria-pressed", "false");
  await first.click();
  await question.getByRole("button", { name: "Valider la réponse" }).click();
  await expect(question.getByText("Bonnes sélections :")).toBeVisible();
  await expect(question.getByText("Cartes oubliées :")).toBeVisible();
  await expect(question.getByText("Cartes en trop :")).toBeVisible();
  expect(reactWarnings).toEqual([]);
  monitor.assertClean();
});

test("@smoke master in hand offers only the player's cards and completes a ten-question series", async ({ page }) => {
  const monitor = monitorBrowserErrors(page);
  await page.goto("/training/puzzle/master-in-hand?level=1");
  for (let index = 1; index <= 10; index += 1) {
    await expect(page.getByLabel(`Exercice ${index} sur 10`)).toBeVisible();
    await expect(page.getByText("Ta main", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Répondre" }).click();
    const candidates = page.getByRole("region", { name: "Question mémoire" }).locator('[aria-label="Sélection des cartes"] button[aria-pressed]');
    expect(await candidates.count()).toBeLessThanOrEqual(8);
    await expect(page.getByRole("region", { name: "Phase d’observation" })).toHaveCount(0);
    await page.getByRole("button", { name: "Valider : aucune carte" }).click();
    await expect(page.getByText(/Bonnes sélections :/)).toBeVisible();
    await page.getByRole("button", { name: index === 10 ? "Voir le résultat" : "Exercice suivant" }).click();
  }
  await expect(page.getByRole("heading", { name: "Résultat" })).toBeVisible();
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem("coinche:training-progress:v1") ?? "null"));
  expect(stored.axes["master-in-hand"].levels[1].completedSeries).toBe(1);
  expect(stored.axes["trick-value"].levels[1].bestScore).toBe(0);
  monitor.assertClean();
});

for (const viewport of [{ width: 360, height: 800 }, { width: 390, height: 844 }]) {
  test(`@smoke played cards level 5 keeps all 32 cards usable at ${viewport.width}px`, async ({ page }) => {
    const monitor = monitorBrowserErrors(page);
    await page.setViewportSize(viewport);
    await preload(page);
    await page.goto("/training/puzzle/played-cards?level=5");
    await page.getByRole("button", { name: "Répondre" }).click();
    const cards = page.getByRole("region", { name: "Question mémoire" }).locator('[aria-label="Sélection des cartes"] button[aria-pressed]');
    await expect(cards).toHaveCount(32);
    for (const card of await cards.all()) {
      const bounds = await card.boundingBox();
      expect(bounds).not.toBeNull();
      expect(bounds!.x).toBeGreaterThanOrEqual(0);
      expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(viewport.width + 1);
      expect(bounds!.height).toBeGreaterThanOrEqual(44);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    await cards.first().click();
    await expect(cards.first()).toHaveAttribute("aria-pressed", "true");
    await page.getByRole("button", { name: "Valider la réponse" }).click();
    await expect(page.getByText(/Cartes oubliées :/)).toBeVisible();
    monitor.assertClean();
  });
}

test("@smoke trick recall gives partial credit for cards and player attribution", async ({ page }) => {
  const monitor = monitorBrowserErrors(page);
  await preload(page);
  const exercise = generateMemorySeries({ axisId: "trick-recall", level: 2, seed: 3_021_000_000, generatorVersion })[0];
  await page.goto("/training/puzzle/trick-recall?level=2");
  await page.getByRole("button", { name: "Répondre" }).click();
  const question = page.getByRole("region", { name: "Question mémoire" });
  const correct = exercise.expectedIds.slice(0, 3);
  const wrong = exercise.candidates.find((card) => !exercise.expectedIds.includes(cardId(card)))!;
  for (const id of [...correct, cardId(wrong)]) {
    const card = exercise.candidates.find((candidate) => cardId(candidate) === id)!;
    await question.getByRole("button", { name: cardAccessibleName(card), exact: true }).click();
  }
  await expect(question.locator('[aria-label="Sélection des cartes"] button[aria-pressed="true"]')).toHaveCount(4);
  await expect(question.locator('[aria-label="Sélection des cartes"] button[aria-pressed="false"]').first()).toBeDisabled();
  const assigned = exercise.candidates.find((card) => cardId(card) === correct[0])!;
  const group = question.getByRole("group", { name: new RegExp(cardAccessibleName(assigned)) });
  await group.getByRole("button", { name: exercise.playerNames[exercise.expectedPlayers[correct[0]]!] }).click();
  await question.getByRole("button", { name: "Valider la réponse" }).click();
  await expect(question.getByText("3/4 cartes retrouvées · 1/4 joueurs correctement attribués")).toBeVisible();
  await expect(question.getByText("Mauvaise réponse", { exact: false })).toBeVisible();
  monitor.assertClean();
});
