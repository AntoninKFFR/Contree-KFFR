import { expect, test } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { installMultiplayerMobileFixture, MULTIPLAYER_MOBILE_BASE, type LobbyScenario } from "./helpers/multiplayerMobileFixture";
import { setMobileViewport } from "./helpers/mobile";

// Capture-only work is opt-in; the normal responsive suite uses assertions in
// multiplayerMobile.spec.ts and never substitutes these captures for tests.
if (process.env.MULTIPLAYER_CAPTURE) {
  const phase = process.env.MULTIPLAYER_CAPTURE;
  const scenarios: { name: string; width: number; height: number; theme?: "dark" | "light"; lobby?: LobbyScenario; menu?: boolean }[] = [
    { name: "390-dark-landing", width: 390, height: 844 },
    { name: "390-dark-host-1", width: 390, height: 844, lobby: { players: 1 } },
    { name: "390-dark-host-4-ready", width: 390, height: 844, lobby: { players: 4, ready: true } },
    { name: "390-dark-guest", width: 390, height: 844, lobby: { players: 2, role: "guest" } },
    { name: "390-light-landing", width: 390, height: 844, theme: "light" },
    { name: "390-light-lobby", width: 390, height: 844, theme: "light", lobby: { players: 3, offline: true } },
    { name: "320-long-name", width: 320, height: 568, lobby: { players: 4, ready: true } },
    { name: "844-landing", width: 844, height: 390 },
    { name: "844-host", width: 844, height: 390, lobby: { players: 1 } },
    { name: "844-secondary", width: 844, height: 390, lobby: { players: 2 }, menu: true },
    { name: "568-lobby", width: 568, height: 320, lobby: { players: 3 } },
    { name: "1440-landing", width: 1440, height: 900 },
    { name: "1440-lobby", width: 1440, height: 900, lobby: { players: 4, ready: true } },
  ];
  for (const scenario of scenarios) test(`@mobile @multiplayer-capture ${scenario.name}`, async ({ page }, info) => {
    const fixture = await installMultiplayerMobileFixture(page, { theme: scenario.theme, ...scenario.lobby });
    await setMobileViewport(page, scenario);
    await page.goto(scenario.lobby ? fixture.path : "/multiplayer");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(scenario.lobby ? fixture.view().room.code : "Une table, quatre places");
    await page.waitForLoadState("networkidle");
    await page.evaluate(() => document.fonts.ready);
    const geometry = await page.evaluate(() => {
      const box = (element: Element | null) => {
        if (!element) return null;
        const r = element.getBoundingClientRect();
        return { x: r.x, y: r.y, width: r.width, height: r.height, bottom: r.bottom };
      };
      const sections = [...document.querySelectorAll("main section")];
      return { viewport: { width: innerWidth, height: innerHeight }, header: box(document.querySelector(".coinche-global-header")),
        landingHeader: box(document.querySelector(".coinche-page-header")), create: box(sections.find((section) => section.querySelector("form") && section.textContent?.includes("Créer une table")) ?? null),
        join: box(sections.find((section) => section.querySelector("form") && section.textContent?.includes("Rejoindre une table")) ?? null), codeInput: box(document.querySelector("main input")),
        lobbyHeader: box(sections[0]), actions: box(document.querySelector(".coinche-lobby-actions")), table: box(document.querySelector(".coinche-lobby-table")),
        waiting: box(document.querySelector(".coinche-lobby-table + section")), seats: [...document.querySelectorAll(".coinche-lobby-seat")].map(box),
        horizontalOverflow: document.documentElement.scrollWidth - innerWidth };
    });
    const dir = `.playwright/mobile-multiplayer/${phase}/${info.project.name}`;
    await mkdir(dir, { recursive: true });
    await writeFile(`${dir}/${scenario.name}.json`, JSON.stringify({ baseSha: MULTIPLAYER_MOBILE_BASE, ...geometry }, null, 2));
    if (scenario.menu && phase !== "baseline") await page.getByRole("button", { name: "Plus d’actions pour la table" }).click();
    await page.screenshot({ path: `${dir}/${scenario.name}.png`, fullPage: false });
  });
}
