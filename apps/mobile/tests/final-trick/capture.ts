import type { expect as expectType, Page } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import fixtures from "./states.json";
import { clonePlayerPreferences, PLAYER_PREFERENCES_STORAGE_KEY } from "../../../../lib/preferences/playerPreferences";
import type { MultiplayerRoomView } from "../../src/multiplayer/contract";

export async function captureFinalTrick(expect: typeof expectType, page: Page, native: boolean, mode: "solo" | "multiplayer", kind: "round" | "game", width: number) {
  const viewport = { width, height: width === 568 ? 320 : width === 844 ? 390 : 430 };
  const before = structuredClone(fixtures[kind].before[0]) as MultiplayerRoomView, after = structuredClone(fixtures[kind].after[0]) as MultiplayerRoomView;
  for (const value of [before, after]) value.room.presentation_settings = { gameSpeed: "custom", autoCollectTricks: true, trickDisplayMs: 1500 };
  const preferences = clonePlayerPreferences(); preferences.gameplay.trickDisplayMs = 1500; preferences.gameplay.botDelayMs = 2000;
  await page.setViewportSize(viewport);
  await page.addInitScript(({ preferences, key, before, after }) => {
    localStorage.setItem(key, JSON.stringify(preferences));
    Object.assign(globalThis, { __nativeHandSequence: [before.game, after.game], __nativeFinalRoomSequence: [before, after] });
  }, { preferences, key: PLAYER_PREFERENCES_STORAGE_KEY, before, after });
  let current = before, mutations = 0;
  if (!native) await page.route(mode === "solo" ? "**/api/solo/sessions**" : "**/api/multiplayer/rooms/**", async (route) => {
    const body = route.request().postDataJSON();
    if (body?.intent?.type === "play-card" || body?.intent?.action?.type === "play-card") {
      mutations++; await new Promise((resolve) => setTimeout(resolve, 700)); current = after;
    }
    await route.fulfill({ json: { data: mode === "solo" ? { id: "33333333-3333-4333-8333-333333333333", version: current.room.state_version, state: current.game } : current } });
  });
  await page.goto(native ? `http://127.0.0.1:8091/?screen=${mode}&multi=start&parity=start&motion=1&trickMs=1500&postDelay=700`
    : mode === "solo" ? "http://127.0.0.1:3100/solo" : `http://127.0.0.1:3100/multiplayer/${before.room.id}`);
  if (native && mode === "multiplayer") await page.getByRole("button", { name: "Rouvrir la dernière table de cet appareil" }).click();
  if (!native && mode === "solo") await page.getByRole("button", { name: "Commencer la partie", exact: true }).click();
  const cards = page.locator(native ? '[data-testid^="solo-play-"]' : ".coinche-trick-card");
  const result = page.locator(native ? '[data-testid="solo-round-result"]' : kind === "game" && mode === "multiplayer" ? '[aria-label="Résultat de la partie"]' : '[aria-label="Résultat de la manche"]');
  await expect(cards).toHaveCount(3); await expect(result).toHaveCount(0);
  const table = page.locator(native ? '[data-testid="solo-card-table"]' : ".coinche-game-scene");
  const geometry = await table.boundingBox();
  const directory = process.env.FINAL_TRICK_CAPTURE_DIR ?? (native ? "geometry-results/final-trick" : "test-results/final-trick");
  mkdirSync(directory, { recursive: true });
  const prefix = `${native ? "native" : "web"}-${mode}-${kind}-${width}`;
  const capture = (stage: string) => page.screenshot({ animations: "allow", path: join(directory, `${prefix}-${stage}.png`) });
  await capture("1-third");
  await page.evaluate(({ native, resultSelector }) => {
    const timeline = { confirmedAt: null as number | null, resultAt: null as number | null };
    Object.assign(globalThis, { __captureFinalTimeline: timeline });
    const sample = () => {
      const count = document.querySelectorAll(native ? '[data-testid^="solo-play-"]' : ".coinche-trick-card").length;
      const result = document.querySelector(resultSelector);
      const phase = document.querySelector("[data-game-phase]")?.getAttribute("data-game-phase");
      if (count === 4 && !result && (native || phase === "finished" || phase === "game-over")) timeline.confirmedAt ??= performance.now();
      if (result) { timeline.resultAt = performance.now(); return; }
      requestAnimationFrame(sample);
    }; sample();
  }, { native, resultSelector: native ? '[data-testid="solo-round-result"]' : kind === "game" && mode === "multiplayer" ? '[aria-label="Résultat de la partie"]' : '[aria-label="Résultat de la manche"]' });
  const acknowledged = native ? null : page.waitForResponse((response) => response.request().method() === "POST" && response.request().postData()?.includes('"play-card"') === true && response.ok());
  const target = page.locator(native ? '[data-testid="solo-hand"] [role="button"]:not([aria-disabled="true"])' : '.coinche-human-hand button[data-playable="true"]:not([disabled])').first();
  if (native) {
    const point = await target.evaluate((node) => { const b = node.getBoundingClientRect(); for (const y of [.2, .3, .4]) for (const x of [.3, .4, .5]) { const px = b.x + b.width * x, py = b.y + b.height * y; if (node.contains(document.elementFromPoint(px, py))) return { x: px, y: py }; } throw new Error("No visible native card touch point"); });
    await page.touchscreen.tap(point.x, point.y);
  } else await target.click();
  if (native) await expect.poll(() => page.evaluate((mode) => {
    const value = globalThis as unknown as { __soloFixture: { current: () => { state: { phase: string } } }; __multiplayerFixture: { current: () => { game: { phase: string } } } };
    return mode === "solo" ? value.__soloFixture.current().state.phase : value.__multiplayerFixture.current().game.phase;
  }, mode)).toBe(after.game!.phase);
  else await acknowledged;
  await expect(cards).toHaveCount(4);
  if (process.env.FINAL_TRICK_BASELINE === "1") await capture("baseline-premature-result");
  await expect(result).toHaveCount(0);
  expect(await table.boundingBox()).toEqual(geometry);
  await expect.poll(() => page.evaluate(() => (globalThis as unknown as { __captureFinalTimeline: { confirmedAt: number | null } }).__captureFinalTimeline.confirmedAt)).not.toBeNull();
  const waitUntil = async (target: number) => {
    const elapsed = await page.evaluate(() => performance.now() - (globalThis as unknown as { __captureFinalTimeline: { confirmedAt: number } }).__captureFinalTimeline.confirmedAt);
    await page.waitForTimeout(Math.max(0, target - elapsed));
  };
  await page.waitForTimeout(70); await capture("2-fourth");
  await waitUntil(330); await capture("3-complete");
  await waitUntil(1320); await expect(result).toHaveCount(0); await capture("4-collection"); await expect(result).toHaveCount(0);
  await expect(result).toBeVisible(); await page.waitForTimeout(250); await capture("5-result");
  if (native) mutations = await page.evaluate((mode) => {
    const value = globalThis as unknown as { __soloFixture: { requests: { body: { intent?: { type: string } } | null }[] }; __multiplayerFixture: { requests: { body: { intent?: { action?: { type: string } } } | null }[] } };
    return mode === "solo" ? value.__soloFixture.requests.filter((r) => r.body?.intent?.type === "play-card").length : value.__multiplayerFixture.requests.filter((r) => r.body?.intent?.action?.type === "play-card").length;
  }, mode);
  expect(mutations).toBe(1);
  const timeline = await page.evaluate(() => (globalThis as unknown as { __captureFinalTimeline: { confirmedAt: number; resultAt: number } }).__captureFinalTimeline);
  expect(timeline.resultAt - timeline.confirmedAt).toBeGreaterThan(1400);
  writeFileSync(join(directory, `${prefix}.json`), JSON.stringify({ renderer: native ? "actual React Native Web components; test HTTP; not physical iPhone" : "actual Next.js components; test HTTP", viewport, mode, kind, delayMs: 1500, timeline, mutations, winner: after.game!.completedTricks.at(-1)!.winnerId, totalScore: after.game!.totalScore, roundHistoryTotal: after.game!.roundHistory.at(-1)!.totalScoreAfterRound }, null, 2));
}
