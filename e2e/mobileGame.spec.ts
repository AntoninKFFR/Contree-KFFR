import { expect, test, type Page } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { clonePlayerPreferences, PLAYER_PREFERENCES_STORAGE_KEY } from "../lib/preferences/playerPreferences";
import { installMobileGameFixture, mobileGameState } from "./helpers/mobileGameFixture";
import { gameGeometry } from "./helpers/gameGeometry";
import { expectHandTouchTarget, expectInsideSafeViewport, expectNoPageHorizontalOverflow, simulateSafeAreas, type SafeAreas } from "./helpers/mobile";

const viewports = [{width:568,height:320},{width:667,height:375},{width:844,height:390},{width:932,height:430}];
async function theme(page: Page, value: "dark" | "light") {
  const prefs = clonePlayerPreferences(); prefs.visual.theme = value;
  prefs.gameplay.autoCollectTricks = false;
  await page.addInitScript(({key,prefs}) => localStorage.setItem(key,JSON.stringify(prefs)),{key:PLAYER_PREFERENCES_STORAGE_KEY,prefs});
}
async function fits(page: Page, safe: SafeAreas) {
  await expectNoPageHorizontalOverflow(page);
  expect(await page.evaluate(()=>document.documentElement.scrollHeight-innerHeight)).toBeLessThanOrEqual(2);
  for (const selector of ['.coinche-player-panel','.coinche-table-hud','.coinche-scene-hand-card button','.coinche-bidding-panel button']) {
    for (const control of await page.locator(selector).all()) {
      if (selector.includes('hand-card')) { await expectHandTouchTarget(page,control,safe); continue; }
      await expectInsideSafeViewport(page,control,safe);
      if (selector.includes('button')) { const box=(await control.boundingBox())!; expect(box.width).toBeGreaterThanOrEqual(44); expect(box.height).toBeGreaterThanOrEqual(44); }
    }
  }
  const geometry=await gameGeometry(page);
  const panels=geometry.players.filter(box=>box!==null);
  for(let i=0;i<panels.length;i++) for(let j=i+1;j<panels.length;j++) {
    const a=panels[i]!,b=panels[j]!;
    expect(Math.min(a.x+a.width,b.x+b.width)-Math.max(a.x,b.x)<=.5 || Math.min(a.y+a.height,b.y+b.height)-Math.max(a.y,b.y)<=.5,`players ${i}/${j} do not overlap`).toBe(true);
  }
  const controls=geometry.biddingControls.filter((box)=>box!==null);
  for(let i=0;i<controls.length;i++) for(let j=i+1;j<controls.length;j++) {
    const a=controls[i]!,b=controls[j]!;
    expect(Math.min(a.x+a.width,b.x+b.width)-Math.max(a.x,b.x)<=.5 || Math.min(a.y+a.height,b.y+b.height)-Math.max(a.y,b.y)<=.5,`bidding controls ${i}/${j} do not overlap`).toBe(true);
  }
  const cards=geometry.cards.filter(box=>box!==null);
  for(let i=1;i<cards.length;i++) expect(cards[i]!.x-cards[i-1]!.x).toBeGreaterThanOrEqual(44);
  if(geometry.bidding && geometry.hand) expect(geometry.bidding.y+geometry.bidding.height).toBeLessThanOrEqual(geometry.hand.y+1);
}
for (const value of ["dark","light"] as const) for(const viewport of viewports) for(const mode of ["solo","multi"] as const) {
  test(`@mobile @game-mobile ${value} ${mode} ${viewport.width} bidding and playing`,async({page},info)=>{
    await theme(page,value); await page.setViewportSize(viewport);
    const fixture=await installMobileGameFixture(page);
    const path=mode==='solo'?'/solo':fixture.path;
    await page.goto(path); await expect(page.locator('.coinche-bidding-panel')).toBeVisible();
    await expect(page.locator('.coinche-player-name[title]')).toHaveCount(4);
    if (mode === 'multi') {
      await expect(page.getByRole('timer')).toBeVisible();
      await expect(page.getByText('Hôte', {exact:true})).toBeVisible();
      await expect(page.getByText('Bot temporaire', {exact:true})).toBeVisible();
      await expect(page.locator('.coinche-player-panel [data-rank-family]')).toHaveCount(4);
    }
    await expect(page.locator('header[data-header-variant="compact-game"]')).toHaveCSS('height','0px');
    for(const left of [44,0]) for (const bottom of [21,34]) {
      const safe={top:0,left,right:left?0:44,bottom};
      await simulateSafeAreas(page,safe); await fits(page,safe);
    }
    const folder='.playwright/validation/game'; mkdirSync(folder,{recursive:true});
    await simulateSafeAreas(page,{top:0,left:44,right:0,bottom:34});
    writeFileSync(`${folder}/after-${info.project.name}-${mode}-${value}-${viewport.width}.json`,JSON.stringify(await gameGeometry(page),null,2));
    await page.screenshot({path:`${folder}/${info.project.name}-${mode}-${value}-${viewport.width}-bidding.png`});
    fixture.setState(mobileGameState('playing'));
    await page.reload(); await expect(page.locator('.coinche-game-scene')).toHaveAttribute('data-game-phase','playing');
    await simulateSafeAreas(page,{top:0,left:44,right:0,bottom:34}); await fits(page,{top:0,left:44,right:0,bottom:34});
    await page.screenshot({path:`${folder}/${info.project.name}-${mode}-${value}-${viewport.width}-playing.png`});
  });
}
