import { expect, test } from "@playwright/test";

const pages = ["/training", "/solo", "/multiplayer", "/friends", "/rules", "/profile", "/history", "/leaderboard"];

for (const viewport of [
  { width: 390, height: 844 },
  { width: 1366, height: 768 },
  { width: 1920, height: 1080 },
]) {
  test(`@smoke top-level headers share the page canvas at ${viewport.width}×${viewport.height}`, async ({ page }) => {
    test.setTimeout(120_000);
    await page.setViewportSize(viewport);
    let expected: { left: number; right: number; width: number } | null = null;
    for (const path of pages) {
      await page.goto(path, { waitUntil: "domcontentloaded" });
      const header = page.locator(".coinche-page-header");
      await expect(header, `${path} canonical header`).toBeVisible();
      await expect(header.locator("h1")).toBeVisible();
      await expect(page.locator(".coinche-suit-backdrop")).toHaveCount(0);
      const box = await header.boundingBox();
      expect(box).not.toBeNull();
      const bounds = { left: box!.x, right: box!.x + box!.width, width: box!.width };
      if (expected) {
        expect(Math.abs(bounds.left - expected.left), `${path} left edge`).toBeLessThanOrEqual(2);
        expect(Math.abs(bounds.right - expected.right), `${path} right edge`).toBeLessThanOrEqual(2);
        expect(Math.abs(bounds.width - expected.width), `${path} width`).toBeLessThanOrEqual(2);
      } else {
        expected = bounds;
      }
      const canvas = await page.locator(".coinche-app-page > div").first().boundingBox();
      expect(canvas).not.toBeNull();
      expect(Math.abs(box!.x - canvas!.x), `${path} header starts at canvas edge`).toBeLessThanOrEqual(2);
      expect(Math.abs(box!.width - canvas!.width), `${path} header fills canvas`).toBeLessThanOrEqual(2);
      expect(await page.evaluate(() => document.documentElement.scrollWidth), `${path} no horizontal overflow`).toBeLessThanOrEqual(viewport.width);
      const actions = header.locator(".coinche-page-header-actions");
      if (await actions.count()) {
        const actionBox = await actions.boundingBox();
        expect(actionBox).not.toBeNull();
        expect(actionBox!.x + actionBox!.width).toBeLessThanOrEqual(bounds.right + 2);
      }
    }
  });
}

test("@smoke Calculer keeps one exercise card with levels inside and challenges apart", async ({ page }) => {
  await page.goto("/training");
  const calculating = page.locator("section[aria-labelledby='calculer']");
  const trick = calculating.locator("article.training-mode-card").filter({ has: page.getByRole("heading", { name: "Valeur d’un pli" }) });
  await expect(trick).toHaveCount(1);
  await expect(trick.getByLabel("Niveaux de Valeur d’un pli")).toBeVisible();
  await expect(trick.getByRole("link", { name: "Niveau 1 · Fondamentaux" })).toHaveAttribute("href", "/training/puzzle/trick-value?level=1");
  await expect(trick.getByLabel("Niveau 2 verrouillé")).toBeVisible();
  await expect(calculating.getByRole("heading", { name: "Fondamentaux", exact: true })).toHaveCount(0);
  await expect(calculating.getByRole("heading", { name: "Confirmé", exact: true })).toHaveCount(0);
  await expect(calculating.getByRole("heading", { name: "Défis" })).toBeVisible();
  await expect(calculating.getByRole("heading", { name: "Survie" })).toBeVisible();
  await expect(calculating.getByRole("heading", { name: "Blitz" })).toBeVisible();
});
