import { expect, type Page } from "@playwright/test";

export async function soloGeometry(page: Page, left = 47, right = 47, bottom = 21) {
  await expect(page.getByTestId("solo-screen")).toBeVisible();
  const measure = () => page.evaluate(({ left, right, bottom }) => {
    const errors: string[] = [], screen = document.querySelector('[data-testid="solo-screen"]')!;
    const bounds = { left, right: innerWidth - right, top: 0, bottom: innerHeight - bottom };
    if (document.documentElement.scrollWidth > innerWidth || document.documentElement.scrollHeight > innerHeight) errors.push("document overflow");
    for (const node of [screen, ...screen.querySelectorAll("*")]) {
      const style = getComputedStyle(node);
      if ([style.overflowX, style.overflowY].some((v) => ["scroll", "auto"].includes(v))) errors.push("main screen scrolls");
    }
    for (const button of screen.querySelectorAll('[role="button"]')) {
      if (button.closest('[aria-hidden="true"]')) continue;
      const box = button.getBoundingClientRect(); if (!box.width || !box.height) continue;
      const hand = button.closest('[data-testid="solo-hand"]');
      if (hand) {
        const table = button.closest('[data-testid="solo-card-table"]')!.getBoundingClientRect();
        const l = Math.max(box.left, table.left, bounds.left), r = Math.min(box.right, table.right, bounds.right), t = Math.max(box.top, table.top), b = Math.min(box.bottom, table.bottom, bounds.bottom);
        if (r - l < 44 || b - t < 44) errors.push("hand visible area under 44px: " + button.getAttribute("aria-label"));
        // Disabled RN Pressables intentionally ignore hits. Enabled cards must
        // retain at least 44*44 visible, unobstructed pixels in the clipped fan.
        if (button.getAttribute("aria-disabled") !== "true") {
          let hits = 0;
          for (let y = t + 2; y < b; y += 4) for (let x = l + 2; x < r; x += 4) { const hit = document.elementFromPoint(x, y); if (hit && button.contains(hit)) hits++; }
          if (hits * 16 < 44 * 44) errors.push("hand hit area under 44*44: " + button.getAttribute("aria-label"));
        }
      } else {
        if (box.width < 43.99 || box.height < 43.99) errors.push("control under 44px: " + button.textContent);
        if (box.left < bounds.left - 1 || box.right > bounds.right + 1 || box.top < -1 || box.bottom > bounds.bottom + 1) errors.push("control outside safe table: " + button.textContent);
        const hit = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
        if (button.getAttribute("aria-disabled") !== "true" && (!hit || !button.contains(hit))) errors.push("control covered: " + button.textContent);
      }
    }
    if (document.querySelector('[data-testid="game-navigation"]')) errors.push("unexpected navbar");
    return errors;
  }, { left, right, bottom });
  // Deal/play transitions are exercised elsewhere. Measure the settled fan,
  // including the last staggered card, with the same hit-area criterion as web.
  await expect.poll(measure).toEqual([]);
}
