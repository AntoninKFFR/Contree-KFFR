import { expect, type Locator, type Page } from "@playwright/test";

export const MOBILE_VIEWPORTS = [
  { width: 320, height: 568 }, { width: 375, height: 667 },
  { width: 390, height: 844 }, { width: 430, height: 932 },
  { width: 568, height: 320 }, { width: 667, height: 375 },
  { width: 844, height: 390 }, { width: 932, height: 430 },
] as const;
export const DESKTOP_VIEWPORTS = [{ width: 1120, height: 800 }, { width: 1440, height: 900 }] as const;
export type SafeAreas = { top: number; right: number; bottom: number; left: number };
export const NO_SAFE_AREAS: SafeAreas = { top: 0, right: 0, bottom: 0, left: 0 };

export async function setMobileViewport(page: Page, viewport: { width: number; height: number }) {
  await page.setViewportSize(viewport);
  // CSS media queries and React's existing orientation observers both settle before assertions.
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
}

export async function simulateSafeAreas(page: Page, areas: SafeAreas) {
  await page.evaluate((values) => {
    for (const [edge, value] of Object.entries(values)) document.documentElement.style.setProperty(`--safe-${edge}`, `${value}px`);
  }, areas);
}

export async function scrollDocumentToEnd(page: Page) {
  await page.evaluate(async () => {
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    window.scrollTo(0, document.documentElement.scrollHeight);
    await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
  });
}

export async function expectNoPageHorizontalOverflow(page: Page) {
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth), {
    message: "document width <= viewport (no global clipping)",
  }).toBeLessThanOrEqual(0);
}

export async function expectInsideSafeViewport(page: Page, locator: Locator, areas: SafeAreas = NO_SAFE_AREAS) {
  await expect(locator).toBeVisible();
  // Geometry assertions include animated overlays; let their existing entry motion settle.
  await expect.poll(async () => {
    const box = await locator.boundingBox();
    const viewport = page.viewportSize()!;
    return Boolean(box && box.x >= areas.left - 1 && box.y >= areas.top - 1
      && box.x + box.width <= viewport.width - areas.right + 1
      && box.y + box.height <= viewport.height - areas.bottom + 1);
  }).toBe(true);
  const box = await locator.boundingBox();
  const viewport = page.viewportSize()!;
  expect(box).not.toBeNull();
  expect(box!.x).toBeGreaterThanOrEqual(areas.left - 1);
  expect(box!.y).toBeGreaterThanOrEqual(areas.top - 1);
  expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width - areas.right + 1);
  expect(box!.y + box!.height).toBeLessThanOrEqual(viewport.height - areas.bottom + 1);
}

/** The fan deliberately extends below the safe table; verify its visible hit area. */
export async function expectHandTouchTarget(page: Page, card: Locator, areas: SafeAreas = NO_SAFE_AREAS) {
  await expect(card).toBeVisible();
  await expect.poll(() => card.evaluate((button, safe) => {
    const box = button.getBoundingClientRect();
    const table = button.closest(".coinche-game-scene")!.getBoundingClientRect();
    const left = Math.max(box.left, table.left, safe.left);
    const right = Math.min(box.right, table.right, innerWidth - safe.right);
    const top = Math.max(box.top, table.top, safe.top);
    const bottom = Math.min(box.bottom, table.bottom, innerHeight - safe.bottom);
    let hits = 0;
    for (let y = top + 2; y < bottom; y += 4) for (let x = left + 2; x < right; x += 4) {
      const hit = document.elementFromPoint(x, y);
      if (hit && button.contains(hit)) hits++;
    }
    return right - left >= 44 && bottom - top >= 44 && hits * 16 >= 44 * 44;
  }, areas), { message: "each hand card retains at least 44 × 44px of visible, unobstructed touch area" }).toBe(true);
}
