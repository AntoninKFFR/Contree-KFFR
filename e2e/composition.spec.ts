import { expect, test } from "@playwright/test";

const pages = ["/training", "/solo", "/multiplayer", "/friends", "/rules", "/leaderboard", "/history", "/profile"];
const viewports = [
  { width: 390, height: 844 },
  { width: 667, height: 375 },
  { width: 844, height: 390 },
  { width: 1366, height: 768 },
  { width: 1920, height: 1080 },
];

for (const viewport of viewports) {
  test(`@smoke page heroes reserve suit space at ${viewport.width}×${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    for (const path of pages) {
      await page.goto(path);
      const header = page.locator(".coinche-page-header--hero").first();
      await expect(header, `${path} canonical header`).toBeVisible();
      const backdrop = header.locator(".coinche-suit-backdrop");
      await expect(backdrop).toBeVisible();
      const decoration = await backdrop.boundingBox();
      expect(decoration).not.toBeNull();
      for (const target of await header.locator("h1, .coinche-page-header-description, a, button").all()) {
        if (!await target.isVisible()) continue;
        const content = await target.boundingBox();
        expect(content).not.toBeNull();
        const horizontalOverlap = Math.min(decoration!.x + decoration!.width, content!.x + content!.width) - Math.max(decoration!.x, content!.x);
        const verticalOverlap = Math.min(decoration!.y + decoration!.height, content!.y + content!.height) - Math.max(decoration!.y, content!.y);
        expect(horizontalOverlap <= 1 || verticalOverlap <= 1, `${path} ${await target.textContent()} overlaps suits`).toBe(true);
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
