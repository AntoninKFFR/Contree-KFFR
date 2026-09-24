import { expect, test, type Page } from "@playwright/test";

async function startSoloGame(page: Page) {
  await page.getByRole("button", { name: "Commencer la partie" }).click();
  await expect(page.locator(".coinche-game-scene")).toBeVisible();
}

test("@smoke Solo gameplay lives in one responsive table scene", async ({ page }) => {
  for (const viewport of [{ width: 1366, height: 768 }, { width: 844, height: 390 }]) {
    await page.setViewportSize(viewport);
    await page.goto("/solo");
    await expect(page.getByRole("heading", { name: "Prêt à lancer une partie ?" })).toBeVisible();
    await expect(page.locator(".coinche-game-scene")).toHaveCount(0);
    if (viewport.width === 1366) {
      const startButton = page.getByRole("button", { name: "Commencer la partie" });
      await expect(startButton).toBeEnabled();
      await startButton.focus();
      await page.keyboard.press("Enter");
      await expect(page.locator(".coinche-game-scene")).toBeVisible();
    } else {
      await startSoloGame(page);
    }
    const scene = page.locator(".coinche-game-scene");
    await expect(scene).toBeVisible();
    await expect(scene.locator(".coinche-scene-hand-card")).toHaveCount(8);
    await expect(scene.locator(".coinche-player-panel")).toHaveCount(4);
    await expect(scene.locator(".coinche-player-panel").getByText("P", { exact: true })).toHaveCount(1);
    await expect(scene.getByText("Placement", { exact: true })).toHaveCount(0);
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
  const browserErrors: string[] = [];
  page.on("pageerror", (error) => browserErrors.push(error.message));
  page.on("console", (message) => { if (message.type() === "error") browserErrors.push(message.text()); });
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto("/solo");
  await startSoloGame(page);
  const scene = page.locator(".coinche-game-scene");
  await scene.getByRole("button", { name: "Valeur 160" }).click();
  await scene.getByRole("button", { name: "Annoncer" }).click();
  await expect(scene.locator(".coinche-scene-bidding")).toHaveCount(0, { timeout: 30_000 });
  await expect(scene.locator(".coinche-scene-hand-card")).toHaveCount(8);
  const playable = scene.locator(".coinche-scene-hand-card button[data-playable='true']:not([disabled])").first();
  await expect(playable).toBeVisible({ timeout: 15_000 });
  await expect(playable).toHaveAttribute("data-highlighted", "true");
  expect(await playable.evaluate((card) => getComputedStyle(card).boxShadow)).not.toContain("234, 216, 166");
  await page.keyboard.press("Tab");
  await playable.focus();
  await expect(playable).toHaveCSS("outline-color", "rgb(234, 216, 166)");
  await page.getByRole("switch", { name: "Activer le thème clair" }).click();
  expect(await playable.evaluate((card) => getComputedStyle(card).boxShadow)).not.toContain("121, 85, 31");
  await page.keyboard.press("Tab");
  await playable.focus();
  await expect(playable).toHaveCSS("outline-color", "rgb(121, 85, 31)");
  await page.getByRole("switch", { name: "Activer le thème sombre" }).click();
  await playable.click();
  await expect(scene.locator(".coinche-trick-card[data-player-id='0']")).toBeVisible({ timeout: 5_000 });
  await expect(scene.locator(".coinche-trick-card[data-player-id='0']")).toHaveCount(1);
  await page.screenshot({ path: "test-results/scene-playing-dark-1366.png" });
  await page.setViewportSize({ width: 844, height: 390 });
  await page.screenshot({ path: "test-results/scene-playing-dark-844.png" });
  await page.getByRole("switch", { name: "Activer le thème clair" }).click();
  await page.screenshot({ path: "test-results/scene-playing-light-844.png" });
  const lastTrickButton = scene.getByRole("button", { name: "Dernier pli" });
  await expect(lastTrickButton).toBeVisible({ timeout: 20_000 });
  await lastTrickButton.click();
  const lastTrick = scene.getByLabel("Dernier pli", { exact: true });
  await expect(lastTrick.locator(".coinche-trick-card")).toHaveCount(4);
  for (let order = 1; order <= 4; order += 1) {
    const card = lastTrick.locator(`.coinche-trick-card[data-play-order='${order}']`);
    await expect(card).toHaveCSS("z-index", String(order));
    await expect(card.getByLabel(`Carte ${order}`)).toBeVisible();
  }
  expect(await lastTrick.evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
  await lastTrick.getByRole("button", { name: "Fermer" }).click();
  expect(browserErrors).toEqual([]);
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

test("@smoke a fresh Solo installation selects the slow rhythm", async ({ page }) => {
  await page.goto("/solo");
  await page.getByRole("button", { name: "Menu Partie" }).click();
  await page.getByRole("complementary", { name: "Menu de partie" }).getByRole("button", { name: "Paramètres" }).click();
  await expect(page.getByRole("dialog", { name: "Paramètres" }).getByLabel("Vitesse de jeu", { exact: true })).toHaveValue("slow");
});
