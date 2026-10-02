import { expect, test } from "@playwright/test";
import { appShellFixture } from "./helpers/appShellFixture";
import { installMobileNavigationFixture } from "./helpers/mobileNavigationFixture";
import { MOBILE_VIEWPORTS, expectNoPageHorizontalOverflow, scrollDocumentToEnd, setMobileViewport, simulateSafeAreas } from "./helpers/mobile";
import { monitorBrowserErrors } from "./helpers/browserErrors";

for (const theme of ["dark", "light"] as const) {
  for (const viewport of MOBILE_VIEWPORTS) {
    test(`@mobile @density ${theme} compact primitives ${viewport.width}×${viewport.height}`, async ({page}, info) => {
      await installMobileNavigationFixture(page, {theme, authenticated:false});
      await setMobileViewport(page, viewport); await page.goto("/rules"); await page.waitForLoadState("networkidle");
      await page.locator("main").evaluate((element, markup) => { element.outerHTML = markup; }, appShellFixture());
      await simulateSafeAreas(page, {top:0,bottom:34,left:0,right:0});
      await expectNoPageHorizontalOverflow(page);
      const header = page.locator(".coinche-page-header");
      expect((await header.boundingBox())!.height).toBeLessThanOrEqual(viewport.width <= 479 ? 300 : 260);
      const title = header.getByRole("heading", {level:1});
      expect(await title.evaluate((el) => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(0);
      if (viewport.width === 390) {
        expect(await title.evaluate((el) => el.getBoundingClientRect().height / parseFloat(getComputedStyle(el).lineHeight))).toBeGreaterThanOrEqual(1.9);
        expect(await title.evaluate((el) => el.getBoundingClientRect().height / parseFloat(getComputedStyle(el).lineHeight))).toBeLessThanOrEqual(2.1);
        expect((await header.boundingBox())!.height).toBeLessThanOrEqual(260);
      }
      await expect(header.getByText(/Toutes les informations restent lisibles/)).toBeVisible();
      const action = header.getByRole("button", {name:"Créer table"});
      for (const control of await page.locator(".coinche-action, .coinche-segmented-item, input.coinche-input, select.coinche-input").all()) {
        expect((await control.boundingBox())!.height).toBeGreaterThanOrEqual(44);
      }
      for (const field of await page.locator(".coinche-input").all()) expect(await field.evaluate((el) => parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(16);
      const padding = await page.locator(".coinche-app-surface").evaluate((el) => parseFloat(getComputedStyle(el).paddingTop));
      expect(padding).toBeLessThanOrEqual(viewport.width <= 479 ? 12 : 18);
      const actions = header.locator(".coinche-page-header-actions > button");
      expect((await actions.nth(0).boundingBox())!.y).toBe((await actions.nth(1).boundingBox())!.y);
      const table = page.getByRole("region", {name:"Tableau détaillé"});
      expect(await table.evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(true);
      await table.evaluate((el) => { el.scrollLeft = el.scrollWidth; });
      expect(await table.evaluate((el) => el.scrollLeft)).toBeGreaterThan(0);
      await scrollDocumentToEnd(page);
      await expect.poll(async () => (await page.locator(".coinche-app-surface").boundingBox())!.y + (await page.locator(".coinche-app-surface").boundingBox())!.height).toBeLessThanOrEqual(viewport.height - 34);
      await expectNoPageHorizontalOverflow(page);
      await page.keyboard.press("Tab"); await action.focus(); await expect(action).toBeFocused();
      expect(await action.evaluate((el) => getComputedStyle(el).outlineStyle)).toBe("solid");
      await page.screenshot({path:info.outputPath(`primitives-${theme}-${viewport.width}.png`), fullPage:true});
    });
  }

  for (const viewport of [{width:390,height:844},{width:568,height:320},{width:768,height:900},{width:1024,height:900}]) {
    test(`@mobile @density ${theme} real authenticated pages, forms and scroll ${viewport.width}`, async ({page}, info) => {
      test.setTimeout(120000);
      const errors = monitorBrowserErrors(page);
      await installMobileNavigationFixture(page, {theme, notifications:false});
      await setMobileViewport(page, viewport);
      for (const path of ["/", "/friends", "/history", "/training", "/multiplayer", "/profile", "/progression", "/leaderboard", "/rules"]) {
        await page.goto(path); await expect(page.locator("main")).toBeVisible(); await page.waitForLoadState("networkidle");
        await expect(page.locator("html")).toHaveAttribute("data-theme",theme);
        await expectNoPageHorizontalOverflow(page);
        for (const field of await page.locator("main .coinche-input").all()) expect(await field.evaluate((el) => parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(16);
        await scrollDocumentToEnd(page);
        await expect.poll(async () => { await scrollDocumentToEnd(page); const box=(await page.locator("main > div").boundingBox())!; return box.y+box.height; }).toBeLessThanOrEqual(viewport.height+1);
        if ((viewport.width === 390 && ["/friends","/training","/multiplayer"].includes(path)) || (viewport.width === 568 && path === "/multiplayer"))
          await page.screenshot({path:info.outputPath(`${theme}-${path.slice(1)}-${viewport.width}.png`),fullPage:true});
      }
      errors.assertClean();
    });
  }

  test(`@mobile @density ${theme} login labels and CTA remain reachable after the keyboard shortens the viewport`, async ({page}, info) => {
    await installMobileNavigationFixture(page, {theme, authenticated:false});
    await setMobileViewport(page, {width:390,height:844}); await page.goto("/login");
    const email = page.getByRole("textbox", {name:"Email",exact:true}), password = page.getByLabel("Mot de passe", {exact:true});
    await expect(email).toBeEnabled();
    await email.fill("mobile@example.test");
    await expect(email).toHaveCSS("font-size","16px"); await expect(password).toHaveCSS("font-size","16px");
    await email.focus(); await expect(email).toBeFocused();
    await setMobileViewport(page, {width:390,height:380});
    await password.fill("fixture-only"); await password.focus(); await expect(password).toBeFocused();
    await expectNoPageHorizontalOverflow(page);
    const submit = page.locator('form button[type="submit"]'); await submit.scrollIntoViewIfNeeded(); await expect(submit).toBeInViewport();
    expect((await submit.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await setMobileViewport(page, {width:390,height:844});
    await page.screenshot({path:info.outputPath(`${theme}-login-390.png`),fullPage:true});
    await expect(email).toHaveValue("mobile@example.test");
    await expect(page.getByText("Mot de passe", {exact:true})).toBeVisible();
  });
}
test("@mobile @density narrow, medium and wide variants use the available phone width; long headings wrap", async ({page}) => {
  await installMobileNavigationFixture(page, {authenticated:false});
  await setMobileViewport(page, {width:320,height:568}); await page.goto("/rules"); await page.waitForLoadState("networkidle");
  for (const width of ["narrow","medium","wide"] as const) {
    await page.locator("main").evaluate((element, markup) => { element.outerHTML = markup; }, appShellFixture(width));
    await page.locator("h1").evaluate((el) => { el.textContent = "EntraînementProgressionHistorique".repeat(3); });
    await expectNoPageHorizontalOverflow(page);
    expect((await page.locator("main > div").boundingBox())!.width).toBeGreaterThanOrEqual(270);
  }
});
