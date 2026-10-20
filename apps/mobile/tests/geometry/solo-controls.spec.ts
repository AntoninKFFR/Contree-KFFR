import { expect, test, type Page } from "@playwright/test";
import { soloGeometry } from "./solo-geometry";
import illegalState from "../parity/illegal-state.json";
import { parseSoloResponse, cardKey } from "../../src/solo/contract";
import { soloLegalHumanCards } from "../../../../lib/solo/publicState";
import { SUIT_LABELS } from "../../../../engine/cards";
import { explainIllegalCard } from "../../../../engine/illegalCardExplanation";
import { resolveContractMode } from "../../../../engine/contractMode";
import { resolveGameRules } from "../../../../engine/rulesets/resolve";
type FixtureBridge = { requests: { method: string; body: { intent?: unknown; rules?: unknown } | null }[]; stored: (key: string) => string | null };
const posts = (page: Page) => page.evaluate(() => (globalThis as unknown as { __soloFixture: FixtureBridge }).__soloFixture.requests.filter((r) => r.method === "POST").map((r) => r.body));
const stored = (page: Page, key: string) => page.evaluate((key) => { const raw = (globalThis as unknown as { __soloFixture: FixtureBridge }).__soloFixture.stored(key); return raw ? JSON.parse(raw) : null; }, key);

for (const width of [568, 844]) {
  test(`Solo SA/TA, Capot and Générale confirmations retain selection ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: width === 568 ? 320 : 390 }); await page.goto("/?screen=solo&bidding=advanced");
    await expect(page.getByTestId("solo-bidding")).toBeVisible(); await soloGeometry(page);
    await page.getByRole("button", { name: "Atout Tout Atout", exact: true }).click();
    await page.getByRole("button", { name: "Valeur 100" }).click(); await page.getByRole("button", { name: "Capot", exact: true }).click();
    await expect(page.getByText("Annoncer un Capot Tout Atout ?", { exact: true })).toBeVisible(); expect(await posts(page)).toEqual([]);
    await page.getByRole("button", { name: "Annuler", exact: true }).click();
    await expect(page.getByRole("button", { name: "Atout Tout Atout", exact: true })).toHaveAttribute("aria-selected", "true");
    await expect(page.getByRole("button", { name: "Valeur 100" })).toHaveAttribute("aria-selected", "true");
    await page.getByRole("button", { name: "Capot", exact: true }).click(); await page.getByRole("button", { name: "Confirmer", exact: true }).click();
    await expect.poll(() => posts(page)).toEqual([expect.objectContaining({ intent: { type: "capot", playerId: 0, contractMode: { kind: "all-trump" } } })]);
    await page.getByRole("button", { name: "Atout Sans Atout", exact: true }).click(); await page.getByRole("button", { name: "Générale", exact: true }).click();
    await expect(page.getByText("Annoncer une Générale Sans Atout ?", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Confirmer", exact: true }).click();
    await expect.poll(async () => (await posts(page)).at(-1)?.intent).toEqual({ type: "generale", playerId: 0, contractMode: { kind: "no-trump" } });
  });
  for (const [stage, label, type] of [["coinche", "Contrer", "coinche"], ["surcoinche", "Surcontrer", "surcoinche"], ["actionOnly", "Contrer", "coinche"]] as const) test(`Solo ${stage} exact permissions and versioned intent ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: width === 568 ? 320 : 390 }); await page.goto(`/?screen=solo&bidding=${stage}`);
    await expect(page.getByRole("button", { name: label, exact: true })).toBeEnabled();
    if (stage !== "coinche") { await expect(page.getByRole("button", { name: "Annoncer", exact: true })).toHaveCount(0); await expect(page.getByRole("button", { name: /^Valeur / })).toHaveCount(0); await expect(page.getByRole("button", { name: "Capot", exact: true })).toHaveCount(0); }
    else await expect(page.getByRole("button", { name: "Valeur 90" })).toHaveCount(0);
    await soloGeometry(page); await page.getByRole("button", { name: label, exact: true }).click(); expect(await posts(page)).toEqual([]);
    await page.getByRole("button", { name: "Confirmer", exact: true }).click();
    await expect.poll(async () => (await posts(page)).at(-1)).toEqual({ expectedVersion: 1, intent: { type, playerId: 0 } });
  });
}
test("Solo actual Expo UI settings persist, affect the scene and remain in a secondary scroller", async ({ page }) => {
  await page.setViewportSize({ width: 568, height: 320 }); await page.goto("/?screen=solo&parity=start");
  await page.getByRole("button", { name: "Menu Partie", exact: true }).click(); await page.getByRole("button", { name: "Paramètres", exact: true }).click();
  await page.getByTestId("Vitesse de jeu").selectOption("fast");
  await expect.poll(async () => (await stored(page, "coinche:player-preferences:v1"))?.gameplay.botDelayMs).toBe(300);
  await page.getByText("Ramasser les plis automatiquement", { exact: true }).click();
  await expect.poll(async () => (await stored(page, "coinche:player-preferences:v1"))?.gameplay.autoCollectTricks).toBe(false);
  await page.getByLabel("Rechercher un paramètre", { exact: true }).fill("inexistant"); await expect(page.getByText(/Aucun paramètre ne correspond/)).toBeVisible();
  await page.getByLabel("Rechercher un paramètre", { exact: true }).fill(""); await page.getByRole("button", { name: "Accessibilité", exact: true }).click();
  await page.getByText("Contraste renforcé", { exact: true }).click(); await page.getByTestId("Taille du texte").selectOption("large");
  await page.getByRole("button", { name: "Affichage", exact: true }).click(); await page.getByTestId("Tapis de jeu").selectOption("midnight-blue");
  await page.getByRole("button", { name: "Fermer", exact: true }).click();
  await expect(page.getByTestId("solo-card-table")).toHaveCSS("background-color", "rgb(23, 52, 90)"); await soloGeometry(page);
  expect(await posts(page)).toEqual([]);
});
test("Solo rules are draft-only until saved and sent with a voluntary new game", async ({ page }) => {
  await page.setViewportSize({ width: 844, height: 390 }); await page.goto("/?screen=solo&solo=empty");
  await page.getByRole("button", { name: "Menu Partie", exact: true }).click(); await page.getByRole("button", { name: "Règles de la prochaine partie", exact: true }).click();
  await page.getByRole("button", { name: "Contrats", exact: true }).click(); await page.getByText("Sans Atout", { exact: true }).click();
  expect(await stored(page, "coinche:solo-rules:v1")).toBeNull(); expect(await posts(page)).toEqual([]);
  await page.getByRole("button", { name: "Enregistrer les règles", exact: true }).click();
  await expect.poll(async () => (await stored(page, "coinche:solo-rules:v1"))?.overrides.bidding.allowNoTrump).toBe(true);
  await expect(page.getByRole("button", { name: "Enregistrer les règles", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Nouvelle partie", exact: true }).click();
  await expect.poll(async () => (await posts(page)).at(-1)?.rules).toMatchObject({ presetId: "contree-kffr", overrides: { bidding: { allowNoTrump: true } } });
});
test("Solo illegal cards use the same explanation locally and never send a play intent", async ({ page }) => {
  const game = parseSoloResponse({ data: illegalState }).state, legal = soloLegalHumanCards(game);
  const card = game.hand.find((c) => !legal.some((l) => cardKey(c) === cardKey(l)))!;
  expect(legal.length).toBeGreaterThan(0); expect(legal.length).toBeLessThan(game.hand.length);
  const mode = resolveContractMode(game); if (!mode) throw new Error("Illegal-card fixture needs a contract");
  const message = explainIllegalCard({ hand: game.hand, trick: game.currentTrick, playerId: 0, card, mode, rules: resolveGameRules(game.settings).cardPlay });
  await page.setViewportSize({ width: 844, height: 390 }); await page.goto("/?screen=solo&solo=illegal");
  const button = page.getByRole("button", { name: `Jouer ${card.rank} ${SUIT_LABELS[card.suit]}`, exact: true });
  await expect(button).toBeDisabled(); await expect(button).toHaveCSS("opacity", "0.55");
  await page.getByRole("button", { name: "Menu Partie", exact: true }).click(); await page.getByRole("button", { name: "Paramètres", exact: true }).click();
  await page.getByRole("button", { name: "Aides", exact: true }).click(); await page.getByText("Bloquer le clic sur les cartes illégales", { exact: true }).click(); await page.getByRole("button", { name: "Fermer", exact: true }).click();
  await expect(button).toBeEnabled(); await button.click(); await expect(page.getByRole("alert")).toHaveText(message!);
  expect(await posts(page)).toEqual([]); await expect(button).toBeVisible();
});
