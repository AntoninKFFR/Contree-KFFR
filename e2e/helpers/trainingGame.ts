import { expect, type Page } from "@playwright/test";
import { clonePlayerPreferences, PLAYER_PREFERENCES_STORAGE_KEY } from "../../lib/preferences/playerPreferences";

export async function openFirstTrainingQuestion(page: Page) {
  const preferences = clonePlayerPreferences();
  preferences.gameplay.gameSpeed = "custom";
  preferences.gameplay.biddingDelayMs = 0;
  preferences.gameplay.botDelayMs = 250;
  preferences.gameplay.trickDisplayMs = 300;
  await page.addInitScript(({ key, value }) => localStorage.setItem(key, value), {
    key: PLAYER_PREFERENCES_STORAGE_KEY, value: JSON.stringify(preferences),
  });
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto("/training/game");
  await expect(page.getByRole("heading", { name: "Entraînement en partie" })).toBeVisible();
  await expect(page.locator('.coinche-global-header')).toHaveAttribute('data-header-variant', 'default');
  await expect(page.getByRole("checkbox", { name: "Valeur d’un pli" })).toBeChecked();
  await expect(page.getByLabel("Niveau", { exact: true }).first()).toHaveValue("1");
  await page.getByRole("button", { name: "Lancer la partie" }).click();
  const scene = page.locator(".coinche-game-scene");
  await expect(scene).toBeVisible();
  await expect(page.locator('.coinche-global-header')).toHaveAttribute('data-header-variant', 'compact-game');
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
    const pass = scene.getByRole("button", { name: "Passer", exact: true });
    if (await pass.isVisible().catch(() => false) && await pass.isEnabled()) await pass.click();
    if (await playable.isVisible().catch(() => false)) await playable.click();
    return await dialog.isVisible();
  }, { timeout: 60_000, intervals: [100, 200, 300] }).toBe(true);
  return { scene, dialog };
}
