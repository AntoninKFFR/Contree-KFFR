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
    await expect(page.getByRole("region", { name: "Historique public des enchères" }).locator("[aria-current=step]")).toHaveCount(1);
    await expect(page.getByRole("checkbox").first()).toBeVisible();
    await noHorizontalScroll();

    await page.goto("/training/duo");
    await expect(page.getByRole("heading", { name: "Lire les enchères à deux" })).toBeVisible();
    await noHorizontalScroll();

    await page.goto("/training/conventions/bidding");
    const nav = page.getByRole("navigation", { name: "Sections des conventions" });
    await nav.getByRole("link", { name: "Coinche", exact: true }).click();
    await expect(page.locator("#coinche")).toBeVisible();
    await noHorizontalScroll();
  });
}
