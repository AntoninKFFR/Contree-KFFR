import { expect, test, type Page } from "@playwright/test";
import { clonePlayerPreferences, PLAYER_PREFERENCES_STORAGE_KEY } from "../lib/preferences/playerPreferences";
import { monitorBrowserErrors } from "./helpers/browserErrors";
import { installMobileRoomFixture } from "./helpers/mobileRoomFixture";
import { DESKTOP_VIEWPORTS, MOBILE_VIEWPORTS, expectInsideSafeViewport, expectNoPageHorizontalOverflow, scrollDocumentToEnd, setMobileViewport, simulateSafeAreas } from "./helpers/mobile";

const routes = ["/", "/friends", "/training", "/multiplayer", "/solo", "/rules", "/login", "/progression", "/profile", "/history", "/leaderboard"];
async function seedTheme(page: Page, theme: "dark" | "light") {
  const preferences = clonePlayerPreferences();
  preferences.visual.theme = theme;
  await page.addInitScript(({ key, preferences }) => localStorage.setItem(key, JSON.stringify(preferences)), { key: PLAYER_PREFERENCES_STORAGE_KEY, preferences });
}
for (const theme of ["dark", "light"] as const) {
  for (const viewport of [...MOBILE_VIEWPORTS, ...DESKTOP_VIEWPORTS]) {
    test(`@mobile ${theme} natural pages at ${viewport.width}×${viewport.height}`, async ({ page }) => {
      test.setTimeout(120_000);
      const errors = monitorBrowserErrors(page);
      await seedTheme(page, theme);
      await setMobileViewport(page, viewport);
      for (const path of routes) {
        await page.goto(path);
        await expect(page.locator("main.coinche-app-page > div")).toBeVisible();
        await expect(page.locator(".coinche-global-header")).toHaveCSS("height", "56px");
        await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
        const background = theme === "dark" ? "rgb(6, 18, 13)" : "rgb(238, 234, 222)";
        await expect(page.locator("html")).toHaveCSS("background-color", background);
        await expect(page.locator("body")).toHaveCSS("background-color", background);
        await expectNoPageHorizontalOverflow(page);
        const pageShell = page.locator("main");
        expect(await pageShell.evaluate((el) => getComputedStyle(el).overflowY), `${path}: document owns normal scroll`).toBe("visible");
        await scrollDocumentToEnd(page);
        const last = pageShell.locator(":scope > div").last();
        const box = await last.boundingBox();
        expect(box!.y + box!.height, `${path}: page end reachable`).toBeLessThanOrEqual(viewport.height + 1);
        await expect(page.locator(".coinche-global-header")).toBeInViewport();
        if (viewport.width <= 600) {
          for (const input of await page.locator('input.coinche-input:not([type="checkbox"]), select.coinche-input, textarea.coinche-input').all()) {
            expect(await input.evaluate((el) => parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(16);
          }
        }
        // Finish Next's link prefetches before navigating away (WebKit logs aborted RSC loads).
        await page.waitForLoadState("networkidle");
      }
      errors.assertClean();
    });
  }

  test(`@mobile ${theme} simulated safe areas, dynamic resize, menus and dialogs`, async ({ page }) => {
    const errors = monitorBrowserErrors(page);
    await setMobileViewport(page, { width: 390, height: 844 });
    await page.goto("/solo");
    if (theme === "light") await page.getByRole("switch", { name: "Activer le thème clair" }).click();
    const areas = { top: 47, bottom: 34, left: 44, right: 0 };
    await simulateSafeAreas(page, areas);
    await expect(page.locator(".coinche-global-header")).toHaveCSS("height", "103px");
    const logo = page.getByRole("link", { name: "Accueil — KFFR Contrée" });
    await expectInsideSafeViewport(page, logo, areas);
    await expectInsideSafeViewport(page, page.getByRole("button", { name: "Commencer la partie" }), areas);
    await page.getByRole("button", { name: "Commencer la partie" }).click();
    await expect(page.getByRole("heading", { name: "Tournez votre téléphone" })).toBeVisible();
    await expectInsideSafeViewport(page, page.locator(".coinche-mobile-notice > div"), areas);
    expect(await page.evaluate(() => document.documentElement.scrollHeight - innerHeight)).toBeLessThanOrEqual(1);
    await page.getByRole("button", { name: "Menu Partie" }).click();
    await page.getByRole("complementary", { name: "Menu de partie" }).getByRole("button", { name: "Paramètres" }).click();
    await expectInsideSafeViewport(page, page.getByRole("dialog", { name: "Paramètres" }).locator(".coinche-dialog"), areas);
    await expect(page.getByRole("searchbox", { name: "Rechercher un paramètre" })).toHaveCSS("font-size", "16px");
    await page.keyboard.press("Escape");

    let hand: string[] | null = null;

    for (const viewport of [{ width: 568, height: 320 }, { width: 844, height: 390 }]) {
      for (const sides of [{ left: 44, right: 0 }, { left: 0, right: 44 }]) {
        const landscapeAreas = { top: 0, bottom: 34, ...sides };
        await setMobileViewport(page, viewport);
        await simulateSafeAreas(page, landscapeAreas);
        await expect(page.locator(".coinche-game-scene")).toBeVisible();
        await expect(page.locator(".coinche-scene-hand-card")).toHaveCount(8);
        const cards = await page.locator(".coinche-scene-hand-card").allTextContents();
        if (hand) expect(cards, "rotation preserves the dealt hand").toEqual(hand);
        else hand = cards;
        await expectInsideSafeViewport(page, page.locator(".coinche-game-scene"), landscapeAreas);
        expect(await page.evaluate(() => document.documentElement.scrollHeight - innerHeight)).toBeLessThanOrEqual(1);
        await expectNoPageHorizontalOverflow(page);
        await page.screenshot({ path: `test-results/mobile-${theme}-${viewport.width}-${sides.left ? "left" : "right"}.png` });
        await page.getByRole("button", { name: "Menu Partie" }).click();
        const menu = page.getByRole("complementary", { name: "Menu de partie" });
        await expectInsideSafeViewport(page, menu, landscapeAreas);
        await menu.getByRole("button", { name: "Paramètres" }).click();
        const dialog = page.getByRole("dialog", { name: "Paramètres" });
        await expectInsideSafeViewport(page, dialog.locator(".coinche-dialog"), landscapeAreas);
        await expect(page.locator("body")).toHaveCSS("overflow", "hidden");
        const controls = dialog.locator(".overflow-y-auto").last();
        await controls.evaluate((el) => { el.scrollTop = el.scrollHeight; });
        expect(await controls.evaluate((el) => el.scrollHeight - el.clientHeight - el.scrollTop)).toBeLessThanOrEqual(1);
        await page.keyboard.press("Escape");
        await expect(dialog).toHaveCount(0);
        await expect(page.locator("body")).not.toHaveCSS("overflow", "hidden");
      }
    }
    await setMobileViewport(page, { width: 390, height: 844 });
    await simulateSafeAreas(page, areas);
    await expect(page.getByRole("heading", { name: "Tournez votre téléphone" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Commencer la partie" })).toHaveCount(0);
    await page.getByRole("button", { name: "Ouvrir le menu" }).click();
    const navigation = page.getByRole("navigation", { name: "Navigation mobile" });
    await navigation.evaluate((el) => { el.scrollTop = el.scrollHeight; });
    await expectInsideSafeViewport(page, navigation.getByRole("link", { name: "Se connecter" }), areas);
    await expect(page.locator("body")).toHaveCSS("overflow", "hidden");
    await page.keyboard.press("Escape");
    await expect(navigation).toHaveCount(0);
    await expect(page.locator("body")).not.toHaveCSS("overflow", "hidden");
    await page.getByRole("button", { name: "Contrôles audio" }).click();
    await expectInsideSafeViewport(page, page.getByRole("dialog", { name: "Lecteur audio" }), areas);
    await expectNoPageHorizontalOverflow(page);
    await page.keyboard.press("Escape");
    await setMobileViewport(page, { width: 844, height: 390 });
    await simulateSafeAreas(page, { top: 0, bottom: 34, left: 0, right: 44 });
    await expect(page.locator(".coinche-scene-hand-card")).toHaveCount(8);
    expect(await page.locator(".coinche-scene-hand-card").allTextContents()).toEqual(hand);
    expect(await page.evaluate(() => performance.getEntriesByType("navigation").length)).toBe(1);
    await page.goto("/training");
    // The root gate's neutral hydration shell can precede the actual page mount.
    await expect(page.locator("main.coinche-app-page > div")).toBeVisible();
    await simulateSafeAreas(page, { top: 0, bottom: 34, left: 0, right: 44 });
    await expect.poll(async () => {
      await scrollDocumentToEnd(page);
      const end = await page.locator("main > div").boundingBox();
      return end!.y + end!.height;
    }).toBeLessThanOrEqual(390 - 34);
    errors.assertClean();
  });

  test(`@mobile ${theme} authenticated standard pages at 320px and 390px`, async ({ page }) => {
    await seedTheme(page, theme);
    await installMobileRoomFixture(page);
    const errors = monitorBrowserErrors(page);
    for (const viewport of [MOBILE_VIEWPORTS[0], MOBILE_VIEWPORTS[2]]) {
      await setMobileViewport(page, viewport);
      for (const path of ["/", "/friends", "/training", "/multiplayer"]) {
        await page.goto(path);
        await expect(page.getByRole("button", { name: "Notifications", exact: true })).toBeVisible();
        await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
        await expectNoPageHorizontalOverflow(page);
        await page.waitForLoadState("networkidle");
      }
    }
    errors.assertClean();
  });

  test(`@mobile ${theme} authenticated lobby and multiplayer fixture across the mobile matrix`, async ({ page }) => {
    test.setTimeout(90_000);
    await seedTheme(page, theme);
    const fixture = await installMobileRoomFixture(page);
    const errors = monitorBrowserErrors(page);
    for (const viewport of MOBILE_VIEWPORTS) {
      await setMobileViewport(page, viewport);
      await page.goto(fixture.path);
      await expect(page.getByRole("button", { name: "Notifications", exact: true })).toBeVisible();
      await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
      await expect(page.locator(".coinche-lobby-table")).toBeVisible();
      await expectNoPageHorizontalOverflow(page);
      const table = await page.locator(".coinche-lobby-felt").boundingBox();
      expect(table!.height, "lobby seats keep usable height even on small landscape").toBeGreaterThanOrEqual(150);
      await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
      await expect(page.getByRole("button", { name: "Quitter la place" })).toBeInViewport();
    }
    // The lobby rules modal has a pinned footer CTA even on the smallest landscape.
    await setMobileViewport(page, MOBILE_VIEWPORTS[4]);
    const landscapeAreas = { top: 0, bottom: 34, left: 44, right: 0 };
    await simulateSafeAreas(page, landscapeAreas);
    await page.getByRole("button", { name: "Règles", exact: true }).click();
    const rules = page.getByRole("dialog", { name: "Règles de la table" });
    await expectInsideSafeViewport(page, rules.locator(".coinche-dialog"), landscapeAreas);
    await expectInsideSafeViewport(page, rules.getByRole("button", { name: "Enregistrer les règles" }), landscapeAreas);
    await page.keyboard.press("Escape");
    fixture.start();
    for (const viewport of MOBILE_VIEWPORTS) {
      await setMobileViewport(page, viewport);
      await page.goto(fixture.path);
      const areas = viewport.width > viewport.height ? { top: 0, bottom: 34, left: 44, right: 0 } : { top: 47, bottom: 34, left: 0, right: 0 };
      await simulateSafeAreas(page, areas);
      if (viewport.width > viewport.height) {
        await expectInsideSafeViewport(page, page.locator(".coinche-game-scene"), areas);
        await expect(page.locator(".coinche-scene-hand-card")).toHaveCount(8);
      } else {
        await expectInsideSafeViewport(page, page.locator(".coinche-mobile-notice > div"), areas);
      }
      await expectNoPageHorizontalOverflow(page);
      expect(await page.evaluate(() => document.documentElement.scrollHeight - innerHeight)).toBeLessThanOrEqual(1);
    }
    fixture.finishRound();
    await setMobileViewport(page, MOBILE_VIEWPORTS[4]);
    await page.goto(fixture.path);
    await simulateSafeAreas(page, landscapeAreas);
    const result = page.getByLabel("Résultat de la manche", { exact: true });
    await expectInsideSafeViewport(page, result, landscapeAreas);
    await result.getByRole("button", { name: "Manche suivante" }).scrollIntoViewIfNeeded();
    await expectInsideSafeViewport(page, result.getByRole("button", { name: "Manche suivante" }), landscapeAreas);
    errors.assertClean();
  });
}

test("@mobile canonical viewport preserves user zoom", async ({ page }) => {
  await page.goto("/");
  const viewport = page.locator('meta[name="viewport"]');
  await expect(viewport).toHaveCount(1);
  const content = await viewport.getAttribute("content");
  expect(content).toContain("width=device-width");
  expect(content).toContain("initial-scale=1");
  expect(content).toContain("viewport-fit=cover");
  expect(content).not.toMatch(/maximum-scale|user-scalable=no/);
});

test("@mobile audio popover fits 320px and mobile menu releases body scroll on desktop resize", async ({ page }) => {
  await setMobileViewport(page, MOBILE_VIEWPORTS[0]);
  await page.goto("/");
  await page.getByRole("button", { name: "Contrôles audio" }).click();
  await expectInsideSafeViewport(page, page.getByRole("dialog", { name: "Lecteur audio" }));
  await expectNoPageHorizontalOverflow(page);
  await page.keyboard.press("Escape");
  await page.goto("/solo");
  await page.getByRole("button", { name: "Ouvrir le menu" }).click();
  await page.getByRole("button", { name: "Menu Partie" }).click();
  await page.getByRole("complementary", { name: "Menu de partie" }).getByRole("button", { name: "Paramètres" }).click();
  await expect(page.getByRole("dialog", { name: "Paramètres" })).toBeVisible();
  await expect(page.locator("body")).toHaveCSS("overflow", "hidden");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "Paramètres" })).toHaveCount(0);
  await expect(page.getByRole("navigation", { name: "Navigation mobile" })).toHaveCount(0);
  await expect(page.locator("body")).not.toHaveCSS("overflow", "hidden");
  await page.getByRole("button", { name: "Ouvrir le menu" }).click();
  await expect(page.locator("body")).toHaveCSS("overflow", "hidden");
  await setMobileViewport(page, DESKTOP_VIEWPORTS[0]);
  await expect(page.getByRole("navigation", { name: "Navigation mobile" })).toHaveCount(0);
  await expect(page.locator("body")).not.toHaveCSS("overflow", "hidden");
});

test("@mobile bidding fieldsets contain their horizontal scrollers at 320px and 390px", async ({ page }) => {
  for (const viewport of [MOBILE_VIEWPORTS[0], MOBILE_VIEWPORTS[2]]) {
    await setMobileViewport(page, viewport);
    await page.goto("/training/puzzle/bidding?level=1");
    await expect(page.locator(".coinche-bidding-panel")).toBeVisible();
    const choice = page.getByRole("button", { name: "Valeur 160" });
    await choice.scrollIntoViewIfNeeded();
    await expect(choice).toBeInViewport();
    expect((await choice.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await expectNoPageHorizontalOverflow(page);
    await page.getByRole("button", { name: "Passer", exact: true }).click();
    await expect(page.getByRole("region", { name: "Correction de l’annonce" })).toBeVisible();
    await expectNoPageHorizontalOverflow(page);
  }
});
