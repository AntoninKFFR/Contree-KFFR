import { expect, test, type Page } from "@playwright/test";
import { installMobileGameFixture, mobileGameState } from "./helpers/mobileGameFixture";
import { expectHandTouchTarget, expectInsideSafeViewport, simulateSafeAreas, setMobileViewport } from "./helpers/mobile";
import { clonePlayerPreferences, PLAYER_PREFERENCES_STORAGE_KEY } from "../lib/preferences/playerPreferences";

const safe={top:0,left:44,right:0,bottom:34};
async function target(page:Page,control:ReturnType<Page['locator']>) {
  await expectInsideSafeViewport(page,control,safe); const box=(await control.boundingBox())!;
  expect(box.width).toBeGreaterThanOrEqual(44);expect(box.height).toBeGreaterThanOrEqual(44);
}
for(const mode of ['solo','multi'] as const) {
  test(`@mobile @game-mobile ${mode} rotation preserves identity, state and requests; Home restores chrome`,async({page},info)=>{
    const fixture=await installMobileGameFixture(page);
    await page.setViewportSize({width:390,height:844}); await page.goto(mode==='solo'?'/solo':fixture.path);
    const before=JSON.stringify(fixture.snapshot()); let hand:string[]=[];
    for(const viewport of [{width:390,height:844},{width:844,height:390},{width:390,height:844},{width:844,height:390}]) {
      await setMobileViewport(page,viewport);
      if(viewport.width===390) {
        const portraitSafe={top:47,bottom:34,left:0,right:0};await simulateSafeAreas(page,portraitSafe);
        await expect(page.getByRole('heading',{name:'Tournez votre téléphone'})).toBeVisible();
        await expect(page.getByText('Passez en mode paysage pour jouer confortablement à la contrée.')).toBeVisible();
        await expect(page.locator('.coinche-game-scene')).toHaveCount(0);
        await expectInsideSafeViewport(page,page.locator('.coinche-mobile-notice > div'),portraitSafe);
        expect(await page.evaluate(()=>document.documentElement.scrollHeight-innerHeight)).toBeLessThanOrEqual(2);
        await page.screenshot({path:`.playwright/validation/game/${info.project.name}-${mode}-portrait.png`});
      } else {
        await simulateSafeAreas(page,safe); await expect(page.locator('.coinche-game-scene')).toBeVisible();
        const next=await page.locator('.coinche-scene-hand-card').allTextContents();
        if(hand.length) expect(next).toEqual(hand); else hand=next;
      }
      expect(JSON.stringify(fixture.snapshot())).toBe(before);
      expect(fixture.intents).toEqual([]);
      await expect(page.locator('.coinche-global-header')).toHaveAttribute('data-header-variant','compact-game');
    }
    await page.getByRole('button',{name:'Quitter la table et revenir à l’accueil'}).click();
    await page.getByRole('button',{name:'Revenir à l’accueil',exact:true}).click();
    await expect(page.locator('.coinche-global-header')).toHaveAttribute('data-header-variant','default');
    await expect(page.locator('.coinche-global-header')).toHaveCSS('height','56px');
  });
}
for(const position of [0,3,7]) test(`@mobile @game-mobile actual hand click ${position} and counts 8 to 1`,async({page})=>{
  await page.setViewportSize({width:568,height:320});
  const initial=mobileGameState('playing'); const fixture=await installMobileGameFixture(page,initial);
  await page.goto('/solo');await simulateSafeAreas(page,safe);
  const buttons=page.locator('.coinche-scene-hand-card button');await expect(buttons).toHaveCount(8);
  await expectHandTouchTarget(page,buttons.nth(position),safe);
  await buttons.nth(position).focus(); await expectHandTouchTarget(page,buttons.nth(position),safe);
  await buttons.nth(position).click();
  await expect(buttons).toHaveCount(7);
  expect(fixture.intents.some(intent=>(intent as {type:string}).type==='play-card')).toBe(true);
  for(let count=7;count>=1;count--) {
    const state=mobileGameState('playing');state.hands[0]=state.hands[0].slice(0,count);fixture.setState(state);
    await page.reload();await simulateSafeAreas(page,safe); await expect(buttons).toHaveCount(count);
    for(const button of await buttons.all()) await expectHandTouchTarget(page,button,safe);
    const bounds=await page.locator('.coinche-scene-hand-cards').boundingBox();
    expect(Math.abs(bounds!.x+bounds!.width/2-(44+(568-44)/2+10))).toBeLessThanOrEqual(1);
  }
});

for(const action of ['Capot','Générale','Contrer','Surcontrer'] as const) test(`@mobile @game-mobile ${action} confirmation and focus at 568`,async({page})=>{
  await page.setViewportSize({width:568,height:320});
  const prefs=clonePlayerPreferences();prefs.gameplay.confirmGenerale=true;
  await page.addInitScript(({key,prefs})=>localStorage.setItem(key,JSON.stringify(prefs)),{key:PLAYER_PREFERENCES_STORAGE_KEY,prefs});
  const state=mobileGameState();
  if(action==='Contrer') state.bids=[{playerId:1,action:'bid',value:90,trump:'hearts'}];
  if(action==='Surcontrer') state.bids=[{playerId:0,action:'bid',value:90,trump:'hearts'},{playerId:1,action:'coinche'}];
  const fixture=await installMobileGameFixture(page,state);await page.goto('/solo');await simulateSafeAreas(page,safe);
  const trigger=page.getByRole('button',{name:action,exact:true}); await target(page,trigger);
  await trigger.click(); const dialog=page.getByRole('alertdialog'); await expectInsideSafeViewport(page,dialog,safe);
  await expect(page.locator('.coinche-bidding-layout')).toBeHidden();
  if (action === 'Surcontrer') await expect(page.locator('.coinche-bidding-empty')).toBeHidden();
  for(const name of ['Confirmer','Annuler']) await target(page,dialog.getByRole('button',{name}));
  await page.keyboard.press('Escape');await expect(dialog).toHaveCount(0);await expect(trigger).toBeFocused();
  await expect(page.locator('.coinche-bidding-layout')).toBeVisible();
  await trigger.click();await dialog.getByRole('button',{name:'Annuler'}).click();await expect(trigger).toBeFocused();
  await trigger.click();await dialog.getByRole('button',{name:'Confirmer'}).click();
  await expect.poll(()=>fixture.intents.length).toBe(1);
});

for (const viewport of [{width:568,height:320}, {width:667,height:375}, {width:844,height:390}]) test(`@mobile @game-mobile trick cards 1 to 4, manual collect and last-trick overlay ${viewport.width}`,async({page},info)=>{
  await page.setViewportSize(viewport);
  const state=mobileGameState('playing'); const fixture=await installMobileGameFixture(page,state);
  await page.goto(fixture.path); await expect(page.locator('.coinche-game-scene')).toBeVisible(); await simulateSafeAreas(page,safe);
  for(let count=1;count<=4;count++) {
    const next=mobileGameState('playing'); next.currentTrick.cards=([0,1,2,3] as const).slice(0,count).map(playerId=>({playerId,card:next.hands[playerId][0]}));
    fixture.setState(next);await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
    await expect(page.locator('[data-trick-layer="current"] .coinche-trick-card')).toHaveCount(count);
    for(const card of await page.locator('[data-trick-layer="current"] .coinche-trick-card button').all()) {
      await expectInsideSafeViewport(page,card,safe);
      const hand=(await page.locator('.coinche-scene-hand-cards').boundingBox())!;
      await expect.poll(async()=> { const settled=(await card.boundingBox())!; return settled.y+settled.height; }).toBeLessThanOrEqual(hand.y);
      const box=(await card.boundingBox())!;
      for(const panel of await page.locator('.coinche-player-panel').all()) {
        const seat=(await panel.boundingBox())!;
        expect(Math.min(box.x+box.width,seat.x+seat.width)-Math.max(box.x,seat.x)<=.5 || Math.min(box.y+box.height,seat.y+seat.height)-Math.max(box.y,seat.y)<=.5,'trick card clear of every seat').toBe(true);
      }
    }
  }
  await page.screenshot({path:`.playwright/validation/game/${info.project.name}-multi-${viewport.width}-trick4.png`});
  const next=mobileGameState('playing'); next.completedTricks=[{leaderId:0,winnerId:0,points:24,cards:([0,1,2,3] as const).map(playerId=>({playerId,card:next.hands[playerId][0]}))}];
  fixture.setState(next);await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
  const collect=page.getByRole('button',{name:/Ramasser le pli/});await target(page,collect);await collect.click();
  const last=page.getByRole('button',{name:'Dernier pli',exact:true});await target(page,last);await last.click();
  const overlay=page.getByLabel('Dernier pli',{exact:true});await expectInsideSafeViewport(page,overlay,safe);
  await expect(overlay.locator('.coinche-trick-card')).toHaveCount(4);
  for(const card of await overlay.locator('.coinche-trick-card button').all()) await expectInsideSafeViewport(page,card,safe);
  await target(page,overlay.getByRole('button',{name:'Fermer'}));await overlay.getByRole('button',{name:'Fermer'}).click();
  expect(await page.evaluate(()=>document.documentElement.scrollHeight-innerHeight)).toBeLessThanOrEqual(2);
});

for(const viewport of [{width:1120,height:800},{width:1440,height:900},{width:1024,height:768},{width:1280,height:450}]) test(`@mobile @game-mobile desktop/tablet ${viewport.width}×${viewport.height}`,async({page},info)=>{
  await page.setViewportSize(viewport); const fixture=await installMobileGameFixture(page);
  for(const phase of ['bidding','playing'] as const) {
    fixture.setState(mobileGameState(phase)); await page.goto('/solo');
    await expect(page.locator('.coinche-game-scene')).toBeVisible();await expect(page.locator('.coinche-global-header')).toHaveCSS('height','56px');
    await expect(page.locator('.coinche-player-panel')).toHaveCount(4);
    if(viewport.width===1440) await page.screenshot({path:`.playwright/validation/game/${info.project.name}-desktop-${phase}.png`});
  }
  await page.goto(fixture.path);await expect(page.locator('.coinche-game-scene')).toBeVisible();
});
