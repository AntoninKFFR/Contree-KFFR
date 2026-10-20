import { test, expect } from "@playwright/test";
import { mkdirSync, writeFileSync, existsSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import states from "../multiplayer/states.json";
const dir = "docs/multiplayer-151/captures";
for (const viewport of [{ width: 568, height: 320 }, { width: 844, height: 390 }, { width: 932, height: 430 }]) {
  for (const stage of ["landing", "lobby-free", "lobby-full", "bidding", "start", "trick", "last", "result"] as const) {
    for (const seat of stage === "landing" || stage.startsWith("lobby") ? [0] : [0, 1, 2, 3]) test(`multiplayer parity native ${viewport.width} ${stage} seat ${seat}`, async ({ page }) => {
      const errors: string[] = []; page.on("pageerror", (e) => errors.push(e.stack ?? e.message));
      await page.clock.setFixedTime(new Date("2026-10-21T12:00:00Z"));
      await page.setViewportSize(viewport); await page.goto(`/?screen=multiplayer&multi=${stage}&seat=${seat}&top=0&left=47&right=47&bottom=21`);
      await expect(page.getByTestId("multiplayer-screen")).toBeVisible();
      if (stage === "landing") await expect(page.getByRole("button", { name: "Créer la table", exact: true })).toBeVisible();
      else {
        await page.getByRole("button", { name: "Rouvrir la dernière table de cet appareil" }).click();
        await expect(page.getByTestId(stage.startsWith("lobby") ? "multiplayer-lobby" : "multiplayer-game")).toBeVisible();
      }
      if (stage === "last") await page.getByRole("button", { name: "Dernier pli", exact: true }).click();
      if (stage === "result") await expect(page.getByTestId("solo-round-result")).toBeVisible();
      await page.evaluate(async () => { await document.fonts.ready; await Promise.all(Array.from(document.images).map((i) => i.decode())); });
      const view = states[stage === "landing" ? "lobby-free" : stage][seat];
      const geometry = await page.evaluate(() => {
        const bounds = document.querySelector('[data-testid="multiplayer-content"]')!.getBoundingClientRect();
        return { left: bounds.left, right: bounds.right, bottom: bounds.bottom, overflowX: document.documentElement.scrollWidth - innerWidth, overflowY: document.documentElement.scrollHeight - innerHeight };
      });
      expect(geometry).toEqual({ left: 47, right: viewport.width - 47, bottom: viewport.height - 21, overflowX: 0, overflowY: 0 });
      const fixtureDigest = createHash("sha256").update(JSON.stringify(view)).digest("hex");
      const reference = `${dir}/web-${viewport.width}-${stage}-${seat}.json`;
      if (existsSync(reference)) expect(fixtureDigest).toBe(JSON.parse(readFileSync(reference, "utf8")).fixtureDigest);
      mkdirSync(dir, { recursive: true }); await page.screenshot({ path: `${dir}/native-${viewport.width}-${stage}-${seat}.png` });
      writeFileSync(`${dir}/native-${viewport.width}-${stage}-${seat}.json`, JSON.stringify({ fixtureDigest, viewport, seat, stage, geometry, renderer: "actual React Native Web components; not physical iOS" }, null, 2));
      expect(errors).toEqual([]);
    });
  }
}

test("multiplayer creation, code error, immediate card and reconciliation use real native controls", async ({ page }) => {
  await page.setViewportSize({ width: 844, height: 390 }); await page.goto("/?screen=multiplayer&multi=landing");
  await page.getByRole("button", { name: "Saisir un code", exact: true }).click(); await page.getByRole("textbox", { name: "Code de table" }).fill("BAD");
  await page.getByRole("button", { name: "Rejoindre la table", exact: true }).click(); await expect(page.getByText("Code introuvable.", { exact: true }).last()).toBeVisible();
  await page.getByRole("button", { name: "Fermer", exact: true }).click(); await page.getByRole("button", { name: "Créer la table", exact: true }).click(); await expect(page.getByTestId("multiplayer-lobby")).toBeVisible();
  await page.goto("/?screen=multiplayer&multi=start&seat=3&postDelay=1200&refuse=1"); await page.getByRole("button", { name: "Rouvrir la dernière table de cet appareil" }).click();
  const card = page.getByRole("button", { name: /^Jouer / }).first(); await card.click(); await expect(page.getByTestId("solo-pending-card")).toBeVisible();
  await expect(page.getByRole("alert")).toContainText("Action refusée."); await expect(page.getByTestId("solo-pending-card")).toHaveCount(0); await expect(card).toBeVisible();
});

test("multiplayer motion uses the shared native animations without runtime errors", async ({ page }) => {
  const errors: string[] = []; page.on("pageerror", (e) => errors.push(e.stack ?? e.message));
  await page.setViewportSize({ width: 844, height: 390 }); await page.goto("/?screen=multiplayer&multi=trick&motion=1");
  await page.getByRole("button", { name: "Rouvrir la dernière table de cet appareil" }).click();
  await expect(page.getByTestId("multiplayer-game")).toBeVisible();
  await expect(page.getByRole("button", { name: /^Jouer / }).first()).toBeVisible();
  expect(errors).toEqual([]);
});

test("multiplayer saved landing, landscape sides and large text keep controls inside safe areas", async ({ page }) => {
  await page.setViewportSize({ width: 568, height: 320 });
  for (const font of [1, 1.6]) for (const [left, right] of [[59, 0], [0, 59]]) {
    await page.goto(`/?screen=multiplayer&multi=lobby-free&font=${font}&left=${left}&right=${right}`);
    const measure = () => page.evaluate(({ left, right }) => Array.from(document.querySelectorAll('[data-testid="multiplayer-content"] [role="button"]')).filter((button) => !button.closest('[aria-hidden="true"]')).flatMap((button) => {
      const box = button.getBoundingClientRect();
      return box.width && box.height && (box.width < 44 || box.height < 44 || box.left < left || box.right > innerWidth - right || box.top < 0 || box.bottom > innerHeight - 21) ? [button.getAttribute("aria-label") ?? button.textContent] : [];
    }), { left, right });
    await expect(page.getByRole("button", { name: "Rouvrir la dernière table de cet appareil" })).toBeVisible();
    await expect.poll(measure).toEqual([]);
    await page.getByRole("button", { name: "Rouvrir la dernière table de cet appareil" }).click(); await expect(page.getByTestId("multiplayer-lobby")).toBeVisible();
    await expect.poll(measure).toEqual([]);
    await page.setViewportSize({ width: 390, height: 844 }); await expect(page.getByTestId("rotation-notice")).toBeVisible();
    await page.setViewportSize({ width: 568, height: 320 }); await expect.poll(measure).toEqual([]);
  }
});
