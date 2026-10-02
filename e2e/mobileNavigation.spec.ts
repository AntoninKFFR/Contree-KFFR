import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { DESKTOP_VIEWPORTS, MOBILE_VIEWPORTS, expectInsideSafeViewport, expectNoPageHorizontalOverflow, setMobileViewport, simulateSafeAreas, type SafeAreas } from "./helpers/mobile";
import { installMobileNavigationFixture, LONG_NAVIGATION_USERNAME, NAVIGATION_FRIEND_ID } from "./helpers/mobileNavigationFixture";
import { monitorBrowserErrors } from "./helpers/browserErrors";

const burger = (page: Page) => page.getByRole("button", { name: "Ouvrir le menu" });
const drawer = (page: Page) => page.getByRole("dialog", { name: "Navigation KFFR" });
const nav = (page: Page) => page.getByRole("navigation", { name: "Navigation mobile" });
const artifact = (info: TestInfo, name: string) => `.playwright/validation/navigation-${info.project.name}-${name}.png`;
async function settledFrame(page: Page) {
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
}
async function headerFits(page: Page, safe: SafeAreas) {
  const header = page.locator(".coinche-global-header");
  await expectInsideSafeViewport(page, header.getByRole("link", { name: "Accueil — KFFR Contrée" }), safe);
  const boxes = [];
  for (const control of await header.locator('button, [role="switch"]').all()) {
    if (!await control.isVisible()) continue;
    await expectInsideSafeViewport(page, control, safe);
    const box = (await control.boundingBox())!;
    expect(box.width).toBeGreaterThanOrEqual(44); expect(box.height).toBeGreaterThanOrEqual(44);
    boxes.push(box);
  }
  boxes.push((await header.getByRole("link", { name: "Accueil — KFFR Contrée" }).boundingBox())!);
  boxes.sort((a, b) => a.x - b.x);
  for (let index = 1; index < boxes.length; index++) expect(boxes[index - 1].x + boxes[index - 1].width).toBeLessThanOrEqual(boxes[index].x + .5);
  await expectNoPageHorizontalOverflow(page);
}

for (const theme of ["dark", "light"] as const) {
  for (const viewport of MOBILE_VIEWPORTS) {
    test(`@mobile @navigation ${theme} authenticated long name ${viewport.width}×${viewport.height}`, async ({ page }, info) => {
      const errors = monitorBrowserErrors(page);
      const fixture = await installMobileNavigationFixture(page, { theme });
      await setMobileViewport(page, viewport); await page.goto("/");
      const notifications = page.getByRole("button", { name: "Notifications", exact: true });
      await expect(notifications).toHaveAttribute("title", "1 notifications en attente");
      await expect(page.locator(".progression-account-name")).toHaveText(LONG_NAVIGATION_USERNAME);
      await page.waitForLoadState("networkidle");
      let accountReads = 0;
      page.on("request", (request) => { if (/\/rest\/v1\/(profiles|rpc\/get_my_progression|rpc\/get_my_unlocked_profile_cosmetics)/.test(request.url())) accountReads++; });
      for (const sides of [{ left: 44, right: 0 }, { left: 0, right: 44 }]) {
        const safe = { top: viewport.width < viewport.height ? 47 : 0, bottom: 34, ...sides };
        await simulateSafeAreas(page, safe); await headerFits(page, safe);
        if (viewport.width === 390 && sides.left) await page.screenshot({ path: artifact(info, `${theme}-390-closed`) });
        const before = await page.evaluate(() => scrollY);
        await burger(page).focus(); await page.keyboard.press("Enter");
        await expect(burger(page)).toHaveAttribute("aria-expanded", "true");
        await expect(drawer(page)).toHaveAttribute("aria-modal", "true");
        await expectInsideSafeViewport(page, drawer(page).locator(".coinche-dialog"), safe);
        await expect(page.getByRole("button", { name: "Fermer le menu" })).toBeFocused();
        const training = nav(page).getByRole("button", { name: "Entraînement", exact: true });
        await expect(training).toHaveAttribute("aria-expanded", "false");
        await expect(nav(page).getByRole("link", { name: "Vue d’ensemble" })).toHaveCount(0);
        await expect(nav(page).getByRole("link", { name: "Accueil", exact: true })).toHaveAttribute("aria-current", "page");
        await expect(nav(page).getByText(LONG_NAVIGATION_USERNAME, { exact: true })).toBeVisible();
        await expect(nav(page).getByRole("progressbar")).toHaveAttribute("aria-valuenow", `${fixture.summary.xpIntoLevel}`);
        await expect(nav(page).locator(".profile-badge--mini")).toHaveCount(1);
        await expect(nav(page).locator(".profile-title")).toHaveCount(0);
        await expect(nav(page).getByRole("link", { name: "Ma progression" })).toHaveAttribute("href", "/progression");
        await expect(page.locator("body")).toHaveCSS("overflow", "hidden");
        await page.mouse.move(4, viewport.height / 2); await page.mouse.wheel(0, 300); await settledFrame(page);
        expect(await page.evaluate(() => scrollY)).toBe(before);
        if (viewport.width === 390 && viewport.height === 844) expect(await nav(page).evaluate((el) => el.scrollHeight - el.clientHeight)).toBeLessThanOrEqual(1);
        await nav(page).evaluate((el) => { el.scrollTop = el.scrollHeight; });
        await expectInsideSafeViewport(page, nav(page).getByRole("link", { name: "Ma progression" }), safe);
        await expectNoPageHorizontalOverflow(page); await page.waitForLoadState("networkidle");
        expect(accountReads).toBe(0);
        if (sides.left && [390, 568, 844].includes(viewport.width)) await page.screenshot({ path: artifact(info, `${theme}-${viewport.width}-auth-open`) });
        await page.keyboard.press("Escape"); await expect(drawer(page)).toHaveCount(0);
        await expect(burger(page)).toBeFocused(); await expect(burger(page)).toHaveAttribute("aria-expanded", "false");
        await expect(page.locator("body")).not.toHaveCSS("overflow", "hidden");
        expect(await page.evaluate(() => scrollY)).toBe(before);
      }
      errors.assertClean();
    });
  }

  test(`@mobile @navigation ${theme} anonymous standalone and level-one account`, async ({ page }, info) => {
    await installMobileNavigationFixture(page, { theme, authenticated: false, notifications: false });
    await page.goto("/");
    for (const viewport of MOBILE_VIEWPORTS) {
      await setMobileViewport(page, viewport);
      const safe = { top: 0, bottom: 34, left: 0, right: 44 }; await simulateSafeAreas(page, safe);
      await headerFits(page, safe); await burger(page).click();
      await expect(nav(page).getByRole("progressbar")).toHaveCount(0);
      await expect(nav(page).getByText(/Niv\./)).toHaveCount(0);
      await expect(nav(page).getByRole("link", { name: "Amis", exact: true })).toHaveCount(0);
      const login = nav(page).getByRole("link", { name: "Se connecter" });
      await login.evaluate((el) => el.scrollIntoView({ block: "center" })); await expectInsideSafeViewport(page, login, safe);
      if ([390, 568].includes(viewport.width)) await page.screenshot({ path: artifact(info, `${theme}-${viewport.width}-anonymous-open`) });
      await page.getByRole("button", { name: "Fermer le menu" }).click(); await expect(burger(page)).toBeFocused();
    }
    await burger(page).click(); await nav(page).getByRole("link", { name: "Se connecter" }).click();
    await expect(page).toHaveURL(/\/login$/); await expect(drawer(page)).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Connexion", exact: true })).toBeVisible();
    await expect(page.locator("body")).not.toHaveCSS("overflow", "hidden");
  });

  for (const viewport of DESKTOP_VIEWPORTS) {
    test(`@mobile @navigation desktop ${theme} ${viewport.width}: geometry, hover and controls unchanged`, async ({ page }, info) => {
      await installMobileNavigationFixture(page, { theme, standalone: false });
      await setMobileViewport(page, viewport);
      for (const route of ["/", "/solo"]) {
        await page.goto(route); await page.waitForLoadState("networkidle");
        const header = page.locator(".coinche-global-header");
        await expect(header).toHaveCSS("height", "56px"); await expect(burger(page)).toBeHidden();
        const desktop = header.getByRole("navigation", { name: "Navigation principale" });
        await expect(desktop).toBeVisible(); await expect(header.locator(".progression-account-name")).toHaveText(LONG_NAVIGATION_USERNAME);
        const box = (await desktop.boundingBox())!; const controls = (await header.locator(".coinche-header-controls, .col-start-3").boundingBox())!;
        expect(box.x + box.width).toBeLessThanOrEqual(controls.x);
        await expectNoPageHorizontalOverflow(page); await page.evaluate(() => document.fonts.ready);
        const stage = process.env.NAVIGATION_BASELINE === "1" ? "baseline" : "current";
        await header.screenshot({ path: artifact(info, `${stage}-desktop-${theme}-${viewport.width}-${route === "/" ? "home" : "solo"}`) });
        await desktop.getByRole("button", { name: /Jouer/ }).hover(); await expect(desktop.getByRole("link", { name: "Solo", exact: true })).toBeVisible();
        await desktop.getByRole("link", { name: "Solo", exact: true }).hover(); await expect(desktop.getByRole("link", { name: "Solo", exact: true })).toBeVisible();
        await page.mouse.move(0, 180); await expect(desktop.getByRole("link", { name: "Solo", exact: true })).toHaveCount(0);
        await desktop.getByRole("button", { name: /Entraînement/ }).click();
        await expect(desktop.getByRole("link", { name: "Calculer" })).toHaveAttribute("href", "/training#calculer");
        await page.keyboard.press("Escape"); await expect(desktop.getByRole("link", { name: "Calculer" })).toHaveCount(0);
        if (route === "/solo") { await header.getByRole("button", { name: "Menu Partie" }).click(); await expect(page.getByRole("complementary", { name: "Menu de partie" })).toBeVisible(); await page.keyboard.press("Escape"); }
      }
    });
  }
}

test("@mobile @navigation real routes, Training sections and hash navigation close the drawer", async ({ page }) => {
  await installMobileNavigationFixture(page); await setMobileViewport(page, { width: 390, height: 844 });
  for (const [path, label] of [["/", "Accueil"], ["/solo", "Solo"], ["/multiplayer", "Multijoueur"], ["/friends", "Amis"],
    [`/friends/${NAVIGATION_FRIEND_ID}`, "Amis"], ["/history", "Historique"], ["/training", "Vue d’ensemble"],
    ["/training/puzzle/trick-value?level=1", "Calculer"], ["/training/puzzle/trick-recall?level=1", "Mémoriser"],
    ["/training/puzzle/opponent-voids?level=1", "Déduire"], ["/training/conventions/bidding", "Annoncer"],
    ["/rules", "Règles"], ["/progression", "Ma progression"], ["/profile", LONG_NAVIGATION_USERNAME]]) {
    await page.goto(path); await expect(page.locator("main")).toBeVisible(); await page.waitForLoadState("networkidle");
    await burger(page).click(); const training = nav(page).getByRole("button", { name: "Entraînement", exact: true });
    await expect(training).toHaveAttribute("aria-expanded", `${path.startsWith("/training")}`);
    await expect(nav(page).locator('[aria-current="page"]')).toHaveCount(1);
    await expect(nav(page).getByRole("link", { name: label, exact: label !== LONG_NAVIGATION_USERNAME })).toHaveAttribute("aria-current", "page");
    if (path.startsWith("/training/puzzle/trick-value")) {
      await nav(page).getByRole("link", { name: "Calculer", exact: true }).click();
      await expect(page).toHaveURL(/\/training#calculer$/); await expect(drawer(page)).toHaveCount(0);
      await expect(page.locator("#calculer")).toBeInViewport();
    } else await page.keyboard.press("Escape");
  }
  await page.goto("/"); await burger(page).click();
  await nav(page).getByRole("button", { name: "Entraînement", exact: true }).click();
  await expect(nav(page).getByRole("link", { name: "Vue d’ensemble" })).toBeVisible();
  await nav(page).getByRole("link", { name: "Calculer" }).click();
  await expect(page).toHaveURL(/\/training#calculer$/); await expect(drawer(page)).toHaveCount(0);
  await expect(burger(page)).toBeFocused(); await expect(page.locator("body")).not.toHaveCSS("overflow", "hidden");
  await burger(page).click(); await expect(nav(page).getByRole("link", { name: "Calculer" })).toHaveAttribute("aria-current", "page");
  await nav(page).getByRole("link", { name: "Mémoriser" }).click();
  await expect(page).toHaveURL(/\/training#memoriser$/); await expect(drawer(page)).toHaveCount(0);
  await burger(page).click(); await expect(nav(page).getByRole("link", { name: "Mémoriser" })).toHaveAttribute("aria-current", "page");
  await nav(page).getByRole("button", { name: "Entraînement", exact: true }).click();
  await expect(nav(page).getByRole("link", { name: "Vue d’ensemble" })).toHaveCount(0);
  await page.keyboard.press("Escape"); await burger(page).click();
  await expect(nav(page).getByRole("button", { name: "Entraînement", exact: true })).toHaveAttribute("aria-expanded", "true");
});

test("@mobile @navigation locks real document scroll, traps keyboard and restores every closing path", async ({ page }) => {
  await installMobileNavigationFixture(page, { xp: 0, username: "Nouveau joueur", notifications: false });
  await setMobileViewport(page, { width: 390, height: 844 }); await page.goto("/rules");
  await page.waitForLoadState("networkidle");
  for (const close of ["button", "escape", "backdrop", "navigation"] as const) {
    await page.evaluate(() => window.scrollTo(0, 240)); await expect.poll(() => page.evaluate(() => scrollY)).toBe(240);
    await burger(page).evaluate((element) => element.focus({ preventScroll: true })); await page.keyboard.press("Enter");
    await expect(nav(page).getByRole("progressbar")).toHaveAttribute("aria-valuenow", "0");
    await expect(nav(page).getByText("Niv. 1 · 0 / 100 XP")).toBeVisible();
    const closeButton = page.getByRole("button", { name: "Fermer le menu" }); const last = nav(page).getByRole("link", { name: "Ma progression" });
    await page.keyboard.press("Shift+Tab"); await expect(last).toBeFocused();
    await page.keyboard.press("Tab"); await expect(closeButton).toBeFocused();
    await page.keyboard.press("Tab"); await expect(nav(page).getByRole("link", { name: "Accueil", exact: true })).toBeFocused();
    await page.keyboard.press("Shift+Tab"); await expect(closeButton).toBeFocused();
    await page.mouse.move(4, 400); await page.mouse.wheel(0, 500); await settledFrame(page);
    expect(await page.evaluate(() => scrollY)).toBe(240);
    if (close === "button") await closeButton.click();
    if (close === "escape") await page.keyboard.press("Escape");
    if (close === "backdrop") await drawer(page).click({ position: { x: 4, y: 400 } });
    if (close === "navigation") await nav(page).getByRole("link", { name: "Règles", exact: true }).click();
    await expect(drawer(page)).toHaveCount(0); await expect(burger(page)).toBeFocused();
    await expect(page.locator("body")).not.toHaveCSS("overflow", "hidden");
    expect(await page.evaluate(() => scrollY)).toBe(240);
  }
  await page.mouse.move(20, 700); await page.mouse.wheel(0, 200); await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(240);
  await burger(page).click(); await setMobileViewport(page, { width: 1120, height: 800 });
  await expect(drawer(page)).toHaveCount(0); await expect(page.locator("body")).not.toHaveCSS("overflow", "hidden");
  await expect(page.getByRole("navigation", { name: "Navigation principale" }).getByRole("link", { name: "Accueil", exact: true })).toBeFocused();
  // Width changes may adjust the native scroll anchor as the rules reflow.
  expect(await page.evaluate(() => scrollY)).toBeGreaterThan(0);
});

test("@mobile @navigation audio, theme, notifications and game controls survive drawer use", async ({ page }) => {
  const fixture = await installMobileNavigationFixture(page); await setMobileViewport(page, { width: 568, height: 320 }); await page.goto("/solo");
  const safe = { top: 0, bottom: 34, left: 44, right: 0 }; await simulateSafeAreas(page, safe); await headerFits(page, safe);
  await page.getByRole("button", { name: "Contrôles audio" }).click();
  const audio = page.getByRole("dialog", { name: "Lecteur audio" }); await expectInsideSafeViewport(page, audio, safe);
  await page.keyboard.press("Escape"); await expect(audio).toHaveCount(0);
  await page.getByRole("switch", { name: "Activer le thème clair" }).click(); await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await burger(page).click(); await expect(nav(page)).toHaveCSS("background-color", "rgb(229, 227, 217)");
  await page.keyboard.press("Escape");
  const notifications = page.getByRole("button", { name: "Notifications", exact: true });
  await expect(notifications.locator(".social-notification-badge")).toHaveText("1"); await notifications.click();
  await expect(page.locator("#social-notification-center")).toContainText("Ami de navigation");
  await burger(page).click(); await expect(page.locator("#social-notification-center")).toHaveCount(0);
  await page.keyboard.press("Escape"); await notifications.click(); await expect(page.locator("#social-notification-center")).toBeVisible(); await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Menu Partie" }).click(); await expect(page.getByRole("complementary", { name: "Menu de partie" })).toBeVisible(); await page.keyboard.press("Escape");
  await setMobileViewport(page, { width: 320, height: 568 }); await simulateSafeAreas(page, { top: 47, bottom: 34, left: 44, right: 0 }); await headerFits(page, { top: 47, bottom: 34, left: 44, right: 0 });
  fixture.start(); await page.goto(fixture.path); await setMobileViewport(page, { width: 844, height: 390 });
  await expect(page.locator(".coinche-game-scene")).toBeVisible(); await expect(page.getByRole("button", { name: "Menu Partie" })).toBeVisible();
  await page.getByRole("button", { name: "Menu Partie" }).click(); await expect(page.getByRole("complementary", { name: "Menu de partie" })).toBeVisible(); await page.keyboard.press("Escape");
});

test("@mobile @navigation reduced motion disables only the drawer entry animation", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" }); await installMobileNavigationFixture(page, { authenticated: false });
  await setMobileViewport(page, { width: 390, height: 844 });
  await page.goto("/"); await burger(page).click(); await expect(drawer(page).locator(".coinche-dialog")).toHaveCSS("animation-name", "none");
});
