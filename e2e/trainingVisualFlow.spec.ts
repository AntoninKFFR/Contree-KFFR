import { expect, test } from "@playwright/test";

const viewports = [
  { width: 390, height: 844 }, { width: 667, height: 375 },
  { width: 844, height: 390 }, { width: 1366, height: 768 },
];

for (const viewport of viewports) {
  test(`@smoke training flow remains readable at ${viewport.width}×${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    const noHorizontalScroll = async () => expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);

    await page.goto("/training");
    await expect(page.getByRole("heading", { name: "Entraînement", exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Annoncer", exact: true })).toBeVisible();
    const reading = page.locator("article").filter({ has: page.getByRole("heading", { name: "Lire les enchères" }) });
    await expect(reading.getByRole("link", { name: "Jouer en solo" })).toBeVisible();
    await expect(reading.getByRole("link", { name: "Jouer à deux" })).toBeVisible();
    const action = reading.getByRole("link", { name: "Jouer en solo" });
    expect((await action.boundingBox())?.height).toBeGreaterThanOrEqual(44);
    await noHorizontalScroll();

    await page.goto("/training/puzzle/trick-value?level=1");
    await expect(page.getByRole("progressbar", { name: "Progression de la série" })).toHaveAttribute("aria-valuenow", "1");
    await expect(page.getByText("Combien vaut ce pli ?")).toBeVisible();
    await page.getByRole("textbox", { name: "Ta réponse en points" }).fill("0");
    await page.getByRole("button", { name: "Valider" }).click();
    await expect(page.getByText(/Ce pli vaut \d+ points/)).toBeVisible();
    await noHorizontalScroll();

    await page.goto("/training/puzzle/bid-reading?level=1");
    const auction = page.getByRole("region", { name: "Historique public des enchères" });
    const bids = auction.locator("ol > li");
    await expect(auction.locator("ol.training-auction-list")).toHaveCSS("flex-direction", viewport.width < 640 ? "column" : "row");
    await expect(auction.locator(".training-auction-connector[aria-hidden=true]")).toHaveCount(await bids.count() - 1);
    if (viewport.width < 640 && await bids.count() > 1) {
      expect(await auction.locator(".training-auction-connector").first().evaluate((element) => getComputedStyle(element, "::after").content)).toContain("↓");
    }
    await expect(auction.locator("[aria-current=step]")).toHaveCount(1);
    await expect(auction.locator("[aria-current=step] .training-auction-target")).toHaveText("Annonce à lire");
    await expect(page.getByRole("checkbox").first()).toBeVisible();
    await noHorizontalScroll();

    await page.goto("/training/duo");
    await expect(page.getByRole("heading", { name: "Lire les enchères à deux" })).toBeVisible();
    await noHorizontalScroll();

    await page.goto("/training/conventions/bidding");
    const nav = page.getByRole("navigation", { name: "Sections des conventions" });
    await nav.getByRole("link", { name: "Coinche", exact: true }).click();
    await expect(page.locator("#coinche")).toBeVisible();
    const sectionOrder = await page.locator(".training-convention-section h2").evaluateAll((headings) => headings.map((heading) => heading.id));
    expect(sectionOrder.indexOf("lecture")).toBeGreaterThan(sectionOrder.indexOf("surcoinche"));
    expect(sectionOrder.indexOf("lecture")).toBeLessThan(sectionOrder.indexOf("reglement"));
    await noHorizontalScroll();
  });
}

test("@smoke a longer auction stays sequential on desktop and vertical on mobile", async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto("/training");
  await page.evaluate(() => localStorage.setItem("coinche:training-progress:v1", JSON.stringify({ version: 1, axes: {
    "bid-reading": { axisVersion: 1, unlockedLevel: 4, levels: {
      1: { bestScore: 8, completedSeries: 1 }, 2: { bestScore: 8, completedSeries: 1 },
      3: { bestScore: 8, completedSeries: 1 }, 4: { bestScore: 0, completedSeries: 0 },
    } },
  } })));
  await page.goto("/training/puzzle/bid-reading?level=4");
  const auction = page.getByRole("region", { name: "Historique public des enchères" });
  await expect(auction.locator("ol > li")).toHaveCount(5);
  await expect(auction.locator(".training-auction-connector[aria-hidden=true]")).toHaveCount(4);
  await expect(auction.locator("[aria-current=step] .training-auction-target")).toHaveText("Annonce à lire");
  await expect(auction.locator("ol")).toHaveCSS("flex-direction", "row");
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(auction.locator("ol")).toHaveCSS("flex-direction", "column");
  expect(await auction.locator(".training-auction-connector").first().evaluate((element) => getComputedStyle(element, "::after").content)).toContain("↓");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
});
