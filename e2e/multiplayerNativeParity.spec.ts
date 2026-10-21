import { test, expect } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import states from "../apps/mobile/tests/multiplayer/states.json";
import { installMobileNavigationFixture } from "./helpers/mobileNavigationFixture";
import { simulateSafeAreas } from "./helpers/mobile";
import handFixtures from "../apps/mobile/tests/hand/states.json";
import { handDisplayMode, sortHandForDisplay } from "../lib/preferences/handSorting";
import { clonePlayerPreferences } from "../lib/preferences/playerPreferences";
import { SUIT_LABELS, SUIT_SYMBOLS } from "../engine/cards";
import type { PlayerGameView } from "../engine/views";
const dir = "apps/mobile/docs/multiplayer-151/captures";
for (const viewport of [{ width: 568, height: 320 }, { width: 844, height: 390 }, { width: 932, height: 430 }]) {
  for (const stage of ["landing", "lobby-free", "lobby-full", "bidding", "start", "trick", "last", "result"] as const) {
    for (const seat of stage === "landing" || stage.startsWith("lobby") ? [0] : [0, 1, 2, 3]) test(`multiplayer parity web ${viewport.width} ${stage} seat ${seat}`, async ({ page }) => {
      await page.clock.setFixedTime(new Date("2026-10-21T12:00:00Z"));
      await page.emulateMedia({ reducedMotion: "reduce" });
      await page.setViewportSize(viewport);
      const view = states[stage === "landing" ? "lobby-free" : stage][seat];
      await installMobileNavigationFixture(page, { username: view.players[seat].display_name ?? "Alice", notifications: false, reducedMotion: true });
      await page.route("**/api/multiplayer/rooms/**", (route) => route.fulfill({ json: { data: view } }));
      await page.goto(stage === "landing" ? "/multiplayer" : `/multiplayer/${view.room.id}`);
      await simulateSafeAreas(page, { top: 0, left: 47, right: 47, bottom: 21 });
      if (stage === "landing") await expect(page.getByRole("button", { name: "Créer la table", exact: true })).toBeEnabled();
      else if (stage.startsWith("lobby")) await expect(page.getByText(view.room.code, { exact: true }).first()).toBeVisible();
      else if (stage === "result") await expect(page.getByRole("heading", { name: /partie|victoire|défaite|gagn/gi }).first()).toBeVisible();
      else await expect(page.locator(".coinche-game-scene")).toBeVisible();
      if (stage === "last") await page.getByRole("button", { name: /Dernier pli/ }).click();
      await page.evaluate(async () => { await document.fonts.ready; const felt = new Image(); felt.src = "/TapisKFFR.png"; await felt.decode(); });
      mkdirSync(dir, { recursive: true });
      await page.screenshot({ animations: "disabled", path: `${dir}/web-${viewport.width}-${stage}-${seat}.png` });
      writeFileSync(`${dir}/web-${viewport.width}-${stage}-${seat}.json`, JSON.stringify({ fixtureDigest: createHash("sha256").update(JSON.stringify(view)).digest("hex"), viewport, seat, stage, renderer: "actual Next.js web components; public test fixture" }, null, 2));
    });
  }
}

for (const [stage, projections] of Object.entries(handFixtures.auction)) for (const seat of [0, 1, 2, 3]) {
  for (const mode of seat === 0 ? ["solo", "multiplayer"] : ["multiplayer"]) test(`auction sorting web/native ${mode} ${stage} seat ${seat}`, async ({ page, context }) => {
    const game = projections[seat] as unknown as PlayerGameView;
    const view = structuredClone(states.bidding[seat]); view.game = game as typeof view.game;
    view.room.game_phase = game.phase;
    const ordered = sortHandForDisplay(game.hand, clonePlayerPreferences().cards, handDisplayMode(game));
    await page.setViewportSize({ width: 844, height: 390 }); await page.emulateMedia({ reducedMotion: "reduce" });
    await page.clock.setFixedTime(new Date("2026-10-21T12:00:00Z"));
    await installMobileNavigationFixture(page, { username: "Test tri", notifications: false, reducedMotion: true });
    await page.route("**/api/multiplayer/rooms/**", (route) => route.fulfill({ json: { data: view } }));
    await page.goto(`/multiplayer/${view.room.id}`); await simulateSafeAreas(page, { top: 0, left: 47, right: 47, bottom: 21 });
    await expect(page.locator(".coinche-scene-hand-card button")).toHaveCount(8);
    expect(await page.locator(".coinche-scene-hand-card button").evaluateAll((nodes) => nodes.map((n) => n.getAttribute("aria-label")))).toEqual(ordered.map((c) => `Jouer ${c.rank} ${SUIT_SYMBOLS[c.suit]}`));
    const native = await context.newPage();
    await native.addInitScript((game) => Object.assign(globalThis, { __nativeHandSequence: [game] }), game);
    await native.setViewportSize({ width: 844, height: 390 });
    await native.goto(`http://127.0.0.1:8091/?screen=${mode}&parity=start&multi=start&seat=${seat}&postDelay=100000`);
    if (mode === "multiplayer") await native.getByRole("button", { name: "Rouvrir la dernière table de cet appareil" }).click();
    await expect(native.getByTestId("solo-hand-card")).toHaveCount(8);
    expect(await native.getByRole("button", { name: /^Jouer / }).evaluateAll((nodes) => nodes.map((n) => n.getAttribute("aria-label")))).toEqual(ordered.map((c) => `Jouer ${c.rank} ${SUIT_LABELS[c.suit]}`));
    if (game.phase === "bidding" && game.currentPlayerId === seat && await native.getByRole("button", { name: "Atout Pique", exact: true }).count()) {
      await native.getByRole("button", { name: "Atout Pique", exact: true }).click();
      expect(await native.getByRole("button", { name: /^Jouer / }).evaluateAll((nodes) => nodes.map((n) => n.getAttribute("aria-label")))).toEqual(ordered.map((c) => `Jouer ${c.rank} ${SUIT_LABELS[c.suit]}`));
    }
    const output = "test-results/ios-fixes/sorting"; mkdirSync(output, { recursive: true });
    for (const [renderer, target] of [["web", page], ["native", native]] as const) {
      await target.evaluate(async () => { await document.fonts.ready; await Promise.all(Array.from(document.images).map((i) => i.decode())); });
      await target.screenshot({ path: `${output}/${renderer}-${mode}-${stage}-${seat}.png` });
    }
    await native.close();
  });
}
