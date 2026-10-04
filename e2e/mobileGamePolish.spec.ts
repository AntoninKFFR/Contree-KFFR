import { expect, test, type Locator, type Page } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { installMobileGameFixture, mobileGameState } from "./helpers/mobileGameFixture";
import { expectHandTouchTarget, expectInsideSafeViewport, expectNoPageHorizontalOverflow, simulateSafeAreas } from "./helpers/mobile";
import { clonePlayerPreferences, PLAYER_PREFERENCES_STORAGE_KEY } from "../lib/preferences/playerPreferences";
import { installTrainingMobileFixture } from "./helpers/trainingMobileFixture";

const sizes = [{ width: 568, height: 320 }, { width: 667, height: 375 }, { width: 844, height: 390 }, { width: 932, height: 430 }];
const safe = { top: 8, left: 44, right: 0, bottom: 34 };
async function preferences(page: Page, reducedMotion = true) {
  const value = clonePlayerPreferences();
  value.visual.reducedMotion = reducedMotion;
  value.gameplay.autoCollectTricks = false;
  await page.addInitScript(({ key, value }) => { if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(value)); }, { key: PLAYER_PREFERENCES_STORAGE_KEY, value });
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
    const north = (await page.locator('.coinche-top-seat').boundingBox())!;
    expect(panel.y).toBeGreaterThanOrEqual(north.y + north.height + 14);
    expect(panel.y + panel.height).toBeLessThanOrEqual(hand.y + 1);
    if (mode === 'solo' && [568, 844].includes(viewport.width)) await page.screenshot({ path: `.playwright/validation/immersive-polish/${info.project.name}-${mode}-${viewport.width}-bidding.png` });
    const playing = mobileGameState("playing"); playing.trickPoints = { 0: 67, 1: 35 };
    playing.currentTrick.cards = [{ playerId: 2, card: playing.hands[2][0] }];
    fixture.setState(playing); await page.reload(); await expect(page.locator(".coinche-trick-card")).toHaveCount(1);
    await simulateSafeAreas(page, safe);
    const live = page.getByLabel("Points en direct", { exact: true });
    await expect(live).toContainText("Nous 67"); await expect(live).toContainText("Eux 35");
    await expectInsideSafeViewport(page, live, safe);
    const liveBox = (await live.boundingBox())!;
    expect(liveBox.x + liveBox.width / 2).toBeGreaterThan(scene.x + scene.width / 2);
    const lead = page.locator(".coinche-player-lead:not(.coinche-player-lead-placeholder)"); const name = lead.locator("..").locator(".coinche-player-name");
    const p = (await lead.boundingBox())!, n = (await name.boundingBox())!;
    expect(n.width).toBeGreaterThanOrEqual(12);
    expect(p.x).toBeGreaterThanOrEqual(n.x + n.width);
    expect(Math.abs(p.y + p.height / 2 - n.y - n.height / 2)).toBeLessThan(1);
    const card = page.locator(".coinche-scene-hand-card button").first(); await expectHandTouchTarget(page, card, safe);
    const handCard = (await card.boundingBox())!, trickCard = (await page.locator(".coinche-trick-card button").boundingBox())!;
    expect(handCard.height).toBeGreaterThanOrEqual(74); expect(handCard.height).toBeLessThan(110);
    expect(handCard.height / trickCard.height).toBeLessThan(1.15);
    if (mode === 'solo' && viewport.width === 568) await page.screenshot({ path: `.playwright/validation/immersive-polish/${info.project.name}-${mode}-${viewport.width}-playing.png` });
    for (const portrait of [{ width: 390, height: 844 }, { width: 430, height: 932 }]) {
      await page.setViewportSize(portrait); await expect(page.getByRole("heading", { name: "Tournez votre téléphone" })).toBeVisible();
      await page.setViewportSize(viewport); await expect(page.locator(".coinche-trick-card")).toHaveCount(1);
    }
    await expectNoPageHorizontalOverflow(page);
    expect(fixture.intents).toEqual([]);
  });
}

for (const viewport of sizes) test(`@mobile @immersive-polish fixed cardinal seats and aligned announcements ${viewport.width}`, async ({ page }) => {
  await preferences(page); await page.setViewportSize(viewport);
  const fixture = await installMobileGameFixture(page, mobileGameState("playing"));
  await page.goto(fixture.path); await expect(page.locator('.coinche-game-scene')).toHaveAttribute('data-game-phase', 'playing');
  await simulateSafeAreas(page, safe);
  // Wait for the viewport observer to apply the simulated insets before recording positions.
  await expect.poll(async () => (await page.locator('.coinche-game-scene').boundingBox())!.height).toBe(viewport.height - safe.top - safe.bottom);
  const seats = page.locator('.coinche-player-panel');
  const boxes = () => seats.evaluateAll(elements => elements.map(element => {
    const { x, y, width, height } = element.getBoundingClientRect();
    return { x, y, width, height };
  }));
  const before = await boxes(), scene = (await page.locator('.coinche-game-scene').boundingBox())!;
  expect(before).toHaveLength(4);
  for (const side of ['left', 'right']) {
    const box = (await page.locator(`.coinche-${side}-seat`).boundingBox())!;
    expect(Math.abs(box.y + box.height / 2 - scene.y - scene.height / 2)).toBeLessThan(1);
  }
  const namePositions = () => page.locator('.coinche-player-name').evaluateAll(elements => elements.map(element => {
    const { x, y } = element.getBoundingClientRect(); return { x, y };
  }));
  const beforeNames = await namePositions();
  const announcementsAligned = async () => {
    for (const side of ['top', 'left', 'right', 'bottom']) {
      const bubble = page.locator(`.coinche-bubble-${side}`);
      if (!await bubble.count()) continue;
      await expectInsideSafeViewport(page, bubble, safe);
      const box = (await bubble.boundingBox())!, seat = (await page.locator(`.coinche-${side}-seat .coinche-player-panel`).boundingBox())!;
      expect(Math.abs(box.x - seat.x)).toBeLessThanOrEqual(1);
      expect(Math.abs(box.width - seat.width)).toBeLessThanOrEqual(1);
      if (side === 'bottom') expect(box.y + box.height).toBeLessThanOrEqual(seat.y - 1);
      else expect(box.y).toBeGreaterThanOrEqual(seat.y + seat.height + 1);
    }
  };
  const bidding = mobileGameState();
  for (const announcements of [false, true]) {
    if (announcements) bidding.bids = [
      { playerId: 0, action: 'bid', value: 80, trump: 'hearts' }, { playerId: 1, action: 'pass' },
      { playerId: 2, action: 'bid', value: 90, trump: 'clubs' }, { playerId: 3, action: 'pass' },
    ];
    fixture.setState({ ...bidding });
    await expect.poll(async () => {
      await page.evaluate(() => window.dispatchEvent(new Event('focus')));
      return await page.locator('.coinche-game-scene').getAttribute('data-game-phase') === 'bidding'
        && await page.locator('[class*="coinche-bubble-"]').count() === (announcements ? 4 : 0);
    }).toBe(true);
    expect(await boxes()).toEqual(before);
    expect(await namePositions()).toEqual(beforeNames);
    await expect(page.locator('.coinche-bidding-panel')).toBeVisible();
    await announcementsAligned();
    for (const button of await page.locator('.coinche-bidding-panel button:visible').all()) await target(page, button);
  }
  for (const playerId of [0, 1, 2, 3] as const) {
    const playing = mobileGameState('playing');
    playing.contract!.playerId = playerId; playing.currentPlayerId = playerId;
    playing.contract!.status = playerId === 1 ? 'coinched' : playerId === 2 ? 'surcoinched' : 'normal';
    fixture.setState(playing);
    await expect.poll(async () => {
      await page.evaluate(() => window.dispatchEvent(new Event('focus')));
      return await page.locator('.coinche-game-scene').getAttribute('data-game-phase') === 'playing'
        && await page.locator(`.coinche-player-panel[data-player-id="${playerId}"]`).getAttribute('aria-current') === 'true';
    }).toBe(true);
    expect(await boxes()).toEqual(before);
    expect(await namePositions()).toEqual(beforeNames);
    await announcementsAligned();
  }
  expect(fixture.intents).toEqual([]);
});

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
  const scene = (await page.locator(".coinche-game-scene").boundingBox())!;
  const north = (await page.locator(".coinche-top-seat").boundingBox())!;
  const south = (await page.locator(".coinche-bottom-seat").boundingBox())!;
  const west = (await page.locator(".coinche-left-seat").boundingBox())!;
  const east = (await page.locator(".coinche-right-seat").boundingBox())!;
  expect(Math.abs(north.x + north.width / 2 - scene.x - scene.width / 2)).toBeLessThan(1);
  expect(north.y + north.height).toBeLessThan(west.y);
  expect(Math.abs(west.y + west.height / 2 - east.y - east.height / 2)).toBeLessThan(1);
  expect(south.x - scene.x).toBeLessThanOrEqual(8);
  expect(south.y).toBeGreaterThan(west.y + west.height);
  expect(west.x - scene.x).toBeLessThanOrEqual(8);
  expect(scene.x + scene.width - east.x - east.width).toBeLessThanOrEqual(8);
  const topCard = (await layer.locator('.coinche-trick-card--top').boundingBox())!;
  expect(topCard.y - north.y - north.height).toBeGreaterThanOrEqual(8);
  const cards = page.locator('.coinche-scene-hand-card button');
  for (const card of await cards.all()) await expectHandTouchTarget(page, card, safe);
  const fan = await page.locator('.coinche-scene-hand-card').evaluateAll(elements => elements.map(element => ({
    angle: Math.atan2(new DOMMatrix(getComputedStyle(element).transform).b, new DOMMatrix(getComputedStyle(element).transform).a) * 180 / Math.PI,
    top: element.getBoundingClientRect().top, bottom: element.getBoundingClientRect().bottom,
  })));
  expect(fan[0].angle).toBeLessThan(-8); expect(fan.at(-1)!.angle).toBeGreaterThan(8);
  expect(fan[0].top).toBeGreaterThan(fan[3].top + 1);
  for (const card of fan) expect(card.bottom).toBeGreaterThan(scene.y + scene.height + 8);
  const folder = '.playwright/validation/cardinal'; mkdirSync(folder, { recursive: true });
  writeFileSync(`${folder}/${info.project.name}-${viewport.width}.json`, JSON.stringify({
    scene, north, south, west, east, fan,
    handHeight: await cards.first().evaluate(element => (element as HTMLElement).offsetHeight),
    trickHeight: await layer.locator('button').first().evaluate(element => (element as HTMLElement).offsetHeight),
  }, null, 2));
  if (viewport.width === 844) await page.screenshot({ path: `.playwright/validation/immersive-polish/${info.project.name}-${viewport.width}-stable-trick4.png` });
});

for (const viewport of sizes) test(`@mobile @immersive-polish compact clipped fan 8 to 1 and both notches ${viewport.width}`, async ({ page }, info) => {
  await preferences(page); await page.setViewportSize(viewport);
  const fixture = await installMobileGameFixture(page, mobileGameState('playing'));
  await page.goto(fixture.path); await expect(page.locator('.coinche-game-scene')).toBeVisible();
  for (const left of [44, 0]) {
    const insets = { ...safe, left, right: left ? 0 : 44 };
    await simulateSafeAreas(page, insets);
    await expect.poll(async () => (await page.locator('.coinche-game-scene').boundingBox())!.x).toBe(left);
    for (let count = 8; count >= 1; count--) {
      const state = mobileGameState('playing'); state.hands[0] = state.hands[0].slice(0, count); fixture.setState(state);
      await expect.poll(async () => {
        await page.evaluate(() => window.dispatchEvent(new Event('focus')));
        return page.locator('.coinche-scene-hand-card').count();
      }).toBe(count);
      const cards = page.locator('.coinche-scene-hand-card button');
      for (const card of await cards.all()) await expectHandTouchTarget(page, card, insets);
      const scene = (await page.locator('.coinche-game-scene').boundingBox())!;
      const fan = await cards.evaluateAll(elements => elements.map(element => {
        const { x, y, width, height } = element.getBoundingClientRect(); return { x, y, width, height };
      }));
      const start = Math.min(...fan.map(box => box.x)), end = Math.max(...fan.map(box => box.x + box.width));
      expect(end - start).toBeLessThanOrEqual(415);
      expect(Math.abs((start + end) / 2 - scene.x - scene.width / 2 - 10)).toBeLessThanOrEqual(2);
      for (const box of fan) {
        expect(box.x).toBeGreaterThanOrEqual(insets.left);
        expect(box.x + box.width).toBeLessThanOrEqual(viewport.width - insets.right);
        expect(box.y + box.height).toBeGreaterThanOrEqual(scene.y + scene.height + 20);
      }
      if (viewport.width === 844 && left === 44 && count === 8) await page.screenshot({ path: `.playwright/validation/immersive-polish/${info.project.name}-844-playing-compact-fan.png` });
    }
  }
  expect(fixture.intents).toEqual([]);
});

test.describe('mobile touch presentation', () => {
  test.use({ hasTouch: true });
  for (const viewport of [sizes[0], sizes[2]]) for (const mode of ['solo', 'multi'] as const) test(`@mobile @immersive-polish ${mode} out-of-turn taps keep the fan still ${viewport.width}`, async ({ page }) => {
    await preferences(page, false); await page.setViewportSize(viewport);
    const state = mobileGameState('playing'); state.currentPlayerId = 1;
    const fixture = await installMobileGameFixture(page, state);
    await page.goto(mode === 'solo' ? '/solo' : fixture.path); await simulateSafeAreas(page, safe);
    const cards = page.locator('.coinche-scene-hand-card button'); await expect(cards).toHaveCount(8);
    await cards.evaluateAll(elements => Promise.all(elements.flatMap(element => element.getAnimations().map(animation => animation.finished))));
    const presentation = () => cards.evaluateAll(elements => elements.map(element => {
      const box = element.getBoundingClientRect(), parent = element.parentElement!;
      return { x: box.x, y: box.y, transform: getComputedStyle(parent).transform, translate: getComputedStyle(element).translate, scale: getComputedStyle(element).scale };
    }));
    const initial = await presentation();
    for (const position of [0, 3, 7]) {
      await expectHandTouchTarget(page, cards.nth(position), safe);
      const point = await cards.nth(position).evaluate(element => {
        const box = element.getBoundingClientRect(), table = element.closest('.coinche-game-scene')!.getBoundingClientRect();
        for (let y = box.top + 3; y < Math.min(box.bottom, table.bottom); y += 4) for (let x = box.left + 3; x < box.right; x += 4) {
          if (element.contains(document.elementFromPoint(x, y))) return { x, y };
        }
        throw new Error('No visible hit point');
      });
      await page.touchscreen.tap(point.x, point.y);
      expect(await presentation()).toEqual(initial);
    }
    await page.waitForTimeout(350);
    expect(await presentation()).toEqual(initial);
    expect(fixture.intents).toEqual([]);
  });
});

for (const mode of ['solo', 'multi'] as const) test(`@mobile @immersive-polish ${mode} audio inside burger persists and restores keyboard focus`, async ({ page }) => {
  await preferences(page); await page.setViewportSize(sizes[0]);
  const fixture = await installMobileGameFixture(page);
  await page.goto(mode === 'solo' ? '/solo' : fixture.path); await expect(page.locator('.coinche-game-scene')).toBeVisible(); await simulateSafeAreas(page, safe);
  await expect(page.locator('.coinche-header-audio')).toBeHidden();
  await expect(page.locator('.coinche-game-burger')).toBeVisible();
  const burger = page.getByRole('button', { name: 'Ouvrir le menu', exact: true }); await target(page, burger);
  await burger.focus(); await page.keyboard.press('Enter');
  const menu = page.getByRole('complementary', { name: 'Menu de partie' }); await expectInsideSafeViewport(page, menu, safe);
  const audio = menu.getByRole('button', { name: 'Contrôles audio' }); await audio.focus(); await page.keyboard.press('Enter');
  const player = menu.getByRole('region', { name: 'Lecteur audio' }); await expect(player).toBeVisible();
  for (const button of await player.getByRole('button').all()) { await button.scrollIntoViewIfNeeded(); await target(page, button); }
  const volume = player.getByRole('slider', { name: 'Volume musique' });
  await volume.focus(); await volume.press('Home'); await volume.press('ArrowRight'); await expect(volume).toHaveValue('1');
  await expect.poll(() => page.evaluate(key => JSON.parse(localStorage.getItem(key)!).audio.musicVolume, PLAYER_PREFERENCES_STORAGE_KEY)).toBe(.01);
  await page.keyboard.press('Escape'); await expect(menu).toHaveCount(0); await expect(burger).toBeFocused();
  await page.reload(); await expect(page.locator('.coinche-game-scene')).toBeVisible(); await simulateSafeAreas(page, safe); await burger.click(); await audio.click(); await expect(volume).toHaveValue('1');
  await player.getByRole('button', { name: 'Lire la musique' }).click();
  await expect.poll(() => page.evaluate(key => JSON.parse(localStorage.getItem(key)!).audio.musicEnabled, PLAYER_PREFERENCES_STORAGE_KEY)).toBe(true);
});

for (const viewport of sizes) test(`@mobile @immersive-polish compact last trick and clean numbered cards ${viewport.width}`, async ({ page }) => {
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
});

for (const viewport of [{ width: 1024, height: 768 }, { width: 1440, height: 900 }]) test(`@mobile @immersive-polish desktop Capot follows 160 ${viewport.width}`, async ({ page }) => {
  await preferences(page); await installMobileGameFixture(page); await page.setViewportSize(viewport); await page.goto("/solo");
  await expect(page.locator(".coinche-bidding-panel")).toBeVisible();
  const value = (await page.getByRole("button", { name: "Valeur 160" }).boundingBox())!;
  const capot = (await page.getByRole("button", { name: "Capot", exact: true }).boundingBox())!;
  expect(Math.abs(capot.y - value.y)).toBeLessThan(1); expect(capot.x).toBeGreaterThanOrEqual(value.x + value.width);
  await expect(page.locator(".coinche-global-header")).toHaveCSS("height", "56px");
  const scene = (await page.locator('.coinche-game-scene').boundingBox())!;
  for (const card of await page.locator('.coinche-scene-hand-card button').all()) {
    const box = (await card.boundingBox())!;
    expect(box.y + box.height).toBeLessThanOrEqual(scene.y + scene.height);
  }
  const angle = await page.locator('.coinche-scene-hand-card').first().evaluate(element => {
    const matrix = new DOMMatrix(getComputedStyle(element).transform);
    return Math.atan2(matrix.b, matrix.a) * 180 / Math.PI;
  });
  expect(angle).toBeCloseTo(-6.3, 1);
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
