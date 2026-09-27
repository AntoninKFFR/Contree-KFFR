import { expect, test, type Page } from "@playwright/test";
import { TRAINING_PROGRESS_KEY } from "@/components/training/progress";
import { monitorBrowserErrors } from "./helpers/browserErrors";

async function openBiddingQuestion(page: Page) {
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto("/training/puzzle/bidding?level=1");
  await expect(page.getByRole("heading", { name: "Faire son annonce" })).toBeVisible();
  await expect(page.getByText("Ta main", { exact: true })).toBeVisible();
  await expect(page.locator(".coinche-bidding-panel")).toBeVisible();
}

test("@smoke bidding hub, conventions, complete local series and correction", async ({ page }) => {
  test.setTimeout(90_000);
  const monitor = monitorBrowserErrors(page);
  const submissions: string[] = [];
  page.on("request", (request) => { if (request.url().includes("/api/training/series") && request.method() === "POST") submissions.push(request.url()); });
  await page.goto("/training");
  await expect(page.getByText("Annoncer", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Faire son annonce" })).toBeVisible();
  await page.getByRole("link", { name: "Voir les conventions" }).click();
  await expect(page.getByRole("heading", { name: "Conventions d’annonces" })).toBeVisible();
  await expect(page.getByText("Ces conventions décrivent la doctrine utilisée par KFFR Contrée.", { exact: false })).toBeVisible();
  await expect(page.getByText("4+ atouts sans Valet ni 9 : 80 maximum.")).toBeVisible();
  await page.getByRole("link", { name: "Jouer le niveau 1" }).click();
  await expect(page.getByRole("heading", { name: "Faire son annonce" })).toBeVisible();
  await expect(page.getByText("Ta main", { exact: true })).toBeVisible();
  await expect(page.getByText("Tu parles en premier.")).toBeVisible();
  await expect(page.getByText("Adversaire gauche ·", { exact: false })).toHaveCount(0);
  await expect(page.locator(".coinche-bidding-panel")).toBeVisible();
  await expect(page.getByText("Ta main", { exact: true }).locator("..").locator("[aria-label]")).toHaveCount(8);
  for (let index = 1; index <= 10; index += 1) {
    await expect(page.getByLabel(`Exercice ${index} sur 10`)).toBeVisible();
    await page.getByRole("button", { name: "Passer" }).click();
    await expect(page.getByRole("region", { name: "Correction de l’annonce" })).toBeVisible();
    await expect(page.getByText("Selon la doctrine de l’application :", { exact: false })).toBeVisible();
    await expect(page.getByText("Ta réponse :", { exact: false })).toBeVisible();
    await expect(page.locator(".coinche-bidding-panel")).toHaveCount(0);
    await page.getByRole("button", { name: index === 10 ? "Voir le résultat" : "Exercice suivant" }).click();
  }
  await expect(page.getByRole("heading", { name: "Résultat" })).toBeVisible();
  await expect(page.getByText("Meilleur score local :", { exact: false })).toBeVisible();
  const stored = await page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? "null"), TRAINING_PROGRESS_KEY);
  expect(stored.axes.bidding.axisVersion).toBe(1);
  expect(stored.axes.bidding.levels[1].completedSeries).toBe(1);
  expect(submissions).toEqual([]);
  monitor.assertClean();
});

test("@smoke bidding routes reject locked and invalid levels", async ({ page }) => {
  await page.goto("/training/puzzle/bidding?level=2");
  await expect(page.getByRole("heading", { name: "Niveau 2 verrouillé" })).toBeVisible();
  await page.goto("/training/puzzle/bidding?level=5");
  await expect(page.getByRole("heading", { name: "404" })).toBeVisible();
});

for (const viewport of [{ width: 390, height: 844 }, { width: 667, height: 375 },
  { width: 844, height: 390 }, { width: 1366, height: 768 }]) {
  test(`@smoke bidding question and correction stay usable at ${viewport.width}×${viewport.height}`, async ({ page }) => {
    const monitor = monitorBrowserErrors(page);
    await openBiddingQuestion(page);
    await page.setViewportSize(viewport);
    const pass = page.getByRole("button", { name: "Passer" });
    await pass.scrollIntoViewIfNeeded();
    await expect(pass).toBeInViewport();
    expect((await pass.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    expect((await page.getByRole("button", { name: "Valeur 80" }).boundingBox())!.height).toBeGreaterThanOrEqual(44);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
    await pass.click();
    await expect(page.getByRole("region", { name: "Correction de l’annonce" })).toBeVisible();
    const next = page.getByRole("button", { name: "Exercice suivant" });
    await expect(next).toBeFocused();
    await next.scrollIntoViewIfNeeded();
    await expect(next).toBeInViewport();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
    monitor.assertClean();
  });
}

test("@smoke bidding conventions fit a 390px portrait screen", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/training/conventions/bidding");
  await expect(page.getByRole("heading", { name: "Conventions d’annonces" })).toBeVisible();
  await expect(page.getByText("À 160 : J–9–A–10, ou J–9–A plus un As extérieur.")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
});
