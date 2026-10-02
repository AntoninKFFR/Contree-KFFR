import { test, expect } from "@playwright/test";
import { clonePlayerPreferences, PLAYER_PREFERENCES_STORAGE_KEY } from "../lib/preferences/playerPreferences";
import { IPHONE_UA, ANDROID_UA, IPAD_UA, simulatePwaEnvironment } from "./helpers/pwa";
import { MOBILE_VIEWPORTS, expectNoPageHorizontalOverflow, expectInsideSafeViewport, simulateSafeAreas, setMobileViewport } from "./helpers/mobile";
import { installMobileRoomFixture } from "./helpers/mobileRoomFixture";
import { monitorBrowserErrors } from "./helpers/browserErrors";
import { createNetworkProxy } from "./helpers/networkProxy";

const gateTitle = "Installer KFFR pour continuer";
test("@pwa manifest, icons and canonical iOS metadata in production", async ({ page, request }) => {
  const response = await request.get("/manifest.webmanifest");
  expect(response.status()).toBe(200);
  const manifest = await response.json();
  expect(manifest).toMatchObject({ id: "/", name: "KFFR Contrée", short_name: "KFFR", start_url: "/", scope: "/", display: "standalone", theme_color: "#071c17", background_color: "#06120d" });
  expect(manifest.orientation).toBeUndefined();
  expect(manifest.icons).toHaveLength(2);
  for (const icon of manifest.icons) {
    const asset = await request.get(icon.src);
    expect(asset.status()).toBe(200);
    expect(asset.headers()["content-type"]).toContain("image/png");
    const bytes = await asset.body();
    expect(`${bytes.readUInt32BE(16)}x${bytes.readUInt32BE(20)}`).toBe(icon.sizes);
  }
  await page.goto("/");
  await expect(page.locator('meta[name="viewport"]')).toHaveCount(1);
  await expect(page.locator('meta[name="viewport"]')).toHaveAttribute("content", "width=device-width, initial-scale=1, viewport-fit=cover");
  await expect(page.locator('meta[name="mobile-web-app-capable"]')).toHaveAttribute("content", "yes");
  await expect(page.locator('meta[name="apple-mobile-web-app-title"]')).toHaveAttribute("content", "KFFR");
  await expect(page.locator('meta[name="apple-mobile-web-app-status-bar-style"]')).toHaveAttribute("content", "black-translucent");
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute("content", "#071c17");
  await expect(page.locator('link[rel="manifest"]')).toHaveAttribute("href", "/manifest.webmanifest");
  const apple = await request.get((await page.locator('link[rel="apple-touch-icon"]').getAttribute("href"))!);
  expect(apple.status()).toBe(200);
  expect(apple.headers()["content-type"]).toContain("image/png");
  const bytes = await apple.body();
  expect([bytes.readUInt32BE(16), bytes.readUInt32BE(20)]).toEqual([180, 180]);
  const favicon = await request.get((await page.locator('link[rel="icon"][type="image/png"]').getAttribute("href"))!);
  expect(favicon.status()).toBe(200);
  const faviconBytes = await favicon.body();
  expect([faviconBytes.readUInt32BE(16), faviconBytes.readUInt32BE(20)]).toEqual([48, 48]);
});

for (const theme of ["dark", "light"] as const) {
  for (const viewport of MOBILE_VIEWPORTS) {
    test(`@pwa iPhone browser ${theme} ${viewport.width}×${viewport.height}: safe compact gate`, async ({ page }) => {
      const errors = monitorBrowserErrors(page);
      await simulatePwaEnvironment(page, { ua: IPHONE_UA });
      const preferences = clonePlayerPreferences(); preferences.visual.theme = theme;
      await page.addInitScript(({ key, preferences }) => localStorage.setItem(key, JSON.stringify(preferences)), { key: PLAYER_PREFERENCES_STORAGE_KEY, preferences });
      await setMobileViewport(page, viewport);
      await page.goto("/multiplayer/deep-link?standalone=true");
      await expect(page.getByRole("heading", { level: 1, name: gateTitle })).toBeVisible();
      await expect(page.locator(".coinche-global-header, .coinche-game-scene")).toHaveCount(0);
      await expect(page.locator("ol li")).toHaveText([
        "Ouvre le menu de partage Safari : appuie sur les 3 petites barres en bas de l’écran puis sur « Partager », ou directement sur le bouton Partager s’il est visible.",
        "Dans la feuille de partage, fais défiler puis choisis « Sur l’écran d’accueil ».",
        "Garde « Ouvrir comme app web » activé si iPhone le propose.",
        "Appuie sur « Ajouter ».",
        "Ouvre ensuite KFFR depuis son icône sur ton écran d’accueil.",
      ]);
      await expect(page.locator(".pwa-reminder")).toHaveText("KFFR est peut-être déjà installé. Ouvre-le directement depuis ton écran d’accueil.");
      await expect(page.getByRole("button")).toHaveCount(0);
      await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
      const background = theme === "dark" ? "rgb(6, 18, 13)" : "rgb(238, 234, 222)";
      await expect(page.locator("body")).toHaveCSS("background-color", background);
      const areas = { top: viewport.width < viewport.height ? 47 : 0, bottom: 34, left: 44, right: 0 };
      for (const sides of [{ left: 44, right: 0 }, { left: 0, right: 44 }]) {
        const safe = { ...areas, ...sides };
        await simulateSafeAreas(page, safe);
        const screen = page.locator(".pwa-screen");
        await screen.evaluate((el) => { el.scrollTop = 0; });
        await expectInsideSafeViewport(page, page.getByRole("heading", { name: gateTitle }), safe);
        await page.locator("ol li").first().evaluate((el) => el.scrollIntoView({ block: "center" }));
        await expectInsideSafeViewport(page, page.locator("ol li").first(), safe);
        await screen.evaluate((el) => { el.scrollTop = el.scrollHeight; });
        await expectInsideSafeViewport(page, page.locator("ol li").last(), safe);
        await expectInsideSafeViewport(page, page.locator(".pwa-reminder"), safe);
        expect(await page.evaluate(() => document.documentElement.scrollHeight - innerHeight)).toBeLessThanOrEqual(1);
        await expectNoPageHorizontalOverflow(page);
      }
      await page.screenshot({ path: `test-results/pwa-${theme}-${viewport.width}.png` });
      errors.assertClean();
    });
  }
}

test("@pwa gate blocks real application effects, auth UI and forged installation flags", async ({ page }) => {
  await simulatePwaEnvironment(page, { ua: IPHONE_UA });
  await installMobileRoomFixture(page);
  await page.addInitScript(() => {
    localStorage.setItem("standalone", "true");
    document.cookie = "standalone=true";
  });
  const privateRequests: string[] = [];
  page.on("request", (request) => {
    if (/\/api\/(social|progression|multiplayer|training|solo)|\/rest\/v1\/|\/auth\/v1\/|\/audio\//.test(request.url())) privateRequests.push(request.url());
  });
  const sockets: string[] = []; page.on("websocket", (socket) => sockets.push(socket.url()));
  for (const path of ["/", "/login", "/friends", "/progression", "/training", "/solo", "/multiplayer"]) {
    await page.goto(`${path}?standalone=true&installed=1`);
    await expect(page.getByRole("heading", { name: gateTitle })).toBeVisible();
    await expect(page.locator(".coinche-global-header, audio, form")).toHaveCount(0);
    await page.waitForLoadState("networkidle");
  }
  expect(privateRequests).toEqual([]);
  expect(sockets).toEqual([]);
});

test("@pwa rotation keeps iPhone gated at 932px without reload", async ({ page }) => {
  await simulatePwaEnvironment(page, { ua: IPHONE_UA });
  await page.goto("/");
  for (const viewport of [{ width: 390, height: 844 }, { width: 932, height: 430 }, { width: 390, height: 844 }]) {
    await setMobileViewport(page, viewport);
    await expect(page.getByRole("heading", { name: gateTitle })).toBeVisible();
    await expect(page.locator(".coinche-global-header")).toHaveCount(0);
  }
  expect(await page.evaluate(() => performance.getEntriesByType("navigation").length)).toBe(1);
});

for (const mode of ["ios", "media"] as const) {
  test(`@pwa iPhone standalone via ${mode}: app, theme/audio, Solo and Multi`, async ({ page }) => {
    await simulatePwaEnvironment(page, { ua: IPHONE_UA, standalone: mode });
    const room = await installMobileRoomFixture(page);
    await setMobileViewport(page, { width: 932, height: 430 });
    await page.goto("/");
    await expect(page.locator(".coinche-global-header")).toBeVisible();
    await page.getByRole("button", { name: "Ouvrir le menu" }).click();
    await expect(page.getByRole("navigation", { name: "Navigation mobile" }).getByRole("link", { name: /Mobile fixture/ })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("heading", { name: gateTitle })).toHaveCount(0);
    await page.getByRole("switch", { name: "Activer le thème clair" }).click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
    await page.getByRole("button", { name: "Contrôles audio" }).click();
    await expect(page.locator(".coinche-audio-popover")).toBeVisible();
    await page.goto("/solo");
    await page.getByRole("button", { name: "Commencer la partie" }).click();
    await expect(page.locator(".coinche-scene-hand-card")).toHaveCount(8);
    room.start();
    await page.goto(room.path);
    await expect(page.locator(".coinche-game-scene")).toBeVisible();
    await expect(page.locator(".coinche-scene-hand-card")).toHaveCount(8);
  });
}

test("@pwa standalone display-mode updates without reload", async ({ page }) => {
  await simulatePwaEnvironment(page, { ua: IPHONE_UA });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: gateTitle })).toBeVisible();
  await page.evaluate(() => (window as unknown as { pwaTestChangeDisplayMode(value: boolean): void }).pwaTestChangeDisplayMode(true));
  await expect(page.locator(".coinche-global-header")).toBeVisible();
  await page.evaluate(() => (window as unknown as { pwaTestChangeDisplayMode(value: boolean): void }).pwaTestChangeDisplayMode(false));
  await expect(page.getByRole("heading", { name: gateTitle })).toBeVisible();
  await expect(page.locator(".coinche-global-header")).toHaveCount(0);
});

test("@pwa alternative iOS browser directs to Safari without a fake install button", async ({ page }) => {
  await simulatePwaEnvironment(page, { ua: `${IPHONE_UA} CriOS/130.0` });
  await page.goto("/");
  await expect(page.getByText("Ouvre cette page dans Safari pour installer KFFR.")).toBeVisible();
  await expect(page.getByRole("button")).toHaveCount(0);
});

test("@pwa Android native prompt uses a user gesture; installed browser remains gated", async ({ page }) => {
  await simulatePwaEnvironment(page, { ua: ANDROID_UA });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: gateTitle })).toBeVisible();
  await expect(page.getByText(/Dans le menu de ton navigateur/)).toBeVisible();
  // The gate can paint before its install-prompt effect is registered in WebKit.
  await page.waitForLoadState("networkidle");
  await page.evaluate(() => {
    Object.assign(window, { pwaPromptCalls: 0 });
    const event = new Event("beforeinstallprompt", { cancelable: true });
    Object.assign(event, { prompt: async () => { (window as unknown as { pwaPromptCalls: number }).pwaPromptCalls++; }, userChoice: Promise.resolve({ outcome: "accepted" }) });
    window.dispatchEvent(event);
  });
  const button = page.getByRole("button", { name: "Installer KFFR" });
  await expect(button).toBeVisible();
  expect(await page.evaluate(() => (window as unknown as { pwaPromptCalls: number }).pwaPromptCalls)).toBe(0);
  await button.focus(); await page.keyboard.press("Enter");
  expect(await page.evaluate(() => (window as unknown as { pwaPromptCalls: number }).pwaPromptCalls)).toBe(1);
  await page.evaluate(() => window.dispatchEvent(new Event("appinstalled")));
  await expect(page.getByRole("status")).toHaveText("KFFR est installé. Ouvre maintenant l’application depuis ton écran d’accueil.");
  await expect(page.locator(".coinche-global-header")).toHaveCount(0);
});

test("@pwa Android standalone allows the application", async ({ page }) => {
  await simulatePwaEnvironment(page, { ua: ANDROID_UA, standalone: "media" });
  await page.goto("/");
  await expect(page.locator(".coinche-global-header")).toBeVisible();
});

for (const device of [
  { name: "desktop Chrome", ua: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/130.0 Safari/537.36", platform: "Win32", touch: 0 },
  { name: "desktop Safari", ua: "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) Version/18.0 Safari/605.1.15", platform: "MacIntel", touch: 0 },
  { name: "desktop Firefox", ua: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Firefox/130.0", platform: "Win32", touch: 0 },
  { name: "iPad", ua: IPAD_UA, platform: "iPad", touch: 5 },
  { name: "iPadOS as Mac", ua: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) Version/18.0 Safari/605.1.15", platform: "MacIntel", touch: 5 },
  { name: "Android tablet", ua: "Mozilla/5.0 (Linux; Android 14; SM-X610) Chrome/130.0 Safari/537.36", platform: "Linux", touch: 5 },
  { name: "touch Windows laptop", ua: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/130.0 Safari/537.36", platform: "Win32", touch: 10 },
]) {
  test(`@pwa ${device.name} uses normal web app even at narrow width`, async ({ page }) => {
    await simulatePwaEnvironment(page, device);
    await setMobileViewport(page, { width: 390, height: 844 });
    await page.goto("/");
    await expect(page.locator(".coinche-global-header")).toBeVisible();
    await expect(page.getByRole("heading", { name: gateTitle })).toHaveCount(0);
  });
}

test("@pwa standalone real password login, refresh and reopen preserve the normal session", async ({ page, context }) => {
  await simulatePwaEnvironment(page, { ua: IPHONE_UA, standalone: "ios" });
  const fixture = await installMobileRoomFixture(page, { seedSession: false });
  let passwordRequests = 0;
  await page.route("**/auth/v1/token**", async (route) => {
    expect(new URL(route.request().url()).searchParams.get("grant_type")).toBe("password");
    expect(route.request().postDataJSON()).toMatchObject({ email: "mobile@example.test", password: "fixture-password" });
    passwordRequests++;
    await route.fulfill({ status: 200, json: fixture.session });
  });
  await page.goto("/login");
  await expect(page.getByRole("heading", { name: "Connexion", exact: true })).toBeVisible();
  await page.getByLabel("Email", { exact: true }).fill("mobile@example.test");
  await page.getByLabel("Mot de passe", { exact: true }).fill("fixture-password");
  await page.locator("form").getByRole("button", { name: "Se connecter", exact: true }).click();
  await expect(page).toHaveURL(/\/$/);
  expect(passwordRequests).toBe(1);
  await expect(page.getByRole("link", { name: /Mobile fixture/ }).first()).toBeVisible();
  await page.reload();
  await expect(page.getByRole("link", { name: /Mobile fixture/ }).first()).toBeVisible();
  const reopened = await context.newPage();
  await page.close();
  await simulatePwaEnvironment(reopened, { ua: IPHONE_UA, standalone: "ios" });
  await installMobileRoomFixture(reopened, { seedSession: false });
  await reopened.goto("/");
  await expect(reopened.getByRole("link", { name: /Mobile fixture/ }).first()).toBeVisible();
});

for (const standalone of [false, true]) {
  test(`@pwa actual PKCE callback completes; ${standalone ? "standalone app" : "browser stays gated"}`, async ({ page }) => {
    await simulatePwaEnvironment(page, { ua: IPHONE_UA, standalone: standalone ? "ios" : undefined });
    const fixture = await installMobileRoomFixture(page, { seedSession: false });
    await page.addInitScript(() => localStorage.setItem("sb-127-auth-token-code-verifier", "fixture-verifier"));
    let exchanges = 0;
    await page.route("**/auth/v1/token**", async (route) => {
      expect(new URL(route.request().url()).searchParams.get("grant_type")).toBe("pkce");
      expect(route.request().postDataJSON()).toMatchObject({ auth_code: "fixture-code", code_verifier: "fixture-verifier" });
      exchanges++;
      await route.fulfill({ status: 200, json: fixture.session });
    });
    await page.goto("/auth/callback?code=fixture-code&next=%2Ffriends");
    await expect(page).toHaveURL(/\/friends$/);
    expect(exchanges).toBe(1);
    if (standalone) await expect(page.locator(".coinche-global-header")).toBeVisible();
    else {
      await expect(page.getByRole("heading", { name: gateTitle })).toBeVisible();
      await expect(page.locator(".coinche-global-header")).toHaveCount(0);
    }
  });
}

test.describe("real worker offline integration", () => {
test.use({ serviceWorkers: "allow" });
for (const theme of ["dark", "light"] as const) {
test(`@pwa ${theme} offline cold navigation and retry cache no private application snapshots`, async ({ page, baseURL }) => {
  const proxy = await createNetworkProxy(baseURL!);
  try {
  await simulatePwaEnvironment(page, { ua: IPHONE_UA, standalone: "ios" });
  const preferences = clonePlayerPreferences(); preferences.visual.theme = theme;
  await page.addInitScript(({ key, preferences }) => localStorage.setItem(key, JSON.stringify(preferences)), { key: PLAYER_PREFERENCES_STORAGE_KEY, preferences });
  await page.goto(proxy.url);
  await expect(page.locator(".coinche-global-header")).toBeVisible();
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller) await new Promise<void>((resolve) => navigator.serviceWorker.addEventListener("controllerchange", () => resolve(), { once: true }));
  });
  const cacheUrls = await page.evaluate(async () => {
    const result: string[] = [];
    for (const key of await caches.keys()) for (const request of await (await caches.open(key)).keys()) result.push(new URL(request.url).pathname);
    return result;
  });
  expect(cacheUrls).toEqual(["/pwa-offline.html"]);
  proxy.setConnected(false);
  await page.evaluate(() => window.dispatchEvent(new Event("offline")));
  await expect(page.getByRole("heading", { name: "Connexion nécessaire" })).toBeVisible();
  await expect(page.locator(".coinche-global-header")).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole("heading", { name: "Connexion nécessaire" })).toBeVisible();
  await expect(page).toHaveTitle("Connexion nécessaire | KFFR");
  await expect(page.locator('script[src*="_next"]')).toHaveCount(0);
  await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
  await expect(page.locator("body")).toHaveCSS("background-color", theme === "dark" ? "rgb(6, 18, 13)" : "rgb(238, 234, 222)");
  await expect(page.getByRole("button", { name: "Réessayer" })).toBeVisible();
  await Promise.all([page.waitForEvent("load"), page.getByRole("button", { name: "Réessayer" }).click()]);
  await expect(page.getByRole("heading", { name: "Connexion nécessaire" })).toBeVisible();
  proxy.setConnected(true);
  await Promise.all([page.waitForEvent("load"), page.getByRole("button", { name: "Réessayer" }).click()]);
  await expect(page.locator(".coinche-global-header")).toBeVisible();
  } finally { await page.close(); await proxy.close(); }
});
}
});

test("@pwa misleading offline signal is verified against an actual network response", async ({ page }) => {
  await simulatePwaEnvironment(page, { ua: IPHONE_UA, standalone: "ios" });
  await page.addInitScript(() => Object.defineProperty(navigator, "onLine", { configurable: true, value: false }));
  await page.goto("/");
  await expect(page.locator(".coinche-global-header")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Connexion nécessaire" })).toHaveCount(0);
  await page.evaluate(() => window.dispatchEvent(new Event("pageshow")));
  await expect(page.locator(".coinche-global-header")).toBeVisible();
});

test("@pwa an actual network failure overrides a misleading online signal", async ({ page }) => {
  await simulatePwaEnvironment(page, { ua: IPHONE_UA, standalone: "ios" });
  await page.goto("/");
  await expect(page.locator(".coinche-global-header")).toBeVisible();
  await page.waitForLoadState("networkidle");
  await page.route("**/api/pwa/connectivity", (route) => route.abort("failed"));
  expect(await page.evaluate(() => navigator.onLine)).toBe(true);
  await page.evaluate(() => window.dispatchEvent(new Event("offline")));
  await expect(page.getByRole("heading", { name: "Connexion nécessaire" })).toBeVisible({ timeout: 10_000 });
  await expect(page.locator(".coinche-global-header")).toHaveCount(0);
  await page.unroute("**/api/pwa/connectivity");
  await page.getByRole("button", { name: "Réessayer" }).click();
  await expect(page.locator(".coinche-global-header")).toBeVisible();
});
