import { expect, test, type Page } from "@playwright/test";
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { biddingFixture } from "../solo-fixtures";
import { parseSoloResponse } from "../../src/solo/contract";
import { clonePlayerPreferences } from "../../../../lib/preferences/playerPreferences";
import { formatBidLabel } from "../../../../lib/solo/tableAnnouncements";
import { soloGeometry } from "./solo-geometry";

type Bridge = {
  __soloFixture: { current: () => { state: unknown }; requests: { method: string; body: { intent?: { type: string } } }[] };
  __multiplayerFixture: { current: () => { game: unknown }; requests: { body: { intent?: { type: string } } | null }[] };
};
const mutations = (page: Page, mode: string) => page.evaluate((mode) => {
  const bridge = globalThis as unknown as Bridge;
  return mode === "solo" ? bridge.__soloFixture.requests.filter((r) => r.method === "POST").map((r) => r.body.intent)
    : bridge.__multiplayerFixture.requests.flatMap((r) => r.body?.intent ? [r.body.intent] : []);
}, mode);

for (const viewport of [{ width: 568, height: 320 }, { width: 844, height: 390 }, { width: 932, height: 430 }]) {
  for (const mode of ["solo", "multiplayer"] as const) test(`${mode} bidding hides waiting controls and restores the human turn ${viewport.width}`, async ({ page }, info) => {
    const errors: string[] = []; page.on("pageerror", (error) => errors.push(error.message));
    await page.clock.install({ time: new Date("2026-10-21T12:00:00Z") });
    await page.clock.pauseAt(new Date("2026-10-21T12:00:00Z"));
    await page.setViewportSize(viewport);
    async function open(stage: string) {
      await page.goto(`/?screen=${mode}&bidding=${stage}&multi=bidding&seat=0&postDelay=1000&top=0&left=47&right=47&bottom=21`);
      if (mode === "multiplayer") await page.getByRole("button", { name: "Rouvrir la dernière table de cet appareil" }).click();
      await expect(page.getByTestId("solo-card-table")).toBeVisible();
    }
    async function capture(stage: "bot" | "human") {
      const expected = parseSoloResponse({ data: biddingFixture(stage === "bot" ? "bot-turn" : "coinche") }).state;
      const actual = await page.evaluate((mode) => {
        const bridge = globalThis as unknown as Bridge;
        return mode === "solo" ? bridge.__soloFixture.current().state : bridge.__multiplayerFixture.current().game;
      }, mode);
      expect(actual).toEqual(expected);
      await page.evaluate(async () => { await document.fonts.ready; await Promise.all(Array.from(document.images).map((image) => image.decode())); });
      const directory = process.env.BIDDING_CAPTURE_DIR ?? info.outputPath("captures");
      mkdirSync(directory, { recursive: true });
      const stem = join(directory, `${mode}-${viewport.width}-${stage}`);
      await page.screenshot({ path: `${stem}.png` });
      // Equality above proves the projection; normalize key order across parsers.
      writeFileSync(`${stem}.json`, JSON.stringify({ viewport, mode, stage, fixtureDigest: createHash("sha256").update(JSON.stringify(expected)).digest("hex"), renderer: "actual React Native Web components; not physical iOS" }, null, 2));
      await info.attach(stage, { path: `${stem}.png`, contentType: "image/png" });
    }
    await open("bot-turn");
    await expect(page.getByTestId("solo-bidding")).toHaveCount(mode === "solo" && process.env.BIDDING_BASELINE === "1" ? 1 : 0);
    await expect(page.getByTestId("solo-seat-3").getByLabel(/à son tour/)).toBeVisible();
    const bid = parseSoloResponse({ data: biddingFixture("bot-turn") }).state.bids[0];
    await expect(page.getByTestId("solo-seat-1")).toContainText(formatBidLabel(bid).label);
    await expect(page.getByTestId("solo-seat-2").getByText("Passe", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: /^Jouer / })).toHaveCount(8);
    await capture("bot");
    if (mode === "solo") {
      expect(await mutations(page, mode)).toEqual([{ type: "advance-bot" }]);
      // HTTP and the unchanged presentation delay must finish before the turn switches.
      await page.clock.runFor(999);
      await expect(page.getByTestId("solo-seat-3").getByLabel(/à son tour/)).toBeVisible();
      await page.clock.runFor(Math.max(1000, clonePlayerPreferences().gameplay.biddingDelayMs) - 999);
    } else await open("coinche");
    await expect(page.getByTestId("solo-bidding")).toBeVisible();
    await expect(page.getByText("À toi de parler", { exact: true })).toBeVisible();
    await expect(page.getByTestId("solo-seat-0").getByLabel(/à son tour/)).toBeVisible();
    await expect(page.getByRole("button", { name: "Passer", exact: true })).toBeEnabled();
    await expect(page.getByRole("button", { name: "Contrer", exact: true })).toBeEnabled();
    if (mode === "solo") await soloGeometry(page);
    await capture("human");
    const before = await mutations(page, mode);
    await page.getByRole("button", { name: "Contrer", exact: true }).click();
    await expect(page.getByRole("button", { name: "Confirmer", exact: true })).toBeVisible();
    expect(await mutations(page, mode)).toEqual(before);
    await page.getByRole("button", { name: "Annuler", exact: true }).click();
    expect(await mutations(page, mode)).toEqual(before);
    await page.getByRole("button", { name: "Contrer", exact: true }).click();
    await page.getByRole("button", { name: "Confirmer", exact: true }).click();
    await expect.poll(() => mutations(page, mode)).toEqual([...before, mode === "solo" ? { type: "coinche", playerId: 0 } : { type: "game-action", action: { type: "coinche" } }]);
    await page.clock.runFor(5000);
    expect(await mutations(page, mode)).toHaveLength(before.length + 1);
    expect(errors).toEqual([]);
  });
}
