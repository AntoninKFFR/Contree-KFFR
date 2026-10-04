import { expect, test, type Page } from "@playwright/test";
import { openFirstTrainingQuestion } from "./helpers/trainingGame";
import { TRAINING_PROGRESS_KEY } from "../components/training/progress";
import { IPHONE_UA, simulatePwaEnvironment } from "./helpers/pwa";
import { expectInsideSafeViewport, simulateSafeAreas } from "./helpers/mobile";

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
  const { scene, dialog } = await openFirstTrainingQuestion(page);
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

for (const viewport of [{ width: 568, height: 320 }, { width: 667, height: 375 }, { width: 844, height: 390 }, { width: 1024, height: 576 }]) test(`@smoke trick-value question and correction fit ${viewport.width}×${viewport.height}`, async ({ page }) => {
  test.setTimeout(90_000);
  await simulatePwaEnvironment(page, {ua:IPHONE_UA, standalone:'ios'});
  const { dialog } = await openFirstTrainingQuestion(page);
  await page.setViewportSize(viewport);
  const safe = {top:0, left:44, right:0, bottom:34};
  await simulateSafeAreas(page, safe);
  await expectTrickValueDialogFits(page, dialog, "Valider");
  await expectInsideSafeViewport(page, dialog.locator('.coinche-dialog'), safe);
  await expectInsideSafeViewport(page, dialog.getByRole('button', {name:'Valider', exact:true}), safe);
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
  const { dialog } = await openFirstTrainingQuestion(page);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  const input = dialog.getByRole("textbox", { name: "Ta réponse en points" });
  await input.scrollIntoViewIfNeeded();
  await input.fill("0");
  await dialog.getByRole("button", { name: "Valider", exact: true }).click();
  await expect(dialog.getByRole("button", { name: "Reprendre la partie" })).toBeVisible();
  expect(await dialog.evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
});
