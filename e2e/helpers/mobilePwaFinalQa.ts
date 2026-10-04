import { expect, test as base, type Locator, type Page, type TestInfo } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { monitorBrowserErrors } from "./browserErrors";
import { expectInsideSafeViewport, NO_SAFE_AREAS, type SafeAreas } from "./mobile";
import { installHomeProgressionFixture } from "./homeProgressionFixture";
import { installFriendsMobileFixture } from "./friendsMobileFixture";
import { installMultiplayerMobileFixture } from "./multiplayerMobileFixture";
import { permanentMissionKeys } from "../../lib/progression/permanentMissions";
import { withEquipment } from "../../tests/helpers/profileCosmetics";

export async function installFinalQaFixture(page: Page, theme: "dark" | "light" = "dark", standalone = true) {
  // One auth/preferences bootstrap across actual route changes. Existing helpers
  // supply the public projections; authenticated server suites remain separate.
  const home = await installHomeProgressionFixture(page, { theme, xp: 22750, standalone, preservePreferencesOnReload: true });
  const friends = await installFriendsMobileFixture(page, { theme, count: 20 }, home);
  const lobby = await installMultiplayerMobileFixture(page, { theme, players: 4, ready: true, offline: true }, home);
  await page.route("**/rest/v1/rpc/get_my_permanent_missions", route => route.fulfill({ status: 200,
    json: permanentMissionKeys.map(key => ({ key, rewardXp: 100, completed: false, completedAt: null })), headers: {
      "Access-Control-Allow-Origin": route.request().headers().origin ?? "*",
      "Access-Control-Allow-Headers": route.request().headers()["access-control-request-headers"] ?? "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    } }));
  await page.route("**/api/social/friends/*/profile", async route => {
    const friend = friends.snapshot.friends.find(friend => friend.userId === new URL(route.request().url()).pathname.split("/").at(-2));
    if (!friend) { await route.fallback(); return; }
    const stats = { games: 12, wins: 7, losses: 5, winrate: 58 };
    const cosmetics = withEquipment(20);
    const equipped = Object.fromEntries(Object.entries(cosmetics.equipped).map(([slot, key]) => [slot, cosmetics.items.find(item => item.key === key) ?? null]));
    await route.fulfill({ status: 200, json: { data: { ...friend, equipped, solo: stats, multiplayer: stats, rating: null } } });
  });
  return { home, friends, lobby };
}

export async function expectMinTouchTarget(control: Locator, minimum = 44) {
  await expect(control).toBeVisible();
  const box = await control.boundingBox();
  expect(box, "touch target has a bounding box").not.toBeNull();
  // DOMRect subtraction can report 43.999969 for a CSS 44px control.
  // Round only floating-point noise, retaining subpixel failures below 43.9995.
  expect(Number(box!.width.toFixed(3)), "touch target width").toBeGreaterThanOrEqual(minimum);
  expect(Number(box!.height.toFixed(3)), "touch target height").toBeGreaterThanOrEqual(minimum);
}

export async function expectNoNestedPageScroll(page: Page) {
  const scrollers = await page.locator("main, .coinche-page-shell, .coinche-app-page, .coinche-game-shell").evaluateAll(elements => elements
    .filter(element => /^(auto|scroll)$/.test(getComputedStyle(element).overflowY) && element.scrollHeight > element.clientHeight + 1)
    .map(element => ({ tag: element.tagName, classes: element.className })));
  // Presence lists and explicit dialog/drawer interiors are intentionally not
  // page shells. They have their own specialized scroll/focus assertions.
  expect(scrollers, "no second vertical page scroller").toEqual([]);
}

export function qaSafeAreas(width: number, height: number, rightNotch = false): SafeAreas {
  return width < height ? { top: 47, bottom: 34, left: 0, right: 0 }
    : { top: 0, bottom: rightNotch ? 21 : 34, left: rightNotch ? 0 : 44, right: rightNotch ? 44 : 0 };
}

type QaCheckpoint = { scenario: string; route: string; viewport: { width: number; height: number }; theme: string | null;
  overflow: { horizontal: number; vertical: number }; header: { variant: string | null; height: number } | null };
type QaMonitor = {
  checkpoint: (scenario: string) => Promise<void>;
  control: (control: Locator, safe?: SafeAreas, reachable?: boolean) => Promise<void>;
};

export const test = base.extend<{ qa: QaMonitor }>({
  qa: [async ({ page }, use, info) => {
    const browser = monitorBrowserErrors(page);
    const networkErrors: string[] = [];
    const apiErrors: string[] = [];
    const checkpoints: QaCheckpoint[] = [];
    const touches: { label: string; width: number; height: number }[] = [];
    const businessRequest = (url: string) => {
      const parsed = new URL(url);
      return parsed.pathname.startsWith("/api/") || parsed.origin === "http://127.0.0.1:54321";
    };
    page.on("requestfailed", request => {
      const failure = request.failure()?.errorText ?? "unknown";
      // Native cancellation during route changes is observable, but is not a
      // failed business operation. No response/body/auth data is recorded.
      if (businessRequest(request.url()) && !/^(net::ERR_ABORTED|cancelled|Load request cancelled)$/.test(failure)) {
        networkErrors.push(`${request.method()} ${new URL(request.url()).pathname}: ${failure}`);
      }
    });
    page.on("response", response => {
      if (businessRequest(response.url()) && response.status() >= 400) {
        apiErrors.push(`${response.status()} ${new URL(response.url()).pathname}`);
      }
    });
    const monitor: QaMonitor = {
      async checkpoint(scenario) {
        await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth), {
          message: "global page horizontal overflow <= 1px",
        }).toBeLessThanOrEqual(1);
        await expectNoNestedPageScroll(page);
        checkpoints.push(await page.evaluate(scenario => {
          const header = document.querySelector(".coinche-global-header");
          return { scenario, route: location.pathname + location.hash, viewport: { width: innerWidth, height: innerHeight },
            theme: document.documentElement.dataset.theme ?? null,
            overflow: { horizontal: document.documentElement.scrollWidth - document.documentElement.clientWidth,
              vertical: document.documentElement.scrollHeight - document.documentElement.clientHeight },
            header: header ? { variant: header.getAttribute("data-header-variant"), height: header.getBoundingClientRect().height } : null };
        }, scenario));
      },
      async control(control, safe = NO_SAFE_AREAS, reachable = false) {
        if (reachable) await control.evaluate(element => element.scrollIntoView({ block: "center" }));
        await expectMinTouchTarget(control);
        await expectInsideSafeViewport(page, control, safe);
        await expect.poll(() => control.evaluate(element => {
          const box = element.getBoundingClientRect();
          const hit = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
          return hit === element || element.contains(hit);
        }), { message: "critical control center is exposed" }).toBe(true);
        const box = (await control.boundingBox())!;
        touches.push({ label: await control.getAttribute("aria-label") ?? (await control.textContent() ?? "").trim().slice(0, 80),
          width: box.width, height: box.height });
      },
    };
    try { await use(monitor); }
    finally {
      const errors = browser.snapshot();
      const failed = info.status !== info.expectedStatus || errors.length > 0 || networkErrors.length > 0 || apiErrors.length > 0;
      const report = { engine: info.project.name, scenario: info.title, retry: info.retry, status: failed ? "failed" : "passed",
        checkpoints, consoleErrors: errors, networkErrors, apiErrors, touches,
        touchFailures: info.errors.filter(error => /touch target/.test(error.message ?? "")).map(error => error.message) };
      const path = info.outputPath("mobile-pwa-qa-report.json");
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, JSON.stringify(report, null, 2));
      await info.attach("mobile-pwa-qa-report", { path, contentType: "application/json" });
      browser.assertClean();
      expect(apiErrors, "unexpected business API HTTP errors").toEqual([]);
      expect(networkErrors, "unexpected business request failures").toEqual([]);
    }
  }, { auto: true }],
});

export async function captureQaSnapshot(page: Page, info: TestInfo, route: string, state: string) {
  await page.evaluate(async () => {
    await document.fonts.ready;
    const finite = document.getAnimations().filter(animation => animation.effect?.getComputedTiming().iterations !== Infinity);
    await Promise.all(finite.map(animation => animation.finished.catch(() => undefined)));
  });
  const theme = await page.locator("html").getAttribute("data-theme");
  const { width, height } = page.viewportSize()!;
  const engine = info.project.name === "mobile-webkit" ? "webkit" : "chromium";
  const name = `qa-${route}-${state}-${theme}-${width}x${height}-${engine}.png`;
  const path = info.outputPath(name);
  await page.screenshot({ path });
  await info.attach(name, { path, contentType: "image/png" });
}
