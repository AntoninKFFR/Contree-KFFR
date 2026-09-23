import { expect, test } from "@playwright/test";
import { monitorBrowserErrors } from "./helpers/browserErrors";

test("@smoke public training hub and desktop navigation", async ({ page }) => {
  const browserErrors = monitorBrowserErrors(page);
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/");
  await expect(page.getByRole("navigation", { name: "Navigation principale" }).getByRole("link", { name: "Entraînement" })).toBeVisible();
  await page.getByRole("navigation", { name: "Navigation principale" }).getByRole("link", { name: "Entraînement" }).click();
  await expect(page).toHaveURL(/\/training$/);
  await expect(page.getByRole("heading", { name: "Valeur d’un pli" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Démarrer une série" })).toBeVisible();
  await page.getByRole("link", { name: "Démarrer une série" }).click();
  await page.getByRole("textbox", { name: "Ta réponse en points" }).focus();
  await page.keyboard.press("4");
  await expect(page.getByRole("textbox", { name: "Ta réponse en points" })).toHaveValue("4");
  await page.keyboard.press("Backspace");
  await page.keyboard.press("0");
  await page.keyboard.press("Enter");
  await expect(page.getByText(/Ce pli vaut \d+ points/)).toBeVisible();
  browserErrors.assertClean();
});

test("@smoke completes ten trick-value exercises without an account on mobile", async ({ page }) => {
  const browserErrors = monitorBrowserErrors(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/training");
  await expect(page.getByRole("heading", { name: "Entraînement" })).toBeVisible();
  await page.getByRole("button", { name: "Ouvrir le menu" }).click();
  await expect(page.getByRole("navigation", { name: "Navigation mobile" }).getByRole("link", { name: "Entraînement" })).toBeVisible();
  await page.getByRole("button", { name: "Ouvrir le menu" }).click();
  await page.getByRole("link", { name: "Démarrer une série" }).click();
  for (let exercise = 1; exercise <= 10; exercise += 1) {
    await expect(page.getByLabel(`Exercice ${exercise} sur 10`)).toBeVisible();
    await expect(page.getByRole("list", { name: "Cartes du pli" }).locator("li")).toHaveCount(4);
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
  await expect(page.getByText(/Meilleur résultat local/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Recommencer" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Retour au hub" })).toBeVisible();
  const stored = await page.evaluate(() => localStorage.getItem("coinche:training-progress:v1"));
  expect(JSON.parse(stored ?? "null").axes["trick-value"].completedSeries).toBe(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  browserErrors.assertClean();
});

test("@smoke unknown training axes return a controlled 404", async ({ page }) => {
  const response = await page.goto("/training/puzzle/unknown-axis");
  expect(response?.status()).toBe(404);
  await expect(page.getByText("This page could not be found.")).toBeVisible();
});
