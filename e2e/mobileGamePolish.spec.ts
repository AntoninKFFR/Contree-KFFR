import { expect, test, type Locator, type Page } from "@playwright/test";
import { installMobileGameFixture, mobileGameState } from "./helpers/mobileGameFixture";
import { expectInsideSafeViewport, expectNoPageHorizontalOverflow, simulateSafeAreas } from "./helpers/mobile";
import { clonePlayerPreferences, PLAYER_PREFERENCES_STORAGE_KEY } from "../lib/preferences/playerPreferences";
import { installTrainingMobileFixture } from "./helpers/trainingMobileFixture";

const sizes = [{ width: 568, height: 320 }, { width: 667, height: 375 }, { width: 844, height: 390 }, { width: 932, height: 430 }];
const safe = { top: 8, left: 44, right: 0, bottom: 34 };
async function preferences(page: Page, reducedMotion = true) {
  const value = clonePlayerPreferences();
  value.visual.reducedMotion = reducedMotion;
  value.gameplay.autoCollectTricks = false;
  await page.addInitScript(({ key, value }) => localStorage.setItem(key, JSON.stringify(value)), { key: PLAYER_PREFERENCES_STORAGE_KEY, value });
}
async function target(page: Page, locator: Locator) {
  await expectInsideSafeViewport(page, locator, safe);
  const box = (await locator.boundingBox())!;
  expect(box.width + .001).toBeGreaterThanOrEqual(44);
  expect(box.height + .001).toBeGreaterThanOrEqual(44);
}
async function capotAndSuits(page: Page) {
  const value = (await page.getByRole("button", { name: "Valeur 160" }).boundingBox())!;
  const capot = (await page.getByRole("button", { name: "Capot", exact: true }).boundingBox())!;
  expect(Math.abs(capot.y - value.y)).toBeLessThan(1);
  expect(capot.x).toBeGreaterThanOrEqual(value.x + value.width + 3);
  const suits = await Promise.all((await page.locator(".coinche-bidding-suits button").all()).map(button => button.boundingBox()));
  expect(suits).toHaveLength(4);
  expect(Math.abs(suits[0]!.y - suits[1]!.y)).toBeLessThan(1);
  expect(Math.abs(suits[2]!.y - suits[3]!.y)).toBeLessThan(1);
  expect(Math.abs(suits[0]!.x - suits[2]!.x)).toBeLessThan(1);
  expect(Math.abs(suits[1]!.x - suits[3]!.x)).toBeLessThan(1);
  expect(suits[2]!.y).toBeGreaterThanOrEqual(suits[0]!.y + suits[0]!.height + 3);
}

for (const viewport of sizes) for (const mode of ["solo", "multi"] as const) {
  test(`@mobile @immersive-polish ${mode} balanced bidding, hand, score and portrait ${viewport.width}`, async ({ page }, info) => {
    await preferences(page); await page.setViewportSize(viewport);
    const fixture = await installMobileGameFixture(page);
    await page.goto(mode === "solo" ? "/solo" : fixture.path);
    await expect(page.locator(".coinche-bidding-panel")).toBeVisible(); await simulateSafeAreas(page, safe);
    for (const name of await page.locator(".coinche-player-name").all()) expect((await name.boundingBox())!.width).toBeGreaterThanOrEqual(12);
    for (const rank of await page.locator('.coinche-player-panel [data-rank-family]').all()) {
      const box = (await rank.boundingBox())!, panel = (await rank.locator('xpath=ancestor::*[contains(@class,"coinche-player-panel")]').boundingBox())!;
      expect(box.y).toBeGreaterThanOrEqual(panel.y); expect(box.y + box.height).toBeLessThanOrEqual(panel.y + panel.height);
    }
    await capotAndSuits(page);
    for (const button of await page.locator(".coinche-bidding-panel button:visible").all()) await target(page, button);
    await page.getByRole("button", { name: "Valeur 140" }).click();
    await page.getByRole("button", { name: "Atout Pique", exact: true }).click();
    await expect(page.getByRole("button", { name: "Valeur 140" })).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByRole("button", { name: "Atout Pique", exact: true })).toHaveAttribute("aria-pressed", "true");
    const panel = (await page.locator(".coinche-bidding-panel").boundingBox())!;
    const scene = (await page.locator(".coinche-game-scene").boundingBox())!;
    const hand = (await page.locator(".coinche-scene-hand-cards").boundingBox())!;
    expect(Math.abs(panel.x + panel.width / 2 - scene.x - scene.width / 2)).toBeLessThan(1);
    expect(Math.abs(panel.y + panel.height / 2 - (scene.y + 52 + hand.y) / 2)).toBeLessThanOrEqual(8);
    expect(panel.y + panel.height).toBeLessThanOrEqual(hand.y + 1);
    await page.screenshot({ path: `.playwright/validation/immersive-polish/${info.project.name}-${mode}-${viewport.width}-bidding.png` });
    const playing = mobileGameState("playing"); playing.trickPoints = { 0: 67, 1: 35 };
    playing.currentTrick.cards = [{ playerId: 2, card: playing.hands[2][0] }];
    fixture.setState(playing); await page.reload(); await expect(page.locator(".coinche-trick-card")).toHaveCount(1);
    await simulateSafeAreas(page, safe);
    const live = page.getByLabel("Points en direct", { exact: true });
    await expect(live).toContainText("Nous 67"); await expect(live).toContainText("Eux 35");
    await expectInsideSafeViewport(page, live, safe);
    const liveBox = (await live.boundingBox())!;
    expect(liveBox.x + liveBox.width / 2).toBeGreaterThan(scene.x + scene.width / 2);
    const lead = page.locator(".coinche-player-lead"); const name = lead.locator("..").locator(".coinche-player-name");
    const p = (await lead.boundingBox())!, n = (await name.boundingBox())!;
    expect(n.width).toBeGreaterThanOrEqual(12);
    expect(p.x).toBeGreaterThanOrEqual(n.x + n.width);
    expect(Math.abs(p.y + p.height / 2 - n.y - n.height / 2)).toBeLessThan(1);
    const card = page.locator(".coinche-scene-hand-card button").first(); await target(page, card);
    const handCard = (await card.boundingBox())!, trickCard = (await page.locator(".coinche-trick-card button").boundingBox())!;
    expect(handCard.height).toBeGreaterThanOrEqual(84); expect(handCard.height).toBeLessThan(124);
    expect(handCard.height / trickCard.height).toBeLessThan(1.15);
    await page.screenshot({ path: `.playwright/validation/immersive-polish/${info.project.name}-${mode}-${viewport.width}-playing.png` });
    for (const portrait of [{ width: 390, height: 844 }, { width: 430, height: 932 }]) {
      await page.setViewportSize(portrait); await expect(page.getByRole("heading", { name: "Tournez votre téléphone" })).toBeVisible();
      await page.setViewportSize(viewport); await expect(page.locator(".coinche-trick-card")).toHaveCount(1);
    }
    await expectNoPageHorizontalOverflow(page);
    expect(fixture.intents).toEqual([]);
  });
}

for (const viewport of sizes) test(`@mobile @immersive-polish stable seats and only new cards animate ${viewport.width}`, async ({ page }, info) => {
  await preferences(page, false); await page.setViewportSize(viewport);
  const state = mobileGameState("playing");
  state.currentTrick = { leaderId: 2, cards: [] };
  const fixture = await installMobileGameFixture(page, state);
  await page.goto(fixture.path); await expect(page.locator(".coinche-game-scene")).toBeVisible(); await simulateSafeAreas(page, safe);
  const panelHeights = await page.locator(".coinche-player-panel").evaluateAll(elements => elements.map(element => element.getBoundingClientRect().height));
  const placed: { id: number; box: NonNullable<Awaited<ReturnType<Locator["boundingBox"]>>>; node: Awaited<ReturnType<Locator["elementHandle"]>> }[] = [];
  for (const id of [2, 1, 3, 0] as const) {
    state.currentTrick.cards.push({ playerId: id, card: state.hands[id][0] }); fixture.setState({ ...state });
    // Presence refresh delivers the next projection into the mounted table, without navigation.
    await expect.poll(async () => {
      await page.evaluate(() => window.dispatchEvent(new Event("focus")));
      return page.locator('[data-trick-layer="current"] .coinche-trick-card').count();
    }).toBe(state.currentTrick.cards.length);
    expect(await page.locator(".coinche-player-panel").evaluateAll(elements => elements.map(element => element.getBoundingClientRect().height))).toEqual(panelHeights);
    const incoming = page.locator(`.coinche-trick-card[data-player-id="${id}"] button`);
    await expect(incoming).toHaveClass(/coinche-card-play-from-/);
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(resolve)));
    for (const old of placed) {
      const current = page.locator(`.coinche-trick-card[data-player-id="${old.id}"]`);
      expect(await current.evaluate((element, node) => element === node, old.node)).toBe(true);
      expect(await current.locator("button").evaluate(element => element.getAnimations().some(animation => animation.playState === "running"))).toBe(false);
      const box = (await current.boundingBox())!;
      expect(Math.abs(box.x - old.box.x)).toBeLessThan(.1); expect(Math.abs(box.y - old.box.y)).toBeLessThan(.1);
    }
    await incoming.evaluate(element => Promise.all(element.getAnimations().map(animation => animation.finished)));
    const current = page.locator(`.coinche-trick-card[data-player-id="${id}"]`);
    placed.push({ id, box: (await current.boundingBox())!, node: await current.elementHandle() });
  }
  const centers = placed.map(({ box }) => ({ x: box.x + box.width / 2, y: box.y + box.height / 2 }));
  expect(centers[0].y).toBeLessThan(centers[3].y); expect(centers[1].x).toBeGreaterThan(centers[2].x);
  const layer = page.locator('[data-trick-layer="current"]');
  expect(Number(await layer.evaluate(element => getComputedStyle(element).zIndex))).toBeGreaterThan(Number(await page.locator(".coinche-scene-hand").evaluate(element => getComputedStyle(element).zIndex)));
  for (const card of await layer.locator(".coinche-trick-card button").all()) await expectInsideSafeViewport(page, card, safe);
  await page.screenshot({ path: `.playwright/validation/immersive-polish/${info.project.name}-${viewport.width}-stable-trick4.png` });
});

for (const viewport of sizes) test(`@mobile @immersive-polish compact last trick and clean numbered cards ${viewport.width}`, async ({ page }, info) => {
  await preferences(page); await page.setViewportSize(viewport);
  const state = mobileGameState("playing");
  state.completedTricks = [{ leaderId: 2, winnerId: 0, points: 24, cards: ([2, 1, 3, 0] as const).map(playerId => ({ playerId, card: state.hands[playerId][0] })) }];
  await installMobileGameFixture(page, state); await page.goto("/solo"); await simulateSafeAreas(page, safe);
  const last = page.getByRole("button", { name: "Dernier pli", exact: true }); await target(page, last);
  const badge = (await last.locator("span").boundingBox())!;
  expect(badge.height).toBeLessThanOrEqual(28); expect(badge.width).toBeLessThanOrEqual(84);
  const south = (await page.locator(".coinche-bottom-seat").boundingBox())!;
  expect(badge.y + badge.height).toBeLessThanOrEqual(south.y - 4);
  await last.click(); const cards = page.getByLabel("Cartes du dernier pli", { exact: true });
  await expect(cards.locator(".coinche-trick-card")).toHaveCount(4);
  for (let order = 1; order <= 4; order++) {
    const card = cards.locator(`[data-play-order="${order}"]`);
    await expect(card.locator(":scope > span")).toHaveCount(1);
    await expect(card.getByLabel(`Carte ${order}`)).toBeVisible();
  }
  await target(page, page.getByRole("button", { name: "Fermer", exact: true }));
  await page.screenshot({ path: `.playwright/validation/immersive-polish/${info.project.name}-${viewport.width}-last-trick.png` });
});

for (const viewport of [{ width: 1024, height: 768 }, { width: 1440, height: 900 }]) test(`@mobile @immersive-polish desktop Capot follows 160 ${viewport.width}`, async ({ page }) => {
  await preferences(page); await installMobileGameFixture(page); await page.setViewportSize(viewport); await page.goto("/solo");
  await expect(page.locator(".coinche-bidding-panel")).toBeVisible();
  const value = (await page.getByRole("button", { name: "Valeur 160" }).boundingBox())!;
  const capot = (await page.getByRole("button", { name: "Capot", exact: true }).boundingBox())!;
  expect(Math.abs(capot.y - value.y)).toBeLessThan(1); expect(capot.x).toBeGreaterThanOrEqual(value.x + value.width);
  await expect(page.locator(".coinche-global-header")).toHaveCSS("height", "56px");
});

for (const viewport of sizes) test(`@mobile @immersive-polish Training shares bidding, live score and help ${viewport.width}`, async ({ page }) => {
  await installTrainingMobileFixture(page);
  await page.addInitScript(() => { Math.random = () => .1; });
  await page.setViewportSize(viewport); await page.goto("/training/game");
  await page.getByRole("button", { name: "Lancer la partie" }).click();
  await expect(page.locator(".coinche-bidding-panel")).toBeVisible(); await simulateSafeAreas(page, safe);
  await capotAndSuits(page);
  await expect(page.getByLabel("Points en direct", { exact: true })).toContainText("Nous 0");
  await expect(page.getByLabel("Points en direct", { exact: true })).toContainText("Eux 0");
  await target(page, page.getByRole("button", { name: "Aide de l’entraînement", exact: true }));
  await target(page, page.getByRole("button", { name: "Menu Partie", exact: true }));
  await target(page, page.getByRole("button", { name: "Quitter la table et revenir à l’accueil", exact: true }));
  await expectNoPageHorizontalOverflow(page);
});
