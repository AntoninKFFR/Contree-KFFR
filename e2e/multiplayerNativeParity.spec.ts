import { test, expect } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import states from "../apps/mobile/tests/multiplayer/states.json";
import { installMobileNavigationFixture } from "./helpers/mobileNavigationFixture";
import { simulateSafeAreas } from "./helpers/mobile";
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
