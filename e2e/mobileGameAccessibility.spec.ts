import { expect, test, type Page } from "@playwright/test";
import { clonePlayerPreferences, PLAYER_PREFERENCES_STORAGE_KEY } from "../lib/preferences/playerPreferences";
import { installMobileGameFixture, mobileGameState } from "./helpers/mobileGameFixture";
import { installMobileRoomFixture } from "./helpers/mobileRoomFixture";
import { IPHONE_UA, simulatePwaEnvironment } from "./helpers/pwa";
import { expectInsideSafeViewport, simulateSafeAreas } from "./helpers/mobile";
import { gameGeometry } from "./helpers/gameGeometry";

const safe={top:0,left:44,right:0,bottom:34};
async function assertButtons(page:Page) {
  for(const button of await page.locator('.coinche-bidding-panel button').all()) {
    await expectInsideSafeViewport(page,button,safe);
    const box=(await button.boundingBox())!;expect(box.height).toBeGreaterThanOrEqual(44);expect(box.width).toBeGreaterThanOrEqual(44);
  }
}
test('@mobile @game-mobile large text, contrast, reduced motion, focus mode and safe game dialogs',async({page})=>{
  test.setTimeout(60_000);
  const preferences=clonePlayerPreferences();
  preferences.visual.textSize='large'; preferences.visual.highContrast=true;preferences.visual.reducedMotion=true;preferences.cards.cardSize='large';
  await page.addInitScript(({key,preferences})=>localStorage.setItem(key,JSON.stringify(preferences)),{key:PLAYER_PREFERENCES_STORAGE_KEY,preferences});
  await page.setViewportSize({width:568,height:320}); await installMobileGameFixture(page);
  await page.goto('/solo'); await simulateSafeAreas(page,safe);await expect(page.locator('.coinche-bidding-panel')).toBeVisible();
  await expect(page.locator('body')).toHaveClass(/coinche-text-large/);await expect(page.locator('body')).toHaveClass(/coinche-high-contrast/);
  await assertButtons(page);await expect(page.locator('.coinche-scene-hand-card button').first()).toHaveCSS('animation-name','none');
  const trigger=page.getByRole('button',{name:'Menu Partie'});await trigger.click();
  const menu=page.getByRole('complementary',{name:'Menu de partie'});await expectInsideSafeViewport(page,menu,safe);
  await menu.getByRole('switch',{name:'Scores en direct'}).click();await expect(page.locator('.coinche-table-hud')).toBeVisible();
  await trigger.click();await menu.getByRole('button',{name:'Paramètres',exact:true}).click();
  const settings=page.getByRole('dialog',{name:'Paramètres',exact:true});await expectInsideSafeViewport(page,settings.locator('.coinche-dialog'),safe);
  await page.keyboard.press('Escape');await expect(settings).toHaveCount(0);
  await trigger.click();await menu.getByRole('button',{name:'Règles de la prochaine partie'}).click();
  const rules=page.getByRole('dialog',{name:'Règles de la prochaine partie',exact:true});await expectInsideSafeViewport(page,rules.locator('.coinche-dialog'),safe);
  await expectInsideSafeViewport(page,rules.getByRole('button',{name:'Appliquer et nouvelle partie'}),safe);
  await page.keyboard.press('Escape'); await trigger.click();await menu.getByRole('button',{name:'Abandonner et redistribuer'}).click();
  const abandon=page.getByRole('dialog',{name:'Abandonner la partie ?'});await expectInsideSafeViewport(page,abandon.locator('.coinche-dialog'),safe);
  await expectInsideSafeViewport(page,abandon.getByRole('button',{name:'Continuer la partie'}),safe);await page.keyboard.press('Escape');
  expect(await page.evaluate(()=>document.documentElement.scrollHeight-innerHeight)).toBeLessThanOrEqual(2);
});

test('@mobile @game-mobile reduced Safari geometry, resize, both notches and four announcement bubbles',async({page})=>{
  const state=mobileGameState();
  state.bids=[{playerId:0,action:'bid',value:80,trump:'hearts'},{playerId:1,action:'pass'},{playerId:2,action:'bid',value:90,trump:'clubs'},{playerId:3,action:'pass'}];
  await installMobileGameFixture(page,state);await page.setViewportSize({width:568,height:320});await page.goto('/solo');
  await expect(page.locator('.coinche-bidding-panel')).toBeVisible();
  for(const left of [44,0]) {
    const insets={top:0,bottom:21,left,right:left?0:44};await simulateSafeAreas(page,insets);
    await page.evaluate(()=>document.documentElement.style.setProperty('--viewport-dynamic','calc(100dvh - 20px)'));
    for(const bubble of await page.locator('[class*="coinche-bubble-"]').all()) await expectInsideSafeViewport(page,bubble,insets);
    for(const button of await page.locator('.coinche-bidding-panel button,.coinche-scene-hand-card button').all()) {
      await expectInsideSafeViewport(page,button,insets);const box=(await button.boundingBox())!;expect(box.height).toBeGreaterThanOrEqual(44);
    }
    const geometry=await gameGeometry(page);expect(geometry.bidding!.y+geometry.bidding!.height).toBeLessThanOrEqual(geometry.hand!.y+1);
    expect(geometry.overflow.x).toBeLessThanOrEqual(0);expect(geometry.overflow.y).toBeLessThanOrEqual(2);
  }
});

test('@mobile @game-mobile real anonymous Solo bids, rotates without reset and plays 8 to 7',async({page})=>{
  test.setTimeout(60_000);
  await simulatePwaEnvironment(page,{ua:IPHONE_UA,standalone:'ios'});await installMobileRoomFixture(page,{seedSession:false});
  const preferences=clonePlayerPreferences();preferences.gameplay.gameSpeed='custom';preferences.gameplay.biddingDelayMs=0;preferences.gameplay.botDelayMs=1000;
  await page.addInitScript(({key,preferences})=>{localStorage.setItem(key,JSON.stringify(preferences));Math.random=()=>.1;},{key:PLAYER_PREFERENCES_STORAGE_KEY,preferences});
  await page.setViewportSize({width:390,height:844});await page.goto('/solo');
  await expect(page.locator('.coinche-global-header')).toHaveAttribute('data-header-variant','default');
  await page.getByRole('button',{name:'Commencer la partie'}).click();await expect(page.getByRole('heading',{name:'Tournez votre téléphone'})).toBeVisible();
  await page.setViewportSize({width:844,height:390});await expect(page.locator('.coinche-bidding-panel')).toBeVisible();
  const gameId=await page.locator('main[data-game-id]').getAttribute('data-game-id');const stateKey=await page.locator('.coinche-game-scene').getAttribute('data-game-state-key');
  const hand=await page.locator('.coinche-scene-hand-card').allTextContents();
  await page.setViewportSize({width:390,height:844});await expect(page.getByRole('heading',{name:'Tournez votre téléphone'})).toBeVisible();
  await page.setViewportSize({width:568,height:320});await simulateSafeAreas(page,safe);await expect(page.locator('.coinche-bidding-panel')).toBeVisible();
  await expect(page.locator('main[data-game-id]')).toHaveAttribute('data-game-id',gameId!);await expect(page.locator('.coinche-game-scene')).toHaveAttribute('data-game-state-key',stateKey!);
  expect(await page.locator('.coinche-scene-hand-card').allTextContents()).toEqual(hand);
  await page.getByRole('button',{name:'Valeur 160'}).click();await page.getByRole('button',{name:'Annoncer',exact:true}).click();
  const legal=page.locator('.coinche-scene-hand-card button[data-playable="true"]:not([disabled])').first();
  await expect.poll(async()=>{const pass=page.getByRole('button',{name:'Passer',exact:true});if(await pass.isVisible().catch(()=>false)&&await pass.isEnabled()) await pass.click();return legal.isVisible().catch(()=>false);},{timeout:25_000}).toBe(true);
  await expect(page.locator('.coinche-scene-hand-card')).toHaveCount(8);await legal.click();await expect(page.locator('.coinche-scene-hand-card')).toHaveCount(7);
  expect(await page.evaluate(()=>document.documentElement.scrollHeight-innerHeight)).toBeLessThanOrEqual(2);
});
