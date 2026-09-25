import { expect, test, type Page } from "@playwright/test";
import { clonePlayerPreferences, PLAYER_PREFERENCES_STORAGE_KEY } from "../lib/preferences/playerPreferences";
import { TRAINING_PROGRESS_KEY } from "../components/training/progress";

async function openFirstQuestion(page: Page, rotateForGame = false) {
  const preferences = clonePlayerPreferences();
  preferences.gameplay.gameSpeed = "custom";
  preferences.gameplay.biddingDelayMs = 0;
  preferences.gameplay.botDelayMs = 250;
  preferences.gameplay.trickDisplayMs = 300;
  await page.addInitScript(({ key, value }) => localStorage.setItem(key, value), {
    key: PLAYER_PREFERENCES_STORAGE_KEY, value: JSON.stringify(preferences),
  });
  await page.goto("/training/game");
  await expect(page.getByRole("heading", { name: "Entraînement en partie" })).toBeVisible();
  await expect(page.getByRole("checkbox", { name: "Valeur d’un pli" })).toBeChecked();
  await expect(page.getByLabel("Niveau", { exact: true }).first()).toHaveValue("1");
  if (rotateForGame) {
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
    await page.setViewportSize({ width: 844, height: 390 });
  }
  await page.getByRole("button", { name: "Lancer la partie" }).click();
  const scene = page.locator(".coinche-game-scene");
  await expect(scene).toBeVisible();
  await scene.getByRole("button", { name: "Valeur 160" }).click();
  await scene.getByRole("button", { name: "Annoncer" }).click();
  const playable = scene.locator(".coinche-scene-hand-card button[data-playable='true']:not([disabled])").first();
  await expect(playable).toBeVisible({ timeout: 15_000 });
  await playable.click();
  const dialog = page.getByRole("dialog", { name: "Valeur d’un pli" });
  await expect(dialog).toBeVisible({ timeout: 30_000 });
  return { scene, dialog };
}

test("@smoke in-game practice pauses the real Solo loop, corrects and resumes without a games write", async ({ page }) => {
  test.setTimeout(90_000);
  const gamesWrites: string[] = [];
  page.on("request", (request) => {
    if (/\/rest\/v1\/games(?:\?|$)/.test(request.url()) && ["POST", "PUT", "PATCH", "DELETE"].includes(request.method())) {
      gamesWrites.push(`${request.method()} ${request.url()}`);
    }
  });
  await page.setViewportSize({ width: 1366, height: 768 });
  const { scene, dialog } = await openFirstQuestion(page);
  const puzzleProgressBefore = await page.evaluate((key) => localStorage.getItem(key), TRAINING_PROGRESS_KEY);
  const game = page.getByRole("main", { name: "Partie d’entraînement" });
  const pausedKey = await game.getAttribute("data-game-state-key");
  await page.waitForTimeout(900);
  await expect(game).toHaveAttribute("data-game-state-key", pausedKey!);
  await dialog.getByRole("textbox", { name: "Ta réponse en points" }).fill("0");
  await dialog.getByRole("button", { name: "Valider", exact: true }).click();
  await expect(dialog.getByText("Ce pli vaut")).toBeVisible();
  await expect(game).toHaveAttribute("data-game-state-key", pausedKey!);
  await dialog.getByRole("button", { name: "Reprendre la partie" }).click();
  await expect(dialog).toHaveCount(0);
  await expect.poll(async () => {
    const key = await game.getAttribute("data-game-state-key");
    if (key !== pausedKey) return true;
    const playable = scene.locator(".coinche-scene-hand-card button[data-playable='true']:not([disabled])").first();
    if (await playable.isVisible().catch(() => false)) await playable.click();
    return (await game.getAttribute("data-game-state-key")) !== pausedKey;
  }, { timeout: 10_000 }).toBe(true);
  expect(gamesWrites).toEqual([]);
  expect(await page.evaluate((key) => localStorage.getItem(key), TRAINING_PROGRESS_KEY)).toBe(puzzleProgressBefore);
});

test("@smoke in-game question stays usable without horizontal overflow on a narrow mobile screen", async ({ page }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 390, height: 844 });
  const { dialog } = await openFirstQuestion(page, true);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  const input = dialog.getByRole("textbox", { name: "Ta réponse en points" });
  await input.scrollIntoViewIfNeeded();
  await input.fill("0");
  await dialog.getByRole("button", { name: "Valider", exact: true }).click();
  await expect(dialog.getByRole("button", { name: "Reprendre la partie" })).toBeVisible();
  expect(await dialog.evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
});
