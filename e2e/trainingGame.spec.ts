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
  await page.evaluate(() => {
    const timing = { pendingAt: 0, dialogAt: 0, stateAtPending: "", stateAtDialog: "", tableVisible: false };
    (window as typeof window & { __trainingQuestionTiming?: typeof timing }).__trainingQuestionTiming = timing;
    const observer = new MutationObserver(() => {
      const game = document.querySelector<HTMLElement>('[aria-label="Partie d’entraînement"]');
      if (!timing.pendingAt && game?.dataset.trainingQuestionPending === "true") {
        timing.pendingAt = performance.now();
        timing.stateAtPending = game.dataset.gameStateKey ?? "";
        timing.tableVisible = !!document.querySelector(".coinche-game-scene");
      }
      if (timing.pendingAt && !timing.dialogAt && document.querySelector('[role="dialog"]')) {
        timing.dialogAt = performance.now();
        timing.stateAtDialog = game?.dataset.gameStateKey ?? "";
        observer.disconnect();
      }
    });
    observer.observe(document, { subtree: true, childList: true, attributes: true });
  });
  const playable = scene.locator(".coinche-scene-hand-card button[data-playable='true']:not([disabled])").first();
  const dialog = page.getByRole("dialog", { name: "Valeur d’un pli" });
  await expect.poll(async () => {
    if (await dialog.isVisible()) return true;
    if (await page.getByRole("main", { name: "Partie d’entraînement" }).getAttribute("data-training-question-pending") === "true") return false;
    if (await playable.isVisible().catch(() => false)) await playable.click();
    return await dialog.isVisible();
  }, { timeout: 60_000, intervals: [100, 200, 300] }).toBe(true);
  return { scene, dialog };
}

async function expectTrickValueDialogFits(page: Page, dialog: ReturnType<Page["getByRole"]>, action: "Valider" | "Reprendre la partie") {
  await expect(dialog.getByText("Combien vaut ce pli ?")).toBeVisible();
  const cards = dialog.locator('[aria-label="Cartes du pli"] [aria-label]');
  await expect(cards).toHaveCount(4);
  for (const card of await cards.all()) await expect(card).toBeInViewport();
  await expect(dialog.getByRole("textbox", { name: "Ta réponse en points" }).or(dialog.getByText(/Ta réponse :/))).toBeInViewport();
  await expect(dialog.getByRole("button", { name: action, exact: true })).toBeInViewport();
  const geometry = await dialog.evaluate((element) => {
    const content = element.querySelector<HTMLElement>(".overflow-y-auto")!;
    return { dialogHeight: element.clientHeight, dialogScrollHeight: element.scrollHeight,
      contentHeight: content.clientHeight, contentScrollHeight: content.scrollHeight,
      contentWidth: content.clientWidth, contentScrollWidth: content.scrollWidth };
  });
  expect(geometry.dialogScrollHeight).toBeLessThanOrEqual(geometry.dialogHeight + 2);
  expect(geometry.contentScrollHeight).toBeLessThanOrEqual(geometry.contentHeight + 2);
  expect(geometry.contentScrollWidth).toBeLessThanOrEqual(geometry.contentWidth + 2);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
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
  const timing = await page.evaluate(() => (window as typeof window & { __trainingQuestionTiming?: {
    pendingAt: number; dialogAt: number; stateAtPending: string; stateAtDialog: string; tableVisible: boolean;
  } }).__trainingQuestionTiming!);
  expect(timing.pendingAt).toBeGreaterThan(0);
  expect(timing.dialogAt - timing.pendingAt).toBeGreaterThanOrEqual(500);
  expect(timing.stateAtDialog).toBe(timing.stateAtPending);
  expect(timing.tableVisible).toBe(true);
  await expectTrickValueDialogFits(page, dialog, "Valider");
  const heightBefore = await dialog.evaluate((element) => element.getBoundingClientRect().height);
  const puzzleProgressBefore = await page.evaluate((key) => localStorage.getItem(key), TRAINING_PROGRESS_KEY);
  const game = page.getByRole("main", { name: "Partie d’entraînement" });
  const pausedKey = await game.getAttribute("data-game-state-key");
  await page.waitForTimeout(900);
  await expect(game).toHaveAttribute("data-game-state-key", pausedKey!);
  await dialog.getByRole("textbox", { name: "Ta réponse en points" }).fill("0");
  await dialog.getByRole("button", { name: "Valider", exact: true }).click();
  await expect(dialog.getByText("Ce pli vaut")).toBeVisible();
  await expect(dialog.getByLabel("Pavé numérique")).toHaveCount(0);
  await expectTrickValueDialogFits(page, dialog, "Reprendre la partie");
  expect(await dialog.evaluate((element) => element.getBoundingClientRect().height)).toBeLessThanOrEqual(heightBefore + 2);
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

for (const viewport of [{ width: 667, height: 375 }, { width: 844, height: 390 }, { width: 1024, height: 576 }]) test(`@smoke trick-value question and correction fit ${viewport.width}×${viewport.height}`, async ({ page }) => {
  test.setTimeout(90_000);
  await page.setViewportSize(viewport.width === 667 ? { width: 844, height: 390 } : viewport);
  const { dialog } = await openFirstQuestion(page);
  if (viewport.width === 667) await page.setViewportSize(viewport);
  await expectTrickValueDialogFits(page, dialog, "Valider");
  const heightBefore = await dialog.evaluate((element) => element.getBoundingClientRect().height);
  await dialog.getByRole("textbox", { name: "Ta réponse en points" }).fill("0");
  await dialog.getByRole("button", { name: "Valider", exact: true }).click();
  await expect(dialog.getByText("Ce pli vaut")).toBeVisible();
  await expect(dialog.getByLabel("Pavé numérique")).toHaveCount(0);
  await expectTrickValueDialogFits(page, dialog, "Reprendre la partie");
  expect(await dialog.evaluate((element) => element.getBoundingClientRect().height)).toBeLessThanOrEqual(heightBefore + 2);
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
