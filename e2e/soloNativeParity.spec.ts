import { test, expect } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { soloParityStates, soloParityBiddingStates, soloParityIllegalState } from "./helpers/soloParityStates";
import { installMobileGameFixture } from "./helpers/mobileGameFixture";
import { simulateSafeAreas, expectNoPageHorizontalOverflow } from "./helpers/mobile";
import { toPlayerGameView } from "../engine/views";
import { clonePlayerPreferences, PLAYER_PREFERENCES_STORAGE_KEY } from "../lib/preferences/playerPreferences";
import { gameGeometry } from "./helpers/gameGeometry";
import { createHash } from "node:crypto";

const states = soloParityStates();
const dir = "apps/mobile/docs/parity-150/captures";
const fixtureDir = "apps/mobile/tests/parity";
mkdirSync(fixtureDir, { recursive: true });
writeFileSync(`${fixtureDir}/states.json`, JSON.stringify(Object.fromEntries(Object.entries(states).map(([key, state]) => [key, { id: "33333333-3333-4333-8333-333333333333", version: 1, state: toPlayerGameView(state, 0) }])), null, 2));
writeFileSync(`${fixtureDir}/bidding-states.json`, JSON.stringify(Object.fromEntries(Object.entries(soloParityBiddingStates()).map(([key, state]) => [key, { id: "33333333-3333-4333-8333-333333333333", version: 1, state: toPlayerGameView(state, 0) }])), null, 2));
writeFileSync(`${fixtureDir}/illegal-state.json`, JSON.stringify({ id: "33333333-3333-4333-8333-333333333333", version: 1, state: toPlayerGameView(soloParityIllegalState(), 0) }, null, 2));
for (const viewport of [{ width: 844, height: 390 }, { width: 568, height: 320 }, { width: 932, height: 430 }]) {
  for (const [stage, state] of Object.entries(states)) test(`@solo-native-parity web ${viewport.width} ${stage}`, async ({ page }) => {
    const prefs = clonePlayerPreferences(); prefs.visual.reducedMotion = true;
    await page.addInitScript(({ key, prefs }) => localStorage.setItem(key, JSON.stringify(prefs)), { key: PLAYER_PREFERENCES_STORAGE_KEY, prefs });
    await page.setViewportSize(viewport);
    const fixture = await installMobileGameFixture(page, state);
    await page.goto("/solo");
    // Hide development tooling only; the application UI remains untouched.
    await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" });
    await expect(page.locator(".coinche-game-scene")).toBeVisible();
    await simulateSafeAreas(page, { top: 0, left: 47, right: 47, bottom: 21 });
    if (stage === "bidding") await expect(page.locator(".coinche-bidding-panel")).toBeVisible();
    if (stage === "result") await expect(page.getByLabel("Résultat de la manche", { exact: true })).toBeVisible();
    await expectNoPageHorizontalOverflow(page);
    await page.evaluate(() => document.fonts.ready);
    await page.evaluate(async () => { const image = new Image(); image.src = "/TapisKFFR.png"; await image.decode(); });
    mkdirSync(dir, { recursive: true });
    await page.screenshot({ path: `${dir}/web-${viewport.width}-${stage}.png` });
    writeFileSync(`${dir}/web-${viewport.width}-${stage}.json`, JSON.stringify({ ...await gameGeometry(page), fixtureDigest: createHash("sha256").update(JSON.stringify(toPlayerGameView(state, 0))).digest("hex") }, null, 2));
    expect(fixture.intents).toEqual([]);
  });
}
