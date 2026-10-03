import { expect, test } from "@playwright/test";
import { clonePlayerPreferences, PLAYER_PREFERENCES_STORAGE_KEY } from "../lib/preferences/playerPreferences";
import { installMobileGameFixture, mobileGameState } from "./helpers/mobileGameFixture";
import { expectInsideSafeViewport, simulateSafeAreas } from "./helpers/mobile";

const safe = { top: 0, left: 44, right: 0, bottom: 34 };

for (const viewport of [{width:568,height:320}, {width:667,height:375}, {width:844,height:390}]) test(`@mobile @game-mobile inactive player and long contract HUD clear of seats ${viewport.width}`, async ({page}) => {
  const state = mobileGameState('playing');
  state.contract = {playerId:0, teamId:0, kind:'generale', value:500, trump:'hearts', status:'surcoinched'};
  state.totalScore = {0:1980, 1:1490};
  const fixture = await installMobileGameFixture(page, state);
  await page.setViewportSize(viewport); await page.goto(fixture.path); await simulateSafeAreas(page, safe);
  const hud = page.locator('.coinche-table-hud'); await expectInsideSafeViewport(page, hud, safe);
  await expect(hud).toContainText('ne joue pas cette donne');
  await expect(page.locator('.coinche-hud-contract')).toHaveAttribute('title', /Surcoinché/);
  const box = (await hud.boundingBox())!;
  for (const panel of await page.locator('.coinche-player-panel').all()) {
    const seat = (await panel.boundingBox())!;
    expect(Math.min(box.x+box.width,seat.x+seat.width)-Math.max(box.x,seat.x)<=.5 || Math.min(box.y+box.height,seat.y+seat.height)-Math.max(box.y,seat.y)<=.5, 'HUD clear of player').toBe(true);
  }
});

test('@mobile @game-mobile Capot, Coinche, Surcoinche and Passe bubbles preserve controls', async ({page}) => {
  const state = mobileGameState();
  state.bids = [{playerId:0, action:'capot', trump:'hearts'}, {playerId:1, action:'coinche'}, {playerId:2, action:'surcoinche'}, {playerId:3, action:'pass'}];
  await installMobileGameFixture(page, state); await page.setViewportSize({width:568, height:320}); await page.goto('/solo');
  await simulateSafeAreas(page, safe);
  const bubbles = page.locator('[class*="coinche-bubble-"]'); await expect(bubbles).toHaveCount(4);
  for (const bubble of await bubbles.all()) {
    await expectInsideSafeViewport(page, bubble, safe);
    const box = (await bubble.boundingBox())!;
    for (const button of await page.locator('.coinche-bidding-panel button').all()) {
      const control = (await button.boundingBox())!;
      expect(Math.min(box.x+box.width,control.x+control.width)-Math.max(box.x,control.x)<=.5 || Math.min(box.y+box.height,control.y+control.height)-Math.max(box.y,control.y)<=.5).toBe(true);
    }
  }
});

for (const kind of ['max', 'capot', 'generale', 'coinched'] as const) {
  test(`@mobile @game-mobile empty numeric values ${kind} remain usable`, async ({ page }) => {
    const state = mobileGameState();
    state.bids = kind === 'coinched'
      ? [{playerId:0, action:'bid', value:90, trump:'hearts'}, {playerId:1, action:'coinche'}]
      : kind === 'max' ? [{playerId:1, action:'bid', value:160, trump:'hearts'}]
      : kind === 'capot' ? [{playerId:1, action:'capot', trump:'hearts'}]
      : [{playerId:1, action:'generale', value:500, trump:'hearts'}];
    await installMobileGameFixture(page, state);
    await page.setViewportSize({width:568, height:320}); await page.goto('/solo');
    await simulateSafeAreas(page, safe);
    await expect(page.getByRole('button', {name:/Valeur /})).toHaveCount(0);
    await expect(page.getByRole('button', {name:'Annoncer', exact:true})).toBeDisabled();
    const pass = page.getByRole('button', {name:'Passer', exact:true});
    await expect(pass).toBeEnabled(); await expectInsideSafeViewport(page, pass, safe);
    for (const control of await page.locator('.coinche-bidding-panel button').all()) {
      await expectInsideSafeViewport(page, control, safe);
      expect((await control.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    }
  });
}

test('@mobile @game-mobile Multi preferences, host transfer, forfeit and menu focus', async ({page}) => {
  await page.setViewportSize({width:568, height:320});
  const fixture = await installMobileGameFixture(page); await page.goto(fixture.path);
  await simulateSafeAreas(page, safe);
  const trigger = page.getByRole('button', {name:'Menu Partie'});
  const menu = page.getByRole('complementary', {name:'Menu de partie'});
  await trigger.click(); await expectInsideSafeViewport(page, menu, safe);
  await page.keyboard.press('Escape'); await expect(trigger).toBeFocused();
  for (const [label, title] of [['Préférences', 'Préférences'], ['Transférer l’hôte', "Transférer l'hôte"], ['Abandonner la partie', 'Abandonner la partie ?']]) {
    await trigger.click(); await menu.getByRole('button', {name:label, exact:true}).click();
    const dialog = page.getByRole('dialog', {name:title, exact:true});
    await expectInsideSafeViewport(page, dialog.locator('.coinche-dialog'), safe);
    if (title === "Transférer l'hôte") {
      await dialog.getByRole('button', {name:'B'.repeat(40), exact:true}).click();
      await expectInsideSafeViewport(page, dialog.getByRole('button', {name:/Confirmer pour/}), safe);
    }
    if (title === 'Abandonner la partie ?') await expectInsideSafeViewport(page, dialog.getByRole('button', {name:'Continuer la partie'}), safe);
    await page.keyboard.press('Escape'); await expect(dialog).toHaveCount(0);
  }
  expect(fixture.intents).toEqual([]);
});

for (const mode of ['solo','multi'] as const) test(`@mobile @game-mobile ${mode} game over restores default chrome`, async ({page}) => {
  const state = mobileGameState('playing'); state.phase = 'game-over';
  const fixture = await installMobileGameFixture(page, state);
  await page.setViewportSize({width:568, height:320}); await page.goto(mode === 'solo' ? '/solo' : fixture.path);
  await expect(page.locator('.coinche-global-header')).toHaveAttribute('data-header-variant','default');
  await expect(page.locator('.coinche-global-header')).toHaveCSS('height','56px');
  if (mode === 'solo') {
    const result = page.getByLabel('Résultat de la manche', {exact:true});
    await expect(result).toBeVisible(); await expect(result.getByRole('button', {name:'Nouvelle partie'})).toBeInViewport();
  } else await expect(page.locator('.coinche-game-scene')).toHaveCount(0);
});

for (const theme of ['dark','light'] as const) test(`@mobile @game-mobile ${theme} Solo portrait and four-card trick captures`, async ({page}, info) => {
  const preferences = clonePlayerPreferences(); preferences.visual.theme = theme;
  await page.addInitScript(({key, preferences}) => localStorage.setItem(key, JSON.stringify(preferences)), {key:PLAYER_PREFERENCES_STORAGE_KEY, preferences});
  const state = mobileGameState('playing');
  state.currentTrick.cards = ([0,1,2,3] as const).map(playerId => ({playerId, card:state.hands[playerId][0]}));
  await installMobileGameFixture(page, state);
  await page.setViewportSize({width:390, height:844}); await page.goto('/solo');
  await simulateSafeAreas(page, {top:47, left:0, right:0, bottom:34});
  await expect(page.getByRole('heading', {name:'Tournez votre téléphone'})).toBeVisible();
  await page.screenshot({path:`.playwright/validation/game/${info.project.name}-solo-${theme}-portrait.png`});
  await page.setViewportSize({width:568, height:320}); await simulateSafeAreas(page, safe);
  await expect(page.locator('[data-trick-layer="current"] .coinche-trick-card')).toHaveCount(4);
  await expect.poll(async () => {
    const hand = (await page.locator('.coinche-scene-hand-cards').boundingBox())!;
    return (await Promise.all((await page.locator('[data-trick-layer="current"] .coinche-trick-card button').all()).map(async card => {
      const box = (await card.boundingBox())!; return box.y + box.height <= hand.y;
    }))).every(Boolean);
  }).toBe(true);
  await page.screenshot({path:`.playwright/validation/game/${info.project.name}-solo-${theme}-568-trick4.png`});
});
