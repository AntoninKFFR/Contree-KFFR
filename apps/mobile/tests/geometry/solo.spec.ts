import { expect, test } from "@playwright/test";
import { soloGeometry } from "./solo-geometry";
const sizes = [{ width: 568, height: 320 }, { width: 667, height: 375 }, { width: 844, height: 390 }, { width: 932, height: 430 }];
for (const size of sizes) for (const scenario of ["empty", "bidding", "playing", "finished", "game-over", "offline", "loading"]) test(`Solo ${scenario} fits ${size.width}`, async ({ page }, info) => {
  await page.setViewportSize(size); await page.goto(`/?screen=solo&solo=${scenario}`);
  if (["bidding", "playing", "finished", "game-over"].includes(scenario)) await expect(page.getByTestId("solo-card-table")).toBeVisible();
  await soloGeometry(page);
  await page.screenshot({ path: info.outputPath(`solo-${scenario}.png`), animations: "disabled" });
  await page.getByRole("button", { name: "Quitter la table et revenir à l’accueil" }).click();
  await page.getByRole("button", { name: "Revenir à l’accueil", exact: true }).click();
  await expect(page.getByTestId("home-table")).toBeVisible();
});
test("Solo direct card intent, refusal, rotation, large text and both landscape safe sides", async ({ page }, info) => {
  await page.setViewportSize(sizes[2]); await page.goto("/?screen=solo&solo=empty");
  await page.getByRole("button", { name: "Nouvelle partie", exact: true }).click();
  await page.getByRole("button", { name: "Valeur 90" }).click(); await page.getByRole("button", { name: "Annoncer", exact: true }).click();
  const card = page.getByRole("button", { name: /^Jouer / }).first(), label = (await card.getAttribute("aria-label"))!;
  await card.click(); await expect(page.getByRole("button", { name: label, exact: true })).toHaveCount(0);
  await expect(page.getByTestId("solo-play-0")).toBeVisible(); await soloGeometry(page);
  for (const [left, right] of [[59, 0], [0, 59]]) {
    await page.goto(`/?screen=solo&solo=playing&left=${left}&right=${right}`); await expect(page.getByTestId("solo-card-table")).toBeVisible();
    await soloGeometry(page, left, right); await page.setViewportSize({ width: 390, height: 844 }); await expect(page.getByTestId("rotation-notice")).toBeVisible();
    await page.setViewportSize(sizes[2]); await soloGeometry(page, left, right);
  }
  await page.goto("/?screen=solo&solo=action-error"); const refused = page.getByRole("button", { name: /^Jouer / }).first(); await refused.click();
  await expect(page.getByRole("alert")).toBeVisible(); await expect(refused).toBeVisible(); await soloGeometry(page);
  await page.setViewportSize(sizes[0]); await page.goto("/?screen=solo&solo=playing&font=1.6"); await expect(page.getByTestId("solo-card-table")).toBeVisible(); await soloGeometry(page);
  await page.screenshot({ path: info.outputPath("solo-large-text.png"), animations: "disabled" });
});
test("Solo public trick follows web seat order and last trick opens on demand", async ({ page }, info) => {
  for (const size of [sizes[0], sizes[2]]) for (const font of [1, 1.6]) {
    await page.setViewportSize(size); await page.goto(`/?screen=solo&solo=trick&font=${font}`);
    await expect(page.getByLabel(/Léa, Est, adversaire/)).toBeVisible(); await expect(page.getByLabel(/Hugo, Nord, partenaire/)).toBeVisible(); await expect(page.getByLabel(/Emma, Ouest, adversaire/)).toBeVisible();
    const east = (await page.getByTestId("solo-play-1").boundingBox())!, north = (await page.getByTestId("solo-play-2").boundingBox())!, west = (await page.getByTestId("solo-play-3").boundingBox())!;
    expect(west.x).toBeLessThan(north.x); expect(north.x).toBeLessThan(east.x); expect(north.y).toBeLessThan(west.y);
    await soloGeometry(page); await page.screenshot({ path: info.outputPath(`trick-${size.width}-${font}.png`), animations: "disabled" });
    await page.goto(`/?screen=solo&solo=last-trick&font=${font}`); await expect(page.getByRole("button", { name: "Dernier pli", exact: true })).toBeVisible();
    await expect(page.getByTestId("solo-play-0")).toHaveCount(0); // Historical tricks never replay on load.
    await page.getByRole("button", { name: "Dernier pli", exact: true }).click(); await expect(page.getByText(/gagne · 32 points/)).toBeVisible();
    for (const p of [0, 1, 2, 3]) await expect(page.getByTestId(`solo-play-${p}`)).toBeVisible();
  }
});
