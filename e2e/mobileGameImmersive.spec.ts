import { expect, test, type Page, type Locator } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { installMobileGameFixture, mobileGameState } from "./helpers/mobileGameFixture";
import { gameGeometry } from "./helpers/gameGeometry";
import { expectHandTouchTarget, expectInsideSafeViewport, expectNoPageHorizontalOverflow, simulateSafeAreas } from "./helpers/mobile";
import { clonePlayerPreferences, PLAYER_PREFERENCES_STORAGE_KEY } from "../lib/preferences/playerPreferences";
import { installTrainingMobileFixture } from "./helpers/trainingMobileFixture";
import { openFirstTrainingQuestion } from "./helpers/trainingGame";

const sizes = [{width:568,height:320},{width:667,height:375},{width:844,height:390},{width:932,height:430}];
const safe = {top:8,left:44,right:0,bottom:34};
async function target(page: Page, control: Locator) {
  await expectInsideSafeViewport(page, control, safe);
  const box = (await control.boundingBox())!;
  // DOMRect subtraction can round a CSS 44px edge down by 1/65536px.
  expect(box.width + .001).toBeGreaterThanOrEqual(44); expect(box.height + .001).toBeGreaterThanOrEqual(44);
}
async function snapshot(page: Page, name: string, project: string) {
  const dir = `.playwright/validation/immersive-v2/after/${project}`; mkdirSync(dir,{recursive:true});
  writeFileSync(`${dir}/${name}.json`,JSON.stringify(await gameGeometry(page),null,2));
  await page.screenshot({path:`${dir}/${name}.png`});
}
for (const mode of ['solo','multi'] as const) for (const viewport of sizes) test(`@mobile @immersive-v2 ${mode} proportions and useful controls ${viewport.width}`,async({page},info)=>{
  const prefs=clonePlayerPreferences(); prefs.visual.theme=mode==='solo'?'dark':'light'; prefs.visual.reducedMotion=true;
  await page.addInitScript(({key,prefs})=>localStorage.setItem(key,JSON.stringify(prefs)),{key:PLAYER_PREFERENCES_STORAGE_KEY,prefs});
  await page.setViewportSize(viewport); const fixture=await installMobileGameFixture(page);
  const path=mode==='solo'?'/solo':fixture.path;
  await page.goto(path); await expect(page.locator('.coinche-bidding-panel')).toBeVisible(); await simulateSafeAreas(page,safe);
  await expect(page.locator('.coinche-header-logo')).toBeHidden(); await expect(page.locator('.coinche-global-header')).toHaveCSS('height','0px');
  const exit=page.getByRole('button',{name:'Quitter la table et revenir à l’accueil'}), menu=page.getByRole('button',{name:'Menu Partie'});
  await target(page,exit); await target(page,menu);
  await snapshot(page,`${mode}-${viewport.width}-bidding`,info.project.name);
  for(const count of [8,5,4,3,1]) {
    const state=mobileGameState('playing'); state.hands[0]=state.hands[0].slice(0,count);
    fixture.setState(state); await page.reload(); await expect(page.locator('.coinche-scene-hand-card')).toHaveCount(count); await simulateSafeAreas(page,safe);
    const cards=page.locator('.coinche-scene-hand-card button');
    for(const card of await cards.all()) { await expectHandTouchTarget(page,card,safe); expect((await card.boundingBox())!.height).toBeGreaterThanOrEqual(74); }
    await snapshot(page,`${mode}-${viewport.width}-hand${count}`,info.project.name);
  }
  for(const count of [1,2,3,4]) {
    const state=mobileGameState('playing'); state.currentTrick.cards=([0,1,2,3] as const).slice(0,count).map(playerId=>({playerId,card:state.hands[playerId][0]}));
    fixture.setState(state);await page.reload();await expect(page.locator('.coinche-trick-card')).toHaveCount(count);await simulateSafeAreas(page,safe);
    const hand=(await page.locator('.coinche-scene-hand-cards').boundingBox())!;
    for(const card of await page.locator('.coinche-trick-card button').all()) {
      await expectInsideSafeViewport(page,card,safe);const box=(await card.boundingBox())!;
      expect(box.height).toBeGreaterThanOrEqual(72);expect(box.y+box.height).toBeLessThanOrEqual(hand.y);
    }
    await snapshot(page,`${mode}-${viewport.width}-trick${count}`,info.project.name);
  }
  await menu.click(); await expect(menu).toHaveAttribute('aria-expanded','true');
  await expect(page.getByRole('complementary',{name:'Menu de partie'})).toBeVisible(); await page.keyboard.press('Escape');await expect(menu).toBeFocused();
  await exit.click();const dialog=page.getByRole('dialog',{name:'Revenir à l’accueil ?'});await expect(dialog).toBeVisible();await page.keyboard.press('Escape');await expect(exit).toBeFocused();
  expect(fixture.intents).toEqual([]);
  await expectNoPageHorizontalOverflow(page);
  await exit.click();await dialog.getByRole('button',{name:'Revenir à l’accueil',exact:true}).click();await expect(page).toHaveURL(/\/$/);
  expect(fixture.intents).toEqual([]);
});
for (const viewport of sizes) test(`@mobile @immersive-v2 Training help, rotation and exit ${viewport.width}`,async({page},info)=>{
  await installTrainingMobileFixture(page);await page.addInitScript(()=>{Math.random=()=>.1;});await page.setViewportSize(viewport);await page.goto('/training/game');
  await page.getByRole('button',{name:'Lancer la partie'}).click();await expect(page.locator('.coinche-bidding-panel')).toBeVisible();await simulateSafeAreas(page,safe);
  const help=page.getByRole('button',{name:'Aide de l’entraînement',exact:true});await target(page,help);await snapshot(page,`training-${viewport.width}-bidding`,info.project.name);
  const before=await page.locator('.coinche-game-scene').getAttribute('data-game-state-key');
  await help.click();const dialog=page.getByRole('dialog',{name:'Aide de l’entraînement'});await expect(dialog.getByLabel('Aide des valeurs des cartes')).toBeVisible();
  await expectInsideSafeViewport(page,dialog.locator('.coinche-dialog'),safe);await page.keyboard.press('Escape');await expect(help).toBeFocused();
  for(const portrait of [{width:390,height:844},{width:430,height:932}]) {
    await page.setViewportSize(portrait);await expect(page.getByRole('heading',{name:'Tournez votre téléphone'})).toBeVisible();
    await page.setViewportSize(viewport);await expect(page.locator('.coinche-game-scene')).toHaveAttribute('data-game-state-key',before!);
  }
  await page.getByRole('button',{name:'Menu Partie'}).click();await page.getByRole('complementary',{name:'Menu de partie'}).getByRole('button',{name:'Aide de l’entraînement'}).click();await expect(dialog).toBeVisible();await page.keyboard.press('Escape');
  await page.getByRole('button',{name:'Quitter la table et revenir à l’accueil'}).click();await page.getByRole('button',{name:'Revenir à l’accueil',exact:true}).click();await expect(page).toHaveURL(/\/$/);
});
for (const viewport of sizes) test(`@mobile @immersive-v2 round result and details ${viewport.width}`,async({page},info)=>{
  const state=mobileGameState('playing');state.phase='finished';state.roundScore={0:250,1:0};state.result={kind:'played',contract:state.contract!,takerPoints:110,defenderPoints:52,trickPointsByTeam:{0:110,1:52},totalPointsByTeam:{0:110,1:52},announcementPointsByTeam:{0:0,1:0},belotePointsByTeam:{0:0,1:0},capotTeam:null,contractSucceeded:true,scoringMode:'ffb',multiplier:1,roundScore:state.roundScore};
  await installMobileGameFixture(page,state);await page.setViewportSize(viewport);await page.goto('/solo');await simulateSafeAreas(page,safe);
  const result=page.getByLabel('Résultat de la manche',{exact:true});await expectInsideSafeViewport(page,result,safe);
  await target(page,result.getByRole('button',{name:'Manche suivante'}));await target(page,result.locator('summary'));await result.locator('summary').click();await expect(result.getByText('Points de plis : 110 — 52')).toBeVisible();
  await expectNoPageHorizontalOverflow(page);await snapshot(page,`result-${viewport.width}`,info.project.name);
});

test('@mobile @immersive-v2 Training last trick stays clear of the contract after a real question',async({page})=>{
  test.setTimeout(90_000);
  await installTrainingMobileFixture(page);
  const {dialog}=await openFirstTrainingQuestion(page);
  await page.setViewportSize(sizes[0]);await simulateSafeAreas(page,safe);
  await dialog.getByRole('textbox',{name:'Ta réponse en points'}).fill('0');
  await dialog.getByRole('button',{name:'Valider',exact:true}).click();
  await dialog.getByRole('button',{name:'Reprendre la partie'}).click();
  for (const card of await page.locator('.coinche-scene-hand-card button').all()) await expectHandTouchTarget(page,card,safe);
  const scene = (await page.locator('.coinche-game-scene').boundingBox())!;
  const north = (await page.locator('.coinche-top-seat').boundingBox())!;
  const south = (await page.locator('.coinche-bottom-seat').boundingBox())!;
  expect(Math.abs(north.x + north.width / 2 - scene.x - scene.width / 2)).toBeLessThan(1);
  expect(south.x - scene.x).toBeLessThanOrEqual(8);
  const last=page.getByRole('button',{name:'Dernier pli',exact:true});await target(page,last);
  const button=(await last.boundingBox())!;
  const contract=(await page.locator('.coinche-bubble-bottom').boundingBox())!;
  expect(Math.min(button.x+button.width,contract.x+contract.width)-Math.max(button.x,contract.x)<=0
    || Math.min(button.y+button.height,contract.y+contract.height)-Math.max(button.y,contract.y)<=0).toBe(true);
  await last.click();await expect(page.getByLabel('Dernier pli',{exact:true})).toBeVisible();
  await page.getByLabel('Dernier pli',{exact:true}).getByRole('button',{name:'Fermer'}).click();
  await expect(last).toBeVisible();
});
