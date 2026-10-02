import { expect, test, type Page } from "@playwright/test";
import { installHomeProgressionFixture, type HomeProgressionState } from "./helpers/homeProgressionFixture";
import { MOBILE_VIEWPORTS, expectNoPageHorizontalOverflow, setMobileViewport, simulateSafeAreas } from "./helpers/mobile";

const routes = [["Jouer en solo", "/solo"], ["Multijoueur", "/multiplayer"], ["Entraînement", "/training"], ["Voir les règles", "/rules"], ["Voir ma progression", "/progression"]] as const;
async function settle(page: Page) { await page.waitForLoadState("networkidle"); await page.evaluate(() => document.fonts.ready); }
async function phoneInsets(page: Page, portrait: boolean) {
  await simulateSafeAreas(page, portrait ? {top:47,bottom:34,left:0,right:0} : {top:0,bottom:21,left:47,right:47});
}

for (const theme of ["dark", "light"] as const) {
  test(`@mobile @home-mobile ${theme} authenticated home exposes progression in the first iPhone viewport`, async ({page}, info) => {
    await installHomeProgressionFixture(page, {theme}); await setMobileViewport(page, {width:390,height:844}); await page.goto("/");
    const summary = page.locator("main .progression-card"); await expect(summary.getByRole("progressbar")).toBeVisible(); await settle(page); await phoneInsets(page, true);
    expect(await page.evaluate(() => scrollY)).toBe(0);
    await expect(page.locator(".coinche-global-header")).toBeInViewport();
    await expect(page.getByRole("heading", {level:1})).toHaveText("La contrée, en solo ou entre amis");
    for (const element of [page.locator(".coinche-global-header"), page.getByRole("heading", {level:1}), ...routes.map(([name]) => page.locator("main").getByRole("link", {name:new RegExp(name)}))]) {
      await expect(element).toBeInViewport();
      const visibleBox = (await element.boundingBox())!;
      expect(visibleBox.y).toBeGreaterThanOrEqual(0);
      expect(visibleBox.y + visibleBox.height).toBeLessThanOrEqual(844 - 34);
    }
    const hero = (await page.locator(".coinche-home-hero").boundingBox())!;
    expect(hero.height).toBeLessThanOrEqual(320);
    const box = (await summary.boundingBox())!;
    expect(box.y).toBeGreaterThanOrEqual(hero.y + hero.height);
    expect(box.y + box.height).toBeLessThanOrEqual(844 - 34);
    await expect(summary.getByRole("heading", {level:2})).toBeInViewport();
    await expect(summary.getByRole("progressbar")).toBeInViewport();
    await expectNoPageHorizontalOverflow(page);
    await page.screenshot({path:info.outputPath(`home-auth-${theme}-390.png`),fullPage:true});
  });

  for (const profile of ["anonymous", "level-1", "high-level"] as const) {
    test(`@mobile @home-mobile ${theme} ${profile} portrait, landscape, tablet and desktop`, async ({page}, info) => {
      const data=await installHomeProgressionFixture(page, {theme, authenticated:profile !== "anonymous", xp:profile === "high-level" ? 1234567 : 5});
      await page.goto("/");
      if (profile !== "anonymous") await expect(page.locator("main .progression-card").getByRole("progressbar")).toBeVisible();
      await settle(page);
      for (const viewport of [...MOBILE_VIEWPORTS, {width:768,height:900},{width:1024,height:900},{width:1120,height:800},{width:1440,height:900}]) {
        await setMobileViewport(page, viewport);
        if (viewport.width < 1120) await phoneInsets(page, viewport.width < viewport.height);
        else await simulateSafeAreas(page, {top:0,bottom:0,left:0,right:0});
        await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
        await expect(page.getByRole("heading", {level:1})).toHaveCount(1);
        expect(await page.getByRole("heading",{level:1}).evaluate(el=>el.scrollWidth<=el.clientWidth)).toBe(true);
        await expectNoPageHorizontalOverflow(page);
        const hero = page.locator(".coinche-home-hero");
        if (viewport.width < 1120) {
          expect(await hero.evaluate(el=>parseFloat(getComputedStyle(el).paddingTop))).toBeLessThanOrEqual(28);
          expect(await hero.locator("h1").evaluate(el=>parseFloat(getComputedStyle(el).fontSize))).toBeLessThanOrEqual(40);
        }
        for (const [name,route] of routes.slice(0,4)) {
          const link = hero.getByRole("link", {name:new RegExp(name)}); await expect(link).toHaveAttribute("href",route);
          if (route !== "/rules") expect((await link.boundingBox())!.height).toBeGreaterThanOrEqual(44);
        }
        await expect(page.locator(".coinche-global-header .coinche-brand-logo--compact")).toBeVisible();
        if (viewport.width < 480 || viewport.height <= 450 && viewport.width < 1120) await expect(page.locator(".coinche-home-logo")).toBeHidden();
        else await expect(page.locator(".coinche-home-logo")).toBeVisible();
        if (viewport.width < 480) expect((await hero.boundingBox())!.height).toBeLessThanOrEqual(350);
        if (profile === "anonymous") { await expect(page.locator("main .progression-card")).toHaveCount(0); await expect(page.locator(".weekly-missions-card")).toHaveCount(0); }
        else {
          const summary=page.locator("main .progression-card");
          await expect(summary.getByRole("heading",{level:2})).toHaveText(`Niveau ${data.summary.level}`);
          await expect(summary.getByRole("progressbar")).toHaveAttribute("aria-valuenow",String(data.summary.xpIntoLevel));
          await expect(summary.getByRole("progressbar")).toHaveAttribute("aria-valuemax",String(data.summary.xpForNextLevel));
          await expect(page.getByRole("list", {name:"Missions hebdomadaires"}).getByRole("listitem")).toHaveCount(3);
          await expect(page.locator("main .progression-card").getByRole("link", {name:/Voir ma progression/})).toHaveAttribute("href","/progression");
        }
        if ([320,390,844,1440].includes(viewport.width)) await page.screenshot({path:info.outputPath(`home-${profile}-${theme}-${viewport.width}.png`),fullPage:true});
      }
    });
  }

  for (const state of ["weekly-complete", "weekly-unavailable", "weekly-empty", "loading", "error"] as HomeProgressionState[]) {
    test(`@mobile @home-mobile ${theme} ${state} keeps a compact and recoverable Home`, async ({page}, info) => {
      const data=await installHomeProgressionFixture(page, {theme,state}); await setMobileViewport(page,{width:390,height:844}); await page.goto("/"); await phoneInsets(page,true);
      const summary=page.locator("main .progression-card");
      if (state === "loading") {
        await expect(summary.getByRole("status")).toHaveText("Chargement de la progression…");
        const before=(await summary.boundingBox())!; expect(before.height).toBeLessThanOrEqual(160);
        data.setState("ready"); await expect(summary.getByRole("progressbar")).toBeVisible();
        expect(Math.abs((await summary.boundingBox())!.y-before.y)).toBeLessThanOrEqual(1);
      } else if (state === "error") {
        await expect(summary.getByRole("status")).toHaveText("Impossible de charger ta progression. Réessaie.");
        data.setState("ready"); await summary.getByRole("button",{name:"Réessayer"}).click(); await expect(summary.getByRole("progressbar")).toBeVisible();
      } else if (state === "weekly-complete") {
        const weekly=page.getByRole("list",{name:"Missions hebdomadaires"}); await expect(weekly.getByRole("listitem")).toHaveCount(3); await expect(weekly.getByText("✓ Terminé",{exact:true})).toHaveCount(3);
        for (const bar of await weekly.getByRole("progressbar").all()) { await expect(bar).toHaveAttribute("aria-valuenow","3"); await expect(bar).toHaveAttribute("aria-valuemax","3"); }
      } else await expect(page.getByText("Les missions hebdomadaires sont momentanément indisponibles.")).toBeVisible();
      await expectNoPageHorizontalOverflow(page);
      await page.screenshot({path:info.outputPath(`home-${state}-${theme}-390.png`),fullPage:true});
    });
  }

  test(`@mobile @home-mobile ${theme} links, keyboard and complete progression page stay available`, async ({page,browserName}) => {
    await installHomeProgressionFixture(page,{theme}); await setMobileViewport(page,{width:390,height:844}); await page.goto("/");
    const summary=page.locator("main .progression-card"); await expect(summary.getByRole("progressbar")).toBeVisible(); await settle(page);
    const rules=page.locator("main").getByRole("link",{name:/Voir les règles/}); await rules.focus(); await expect(rules).toBeFocused();
    expect(await rules.evaluate(el=>getComputedStyle(el).outlineStyle)).toBe("solid");
    const progression=summary.getByRole("link",{name:/Voir ma progression/});
    expect(await progression.evaluate(el=>(el as HTMLAnchorElement).tabIndex)).toBe(0);
    // WebKit's keyboard preference can exclude native links from Tab; verify eligibility, focus and Enter.
    if (browserName === "webkit") await progression.focus();
    else await page.keyboard.press("Tab");
    await expect(progression).toBeFocused();
    expect(await progression.evaluate(el=>getComputedStyle(el).outlineStyle)).toBe("solid");
    await page.keyboard.press("Enter"); await expect(page).toHaveURL(/\/progression$/);
    await expect(page.getByRole("heading",{name:"Missions de départ"})).toBeVisible(); await expect(page.getByRole("heading",{name:"Collection"})).toBeVisible(); await expect(page.getByRole("heading",{name:"XP récents"})).toBeVisible();
    await expect(page.getByText("+200 XP")).toHaveCount(3);
    await expect(page.getByText("Termine 3 parties en Multijoueur.")).toBeVisible();
    for (const [name, route] of routes.slice(0,4)) { await page.goto("/"); await page.locator("main").getByRole("link",{name:new RegExp(name)}).click(); await expect(page).toHaveURL(new RegExp(`${route}$`)); }
  });
}

test("@mobile @home-mobile long weekly titles keep counters and bars inside their rows",async({page})=>{
  await installHomeProgressionFixture(page); await setMobileViewport(page,{width:320,height:568}); await page.goto("/");
  const weekly=page.getByRole("list",{name:"Missions hebdomadaires"}); await expect(weekly.getByRole("listitem")).toHaveCount(3);
  await weekly.getByRole("heading").first().evaluate(el=>{el.textContent="Terminer plusieurs séries d’entraînement et parties avec ses amis";});
  await expectNoPageHorizontalOverflow(page);
  for(const row of await weekly.getByRole("listitem").all()) {
    expect(await row.evaluate(el=>[...el.querySelectorAll("h3, span, [role=progressbar]")].every(child=>child.getBoundingClientRect().right<=el.getBoundingClientRect().right+1))).toBe(true);
    await expect(row.locator(".home-weekly-heading > span")).toBeVisible();
  }
});
