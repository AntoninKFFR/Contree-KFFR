import { expect, test } from "@playwright/test";
import { monitorBrowserErrors } from "./helpers/browserErrors";

const unlockedProgress = {
  version: 1,
  axes: {
    "trick-value": {
      unlockedLevel: 2,
      levels: {
        1: { bestScore: 8, completedSeries: 1 },
        2: { bestScore: 0, completedSeries: 0 },
      },
    },
  },
};

test("@smoke public training hub shows level 1 and locks level 2", async ({ page }) => {
  const browserErrors = monitorBrowserErrors(page);
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/");
  await expect(page.getByRole("navigation", { name: "Navigation principale" }).getByRole("link", { name: "Entraînement" })).toBeVisible();
  await page.getByRole("navigation", { name: "Navigation principale" }).getByRole("link", { name: "Entraînement" }).click();
  await expect(page).toHaveURL(/\/training$/);
  await expect(page.getByRole("heading", { name: "Fondamentaux" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Confirmé" })).toBeVisible();
  await expect(page.getByText("Obtiens 8/10 au niveau 1 pour débloquer ce niveau.")).toBeVisible();
  await expect(page.getByRole("link", { name: "Jouer le niveau 2" })).toHaveCount(0);
  await page.getByRole("link", { name: "Jouer le niveau 1" }).click();
  await expect(page).toHaveURL(/level=1/);
  await expect(page.getByText("Niveau 1 · Fondamentaux")).toBeVisible();
  await expect(page.getByLabel("Aide des valeurs des cartes")).toBeVisible();
  await page.getByRole("textbox", { name: "Ta réponse en points" }).focus();
  await page.keyboard.press("4");
  await expect(page.getByRole("textbox", { name: "Ta réponse en points" })).toHaveValue("4");
  await page.keyboard.press("Backspace");
  await page.keyboard.press("0");
  await page.keyboard.press("Enter");
  await expect(page.getByText(/Ce pli vaut \d+ points/)).toBeVisible();
  browserErrors.assertClean();
});

test("@smoke completes ten level-1 exercises without an account on mobile", async ({ page }) => {
  const browserErrors = monitorBrowserErrors(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/training");
  await expect(page.getByRole("heading", { name: "Entraînement" })).toBeVisible();
  await page.getByRole("button", { name: "Ouvrir le menu" }).click();
  await expect(page.getByRole("navigation", { name: "Navigation mobile" }).getByRole("link", { name: "Entraînement" })).toBeVisible();
  await page.getByRole("button", { name: "Ouvrir le menu" }).click();
  await page.getByRole("link", { name: "Jouer le niveau 1" }).click();
  for (let exercise = 1; exercise <= 10; exercise += 1) {
    await expect(page.getByLabel(`Exercice ${exercise} sur 10`)).toBeVisible();
    await expect(page.getByRole("list", { name: "Cartes du pli" }).locator("li")).toHaveCount(4);
    await expect(page.getByLabel("Aide des valeurs des cartes")).toBeVisible();
    await expect(page.getByText("Dernier pli · 10 de der")).toHaveCount(0);
    const zero = page.getByRole("button", { name: "0", exact: true });
    const size = await zero.boundingBox();
    expect(size?.height).toBeGreaterThanOrEqual(44);
    await zero.click();
    await page.getByRole("button", { name: "Valider" }).click();
    await expect(page.getByText(/Ce pli vaut \d+ points/)).toBeVisible();
    await expect(zero).toBeDisabled();
    await page.getByRole("button", { name: exercise === 10 ? "Voir le résultat" : "Exercice suivant" }).click();
  }
  await expect(page.getByRole("heading", { name: "Résultat" })).toBeVisible();
  await expect(page.getByText(/Meilleur score du niveau 1/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Rejouer le niveau 1" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Retour aux niveaux" })).toBeVisible();
  const stored = await page.evaluate(() => localStorage.getItem("coinche:training-progress:v1"));
  expect(JSON.parse(stored ?? "null").axes["trick-value"].levels["1"].completedSeries).toBe(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  browserErrors.assertClean();
});

test("@smoke unlocked players can choose either level explicitly", async ({ page }) => {
  const browserErrors = monitorBrowserErrors(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/training");
  await page.evaluate((value) => localStorage.setItem("coinche:training-progress:v1", JSON.stringify(value)), unlockedProgress);
  await page.reload();
  await expect(page.getByRole("link", { name: "Jouer le niveau 1" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Jouer le niveau 2" })).toBeVisible();
  await page.getByRole("link", { name: "Jouer le niveau 1" }).click();
  await expect(page).toHaveURL(/level=1/);
  await expect(page.getByText("Niveau 1 · Fondamentaux")).toBeVisible();
  await page.getByRole("link", { name: "Changer de niveau" }).click();
  await page.getByRole("link", { name: "Jouer le niveau 2" }).click();
  await expect(page).toHaveURL(/level=2/);
  await expect(page.getByText("Niveau 2 · Confirmé")).toBeVisible();
  await expect(page.getByLabel("Aide des valeurs des cartes")).toHaveCount(0);
  for (let exercise = 1; exercise <= 3; exercise += 1) {
    await expect(page.getByLabel(`Exercice ${exercise} sur 10`)).toBeVisible();
    if (exercise === 3) {
      await expect(page.getByText("Dernier pli · 10 de der")).toBeVisible();
      break;
    }
    await page.getByRole("button", { name: "0", exact: true }).click();
    await page.getByRole("button", { name: "Valider" }).click();
    await page.getByRole("button", { name: "Exercice suivant" }).click();
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  browserErrors.assertClean();
});

test("@smoke invalid and locked training levels are handled", async ({ page }) => {
  const locked = await page.goto("/training/puzzle/trick-value?level=2");
  expect(locked?.status()).toBe(200);
  await expect(page.getByRole("heading", { name: "Niveau 2 verrouillé" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Retour aux niveaux" })).toBeVisible();
  const invalid = await page.goto("/training/puzzle/trick-value?level=3");
  expect(invalid?.status()).toBe(404);
  const unknown = await page.goto("/training/puzzle/unknown-axis?level=1");
  expect(unknown?.status()).toBe(404);
});

test("@smoke home training action remains visible at tablet widths", async ({ page }) => {
  for (const width of [640, 680, 718]) {
    await page.setViewportSize({ width, height: 800 });
    await page.goto("/");
    const action = page.getByRole("link", { name: "Entraînement" });
    await expect(action).toBeVisible();
    const box = await action.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.x + box!.width).toBeLessThanOrEqual(width);
  }
});
