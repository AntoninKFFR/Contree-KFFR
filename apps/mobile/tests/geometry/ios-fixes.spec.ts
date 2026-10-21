import { test, expect, type Locator, type Page } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { handSequence } from "../hand-sequence";
import { SUIT_LABELS } from "../../../../engine/cards";
const baseline = process.env.IOS_FIX_BASELINE === "1";
const evidence = process.env.IOS_FIX_CAPTURE_DIR ?? "geometry-results/ios-fixes";
test.use({ hasTouch: true });
const intents = (page: Page) => page.evaluate(() => (globalThis as unknown as { __multiplayerFixture: { requests: { body: { intent?: unknown } | null }[] } }).__multiplayerFixture.requests.flatMap((r) => r.body?.intent ? [r.body.intent] : []));
async function tapVisibleCard(page: Page, card: Locator) {
  // Native touch never scrolls an overflow:hidden fan to expose its clipped
  // bottom edge. Use a real visible touch point, rather than click's auto-scroll.
  const point = await card.evaluate((node) => {
    const b = node.getBoundingClientRect();
    for (const y of [.2, .3, .4]) for (const x of [.3, .4, .5]) {
      const px = b.x + b.width * x, py = b.y + b.height * y;
      if (node.contains(document.elementFromPoint(px, py))) return { x: px, y: py };
    }
    throw new Error("Card has no visible touch point");
  });
  await page.touchscreen.tap(point.x, point.y);
}

for (const viewport of [{ width: 568, height: 320 }, { width: 844, height: 390 }, { width: 932, height: 430 }]) for (const side of ["left", "right"]) {
  test(`lobby actual touch selects each free seat ${viewport.width} ${side}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    for (const seat of [0, 1, 2, 3]) {
      const host = (seat + 1) % 4;
      await page.goto(`/?screen=multiplayer&multi=lobby-free&guest=1&hostSeat=${host}&postDelay=500&left=${side === "left" ? 59 : 0}&right=${side === "right" ? 59 : 0}`);
      await page.getByRole("button", { name: "Rouvrir la dernière table de cet appareil" }).click();
      const target = page.getByTestId(`lobby-seat-${seat}`);
      await expect(target).toBeEnabled();
      const box = (await target.boundingBox())!;
      expect(box.width).toBeGreaterThanOrEqual(128); expect(box.height).toBeGreaterThanOrEqual(baseline ? 54 : 64);
      // Probe the full visible target, not just its center or its CSS geometry.
      const uncovered = await target.evaluate((node) => {
        const b = node.getBoundingClientRect();
        return [.1, .5, .9].flatMap((x) => [.15, .5, .85].map((y) => node.contains(document.elementFromPoint(b.x + b.width * x, b.y + b.height * y))));
      });
      expect(uncovered).toEqual(Array(9).fill(true));
      await page.touchscreen.tap(box.x + box.width * .1, box.y + box.height * .85);
      await expect.poll(() => intents(page)).toEqual([{ type: "join-seat", seatIndex: seat }]);
      if (!baseline) await expect(target).toContainText("Réservation…");
      await expect(target).toContainText("Moi");
      if (!baseline) await expect(target).toHaveAttribute("aria-selected", "true");
      const before = await intents(page);
      const occupied = page.getByTestId(`lobby-seat-${host}`); await expect(occupied).toBeDisabled();
      const occupiedBox = (await occupied.boundingBox())!;
      await page.touchscreen.tap(occupiedBox.x + 20, occupiedBox.y + 20);
      expect(await intents(page)).toEqual(before);
      mkdirSync(evidence, { recursive: true });
      await page.screenshot({ path: join(evidence, `lobby-${viewport.width}-${side}-${seat}.png`) });
    }
  });
}

test("lobby moves directly to a free seat, and a rejected reservation keeps the authoritative seat", async ({ page }) => {
  await page.goto("/?screen=multiplayer&multi=lobby-free&postDelay=400");
  await page.getByRole("button", { name: "Rouvrir la dernière table de cet appareil" }).click();
  await page.getByTestId("lobby-seat-2").tap();
  await expect(page.getByTestId("lobby-seat-2")).toContainText("Moi");
  await expect(page.getByTestId("lobby-seat-0")).toContainText("Place libre");
  expect(await intents(page)).toEqual([{ type: "join-seat", seatIndex: 2 }]);
  await page.goto("/?screen=multiplayer&multi=lobby-free&postDelay=400&seatConflict=1");
  await page.getByRole("button", { name: "Rouvrir la dernière table de cet appareil" }).click();
  await page.getByTestId("lobby-seat-2").tap();
  await expect(page.getByRole("alert")).toHaveText("Cette place n'est plus libre.");
  await expect(page.getByTestId("lobby-seat-0")).toContainText("Moi");
  await expect(page.getByTestId("lobby-seat-2")).not.toHaveAttribute("aria-selected", "true");
  expect(await intents(page)).toEqual([{ type: "join-seat", seatIndex: 2 }]);
});

for (const viewport of [{ width: 568, height: 320 }, { width: 844, height: 390 }, { width: 932, height: 430 }]) for (const side of ["left", "right"]) test(`lobby error banner leaves the next free seat visible and touchable ${viewport.width} ${side}`, async ({ page }) => {
  await page.setViewportSize(viewport);
  await page.goto(`/?screen=multiplayer&multi=lobby-free&postDelay=400&seatConflict=1&left=${side === "left" ? 59 : 0}&right=${side === "right" ? 59 : 0}`);
  await page.getByRole("button", { name: "Rouvrir la dernière table de cet appareil" }).click();
  await page.getByTestId("lobby-seat-1").tap();
  await expect(page.getByRole("alert")).toHaveText("Cette place n'est plus libre.");
  const target = page.getByTestId("lobby-seat-2");
  const reachesSeat = await target.evaluate((node) => { const b = node.getBoundingClientRect(); return node.contains(document.elementFromPoint(b.x + b.width / 2, b.y + b.height / 2)); });
  expect(reachesSeat).toBe(!baseline);
  if (!baseline) {
    const banner = (await page.getByTestId("multiplayer-notice").boundingBox())!;
    const seat = (await target.boundingBox())!;
    expect(banner.y + banner.height).toBeLessThanOrEqual(seat.y);
    await expect(page.getByRole("button", { name: "Recharger", exact: true })).toBeEnabled();
  }
  mkdirSync(evidence, { recursive: true }); await page.screenshot({ path: join(evidence, `lobby-error-banner-${viewport.width}-${side}.png`) });
  if (!baseline) {
    const box = (await target.boundingBox())!; await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
    await expect.poll(() => intents(page)).toEqual([{ type: "join-seat", seatIndex: 1 }, { type: "join-seat", seatIndex: 2 }]);
    await expect(target).toContainText("Moi");
    await expect(page.getByTestId("lobby-seat-1")).toContainText("Autre joueur");
  }
});

for (const mode of ["solo", "multiplayer"]) for (const motion of ["on", "reduced", "off"]) test(`${mode} fan reflows 8 to 1 with stable cards and ${motion} motion`, async ({ page }) => {
  const { states, plays } = handSequence();
  await page.addInitScript((states) => { Object.assign(globalThis, { __nativeHandSequence: states }); }, states);
  await page.setViewportSize({ width: 844, height: 390 });
  await page.goto(`/?screen=${mode}&parity=start&multi=start&postDelay=400&perf=1&motion=${motion === "reduced" ? 0 : 1}&animations=${motion === "off" ? 0 : 1}`);
  if (mode === "multiplayer") await page.getByRole("button", { name: "Rouvrir la dernière table de cet appareil" }).click();
  const cards = page.getByTestId("solo-hand-card"); await expect(cards).toHaveCount(8);
  // Finish only the initial deal. Stable keyed nodes must survive every later play.
  await page.waitForTimeout(500);
  mkdirSync(evidence, { recursive: true });
  await page.screenshot({ path: join(evidence, `fan-${mode}-${motion}-8.png`) });
  const measurements = [];
  for (let count = 8; count > 1; count--) {
    const play = plays[8 - count], label = `Jouer ${play.rank} ${SUIT_LABELS[play.suit]}`;
    const retained = page.getByRole("button", { name: /^Jouer / });
    const labels = await retained.evaluateAll((nodes) => nodes.map((n) => n.getAttribute("aria-label")!));
    const watch = labels.find((l) => l !== label)!;
    await page.getByRole("button", { name: watch, exact: true }).evaluate((node) => {
      const probe = { node, frame: node.parentElement!, samples: [] as { x: number; count: number; left: string; time: number }[], active: true };
      Object.assign(globalThis, { __fanProbe: probe });
      const tick = () => { if (!probe.active) return; const b = node.getBoundingClientRect(); probe.samples.push({ x: b.x, count: document.querySelectorAll('[data-testid="solo-hand-card"]').length, left: getComputedStyle(node.closest('[data-testid="solo-hand-card"]')!).left, time: performance.now() }); requestAnimationFrame(tick); }; tick();
    });
    await tapVisibleCard(page, page.getByRole("button", { name: label, exact: true }));
    await expect(page.getByTestId("solo-pending-card")).toBeVisible();
    await expect(cards).toHaveCount(count - 1);
    if (count === 8 && motion === "on") {
      await page.waitForTimeout(40);
      await page.screenshot({ animations: "allow", path: join(evidence, `fan-${mode}-intermediate.png`) });
    }
    await page.waitForTimeout(motion === "on" ? 190 : 20);
    const result = await page.getByRole("button", { name: watch, exact: true }).evaluate((node) => {
      const p = (globalThis as unknown as { __fanProbe: { node: Element; frame: Element; active: boolean; samples: { x: number; count: number; left: string; time: number }[] } }).__fanProbe; p.active = false;
      return { stableNode: p.node === node && p.frame === node.parentElement, samples: p.samples };
    });
    expect(result.stableNode).toBe(true);
    const start = result.samples[0].x, end = result.samples.at(-1)!.x, distance = Math.abs(end - start);
    const intermediate = result.samples.some((s) => s.count === count - 1 && Math.abs(s.x - start) > distance * .1 && Math.abs(s.x - end) > distance * .1);
    if (!baseline) expect(result.samples.every((s) => s.left === "0px")).toBe(true);
    const layoutJump = Math.abs(parseFloat(result.samples[0].left) - parseFloat(result.samples.at(-1)!.left));
    if (motion === "on") { expect(distance).toBeGreaterThan(10); if (baseline) expect(layoutJump).toBeGreaterThan(10); else expect(intermediate).toBe(true); }
    const largestFrameDelta = Math.max(...result.samples.slice(1).map((s, i) => Math.abs(s.x - result.samples[i].x)));
    measurements.push({ count, start, end, intermediate, layoutJump, largestFrameDelta, samples: result.samples });
    await page.screenshot({ path: join(evidence, `fan-${mode}-${motion}-${count - 1}.png`) });
  }
  mkdirSync(evidence, { recursive: true }); writeFileSync(join(evidence, `fan-${mode}-${motion}.json`), JSON.stringify(measurements, null, 2));
  writeFileSync(join(evidence, `renders-${mode}-${motion}.json`), JSON.stringify(await page.evaluate(() => (globalThis as unknown as { __nativeRenderMetrics: unknown }).__nativeRenderMetrics), null, 2));
  await page.screenshot({ path: join(evidence, `fan-${mode}-${motion}.png`) });
});

for (const mode of ["solo", "multiplayer"]) test(`${mode} animated refused card returns without remounting or replaying the POST`, async ({ page }) => {
  await page.setViewportSize({ width: 844, height: 390 });
  await page.goto(`/?screen=${mode}&parity=start&multi=start&seat=${mode === "multiplayer" ? 3 : 0}&motion=1&postDelay=700&refuse=1&solo=action-error`);
  if (mode === "multiplayer") await page.getByRole("button", { name: "Rouvrir la dernière table de cet appareil" }).click();
  const playable = page.getByRole("button", { name: /^Jouer /, disabled: false }).first(); await expect(playable).toBeEnabled();
  const label = (await playable.getAttribute("aria-label"))!;
  const card = page.getByRole("button", { name: label, exact: true });
  await page.waitForTimeout(500);
  const before = await card.evaluate((node) => { const wrapper = node.closest('[data-testid="solo-hand-card"]')!; Object.assign(globalThis, { __rollbackCard: wrapper }); const b = wrapper.getBoundingClientRect(); return { x: b.x, y: b.y }; });
  await tapVisibleCard(page, card); await expect(page.getByTestId("solo-pending-card")).toBeVisible();
  await expect(page.getByRole("progressbar")).toHaveCount(0);
  await expect(page.getByRole("alert")).toContainText("Action refusée");
  await expect(page.getByTestId("solo-pending-card")).toHaveCount(0);
  await expect(page.getByTestId("solo-hand-card")).toHaveCount(8);
  await expect.poll(() => card.evaluate((node) => {
    const wrapper = node.closest('[data-testid="solo-hand-card"]')!; const b = wrapper.getBoundingClientRect();
    return { stable: wrapper === (globalThis as unknown as { __rollbackCard: Element }).__rollbackCard, x: Math.round(b.x * 10) / 10, y: Math.round(b.y * 10) / 10 };
  })).toEqual({ stable: true, x: Math.round(before.x * 10) / 10, y: Math.round(before.y * 10) / 10 });
  const sent = mode === "multiplayer" ? await intents(page) : await page.evaluate(() => (globalThis as unknown as { __soloFixture: { requests: { method: string }[] } }).__soloFixture.requests.filter((r) => r.method === "POST"));
  expect(sent).toHaveLength(1);
  mkdirSync(evidence, { recursive: true }); await page.screenshot({ path: join(evidence, `rollback-${mode}.png`) });
});
