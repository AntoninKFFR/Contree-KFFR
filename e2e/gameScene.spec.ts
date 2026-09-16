import { expect, test } from "@playwright/test";

test("@smoke Solo gameplay lives in one responsive table scene", async ({ page }) => {
  for (const viewport of [{ width: 1366, height: 768 }, { width: 844, height: 390 }]) {
    await page.setViewportSize(viewport);
    await page.goto("/solo");
    const scene = page.locator(".coinche-game-scene");
    await expect(scene).toBeVisible();
    await expect(scene.locator(".coinche-scene-hand-card")).toHaveCount(8);
    await expect(scene.locator(".coinche-player-panel")).toHaveCount(4);
    await expect(scene.locator(".coinche-scene-bidding .coinche-bidding-panel")).toBeVisible();
    const bidding = scene.locator(".coinche-bidding-panel");
    const announce = await bidding.getByRole("button", { name: "Annoncer" }).boundingBox();
    const pass = await bidding.getByRole("button", { name: "Passer" }).boundingBox();
    expect(announce && pass && Math.abs(announce.y - pass.y) < 2 && pass.x >= announce.x + announce.width - 2).toBe(true);
    await expect(page.locator("main > .coinche-bidding-panel")).toHaveCount(0);
    const bounds = await scene.boundingBox();
    expect(bounds?.height).toBeGreaterThan(viewport.height * 0.75);
    const overflow = await page.evaluate(() => ({
      x: document.documentElement.scrollWidth - innerWidth,
      y: document.documentElement.scrollHeight - innerHeight,
    }));
    expect(overflow.x).toBeLessThanOrEqual(1);
    expect(overflow.y).toBeLessThanOrEqual(1);
    await expect(scene.getByRole("button", { name: /^Jouer / }).first()).toBeVisible();
  }
});

test("@smoke Solo keeps the hand and played cards inside the scene", async ({ page }) => {
  test.setTimeout(60_000);
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto("/solo");
  const scene = page.locator(".coinche-game-scene");
  await scene.getByRole("button", { name: "Valeur 160" }).click();
  await scene.getByRole("button", { name: "Annoncer" }).click();
  await expect(scene.locator(".coinche-scene-bidding")).toHaveCount(0, { timeout: 30_000 });
  await expect(scene.locator(".coinche-scene-hand-card")).toHaveCount(8);
  const playable = scene.locator(".coinche-scene-hand-card button[data-playable='true']:not([disabled])").first();
  await expect(playable).toBeVisible({ timeout: 15_000 });
  await expect(playable).toHaveCSS("border-color", "rgb(234, 216, 166)");
  await page.keyboard.press("Tab");
  await playable.focus();
  await expect(playable).toHaveCSS("outline-color", "rgb(234, 216, 166)");
  await page.getByRole("switch", { name: "Activer le thème clair" }).click();
  await expect(playable).toHaveCSS("border-color", "rgb(121, 85, 31)");
  await page.keyboard.press("Tab");
  await playable.focus();
  await expect(playable).toHaveCSS("outline-color", "rgb(121, 85, 31)");
  await page.getByRole("switch", { name: "Activer le thème sombre" }).click();
  await playable.click();
  await expect(scene.locator(".coinche-trick-card[data-player-id='0']")).toBeVisible({ timeout: 5_000 });
  await page.screenshot({ path: "test-results/scene-playing-dark-1366.png" });
  await page.setViewportSize({ width: 844, height: 390 });
  await page.screenshot({ path: "test-results/scene-playing-dark-844.png" });
  await page.getByRole("switch", { name: "Activer le thème clair" }).click();
  await page.screenshot({ path: "test-results/scene-playing-light-844.png" });
});

test("@smoke round success accent follows dark and light KFFR tokens", async ({ page }) => {
  await page.goto("/solo");
  for (const [theme, expected] of [["dark", "rgb(234, 216, 166)"], ["light", "rgb(121, 85, 31)"]] as const) {
    const current = await page.locator("html").getAttribute("data-theme");
    if (current !== theme) await page.getByRole("switch", { name: theme === "light" ? "Activer le thème clair" : "Activer le thème sombre" }).click();
    const color = await page.evaluate(() => {
      const label = document.createElement("p");
      label.className = "coinche-round-success-label";
      document.body.append(label);
      const value = getComputedStyle(label).color;
      label.remove();
      return value;
    });
    expect(color).toBe(expected);
  }
});
