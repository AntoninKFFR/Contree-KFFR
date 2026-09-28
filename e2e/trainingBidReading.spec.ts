import { expect, test, type Page } from "@playwright/test";
import { TRAINING_PROGRESS_KEY } from "@/components/training/progress";
import { monitorBrowserErrors } from "./helpers/browserErrors";

async function openFirstQuestion(page: Page) {
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto("/training/puzzle/bid-reading?level=1");
  await expect(page.getByRole("heading", { name: "Lire les enchères" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Historique public des enchères" })).toBeVisible();
}

test("@smoke bid-reading hub, ten questions, local progress and no server record", async ({ page }) => {
  test.setTimeout(90_000);
  const monitor = monitorBrowserErrors(page);
  const posts: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("/api/training/series") && request.method() === "POST") posts.push(request.url());
  });
  await page.goto("/training");
  const card = page.locator("article").filter({ has: page.getByRole("heading", { name: "Lire les enchères" }) });
  await expect(card).toBeVisible();
  await expect(card.getByText("Niveau 1 · Lire une ouverture")).toBeVisible();
  await expect(card.getByRole("link", { name: "Voir les conventions" })).toBeVisible();
  await expect(card.getByRole("link", { name: "Jouer à deux" })).toHaveAttribute("href", "/training/duo");
  await expect(card.getByText("Même série, deux réponses indépendantes.")).toBeVisible();
  await card.getByRole("link", { name: "Jouer en solo" }).click();
  for (let index = 1; index <= 10; index += 1) {
    await expect(page.getByLabel(`Exercice ${index} sur 10`)).toBeVisible();
    const history = page.getByRole("region", { name: "Historique public des enchères" });
    await expect(history.locator("[aria-current=step]")).toHaveCount(1);
    await expect(page.getByRole("region", { name: "Exemple de main compatible" })).toHaveCount(0);
    await expect(page.getByRole("checkbox").first()).toBeVisible();
    await page.getByRole("button", { name: "Valider" }).click();
    const correction = page.getByRole("region", { name: "Correction de la lecture" });
    await expect(correction).toBeVisible();
    await expect(correction.getByText("Selon la doctrine de l’application")).toBeVisible();
    await expect(correction.getByText("Tu peux affirmer :")).toBeVisible();
    await expect(correction.getByText("Cette enchère peut correspondre à :")).toBeVisible();
    const hand = correction.getByRole("region", { name: "Exemple de main compatible" });
    await expect(hand.getByText("Une main compatible parmi d’autres")).toBeVisible();
    await expect(hand.locator("span[aria-label]")).toHaveCount(8);
    const next = page.getByRole("button", { name: index === 10 ? "Voir le résultat" : "Exercice suivant" });
    await expect(next).toBeFocused();
    await next.click();
  }
  await expect(page.getByRole("heading", { name: "Résultat" })).toBeVisible();
  await expect(page.getByText("Meilleur score local :", { exact: false })).toBeVisible();
  const saved = await page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? "null"), TRAINING_PROGRESS_KEY);
  expect(saved.axes["bid-reading"].axisVersion).toBe(1);
  expect(saved.axes["bid-reading"].levels[1].completedSeries).toBe(1);
  expect(posts).toEqual([]);
  monitor.assertClean();
});

test("@smoke bid-reading locks unopened levels and rejects invalid levels", async ({ page }) => {
  await page.goto("/training/puzzle/bid-reading?level=2");
  await expect(page.getByRole("heading", { name: "Niveau 2 verrouillé" })).toBeVisible();
  await page.goto("/training/puzzle/bid-reading?level=5");
  await expect(page.getByRole("heading", { name: "404" })).toBeVisible();
});

for (const viewport of [{ width: 390, height: 844 }, { width: 667, height: 375 },
  { width: 844, height: 390 }, { width: 1366, height: 768 }]) {
  test(`@smoke bid-reading question and correction fit ${viewport.width}×${viewport.height}`, async ({ page }) => {
    const monitor = monitorBrowserErrors(page);
    await openFirstQuestion(page);
    await page.setViewportSize(viewport);
    const submit = page.getByRole("button", { name: "Valider" });
    await submit.scrollIntoViewIfNeeded();
    await expect(submit).toBeInViewport();
    expect((await submit.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
    await submit.click();
    const next = page.getByRole("button", { name: "Exercice suivant" });
    await expect(next).toBeFocused();
    await next.scrollIntoViewIfNeeded();
    await expect(next).toBeInViewport();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
    monitor.assertClean();
  });
}
