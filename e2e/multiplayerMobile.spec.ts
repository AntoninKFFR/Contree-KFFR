import { expect, test, type Page, type Locator } from "@playwright/test";
import { installMultiplayerMobileFixture, LONG_MULTIPLAYER_NAME, type LobbyScenario } from "./helpers/multiplayerMobileFixture";
import { MOBILE_VIEWPORTS, DESKTOP_VIEWPORTS, expectNoPageHorizontalOverflow, expectInsideSafeViewport, scrollDocumentToEnd, setMobileViewport, simulateSafeAreas, type SafeAreas } from "./helpers/mobile";
import { monitorBrowserErrors } from "./helpers/browserErrors";

const sizes = [...MOBILE_VIEWPORTS, { width: 768, height: 900 }, { width: 1024, height: 900 }, ...DESKTOP_VIEWPORTS];
const more = (page: Page) => page.getByRole("button", { name: "Plus d’actions pour la table" });
const lobby = (page: Page) => page.locator(".coinche-lobby-header");
const seatsPresence = (page: Page) => page.locator(".coinche-lobby-seat-presence > span:not([aria-hidden])").first();
async function touchTargets(root: Locator) {
  for (const button of await root.locator("button, a").all()) {
    if (!await button.isVisible()) continue;
    const box = (await button.boundingBox())!;
    expect(box.width).toBeGreaterThanOrEqual(44); expect(box.height).toBeGreaterThanOrEqual(44);
  }
}
async function boardGeometry(page: Page) {
  const table = (await page.locator(".coinche-lobby-table").boundingBox())!;
  const seats = await Promise.all((await page.locator(".coinche-lobby-seat").all()).map((seat) => seat.boundingBox()));
  expect(seats).toHaveLength(4);
  for (const seat of seats) {
    expect(seat!.x).toBeGreaterThanOrEqual(table.x); expect(seat!.x + seat!.width).toBeLessThanOrEqual(table.x + table.width);
    expect(seat!.y).toBeGreaterThanOrEqual(table.y); expect(seat!.y + seat!.height).toBeLessThanOrEqual(table.y + table.height);
  }
  for (let a = 0; a < 4; a++) for (let b = a + 1; b < 4; b++) {
    const first = seats[a]!, second = seats[b]!;
    const overlapX = Math.min(first.x + first.width, second.x + second.width) - Math.max(first.x, second.x);
    const overlapY = Math.min(first.y + first.height, second.y + second.height) - Math.max(first.y, second.y);
    expect(Math.min(overlapX, overlapY), `seats ${a}/${b} do not overlap`).toBeLessThanOrEqual(0);
  }
  for (const position of ["Bas", "Droite", "Haut", "Gauche"]) await expect(page.getByText(`Place ${position}`, { exact: true })).toBeVisible();
}

for (const ready of [true, false]) for (const viewport of [{ width: 1120, height: 390 }, { width: 1280, height: 400 }, { width: 1440, height: 450 }]) {
  test(`@mobile @multiplayer-mobile wide short lobby document scroll ${viewport.width}×${viewport.height} ready=${ready}`, async ({ page }, info) => {
    const errors = monitorBrowserErrors(page);
    const fixture = await installMultiplayerMobileFixture(page, { players: 4, ready, offline: true });
    await setMobileViewport(page, viewport); await page.goto(fixture.path);
    await expect(lobby(page)).toBeVisible();
    if (!ready) {
      // Reproduce Linux's wrapped desktop presence on narrower Windows fonts too.
      await page.addStyleTag({ content: ".coinche-lobby-seat-presence { font-family: monospace; }" });
      expect((await seatsPresence(page).boundingBox())!.height).toBeGreaterThanOrEqual(28);
    }
    await boardGeometry(page); await expectNoPageHorizontalOverflow(page);
    const shell = page.locator(".coinche-lobby-shell"), felt = page.locator(".coinche-lobby-felt");
    const seats = page.locator(".coinche-lobby-seat");
    await expect(seats.first()).toHaveAttribute("title", `${LONG_MULTIPLAYER_NAME} (Toi)`);
    for (const container of [shell, felt]) {
      const bounds = (await container.boundingBox())!;
      for (const seat of await seats.all()) {
        const box = (await seat.boundingBox())!;
        expect(box.y).toBeGreaterThanOrEqual(bounds.y);
        expect(box.y + box.height).toBeLessThanOrEqual(bounds.y + bounds.height);
      }
    }
    const scrollers = await shell.locator(":scope, *").evaluateAll((elements) => elements.filter((element) =>
      /auto|scroll/.test(getComputedStyle(element).overflowY) && element.scrollHeight > element.clientHeight).length);
    expect(scrollers).toBe(0);
    expect(await shell.evaluate((element) => getComputedStyle(element).overflowY)).toBe("visible");
    await touchTargets(lobby(page)); await touchTargets(seats); await touchTargets(page.locator(".coinche-lobby-waiting"));
    const documentBefore = await page.evaluate(() => ({ height: document.documentElement.scrollHeight, viewport: document.documentElement.clientHeight }));
    expect(documentBefore.height).toBeGreaterThan(documentBefore.viewport);
    await page.evaluate(() => window.scrollTo(0, 0));
    await expectInsideSafeViewport(page, seats.nth(2));
    expect((await felt.boundingBox())!.y).toBeGreaterThanOrEqual(0);
    await scrollDocumentToEnd(page);
    expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
    await expectInsideSafeViewport(page, seats.first());
    await expectInsideSafeViewport(page, page.locator(".coinche-lobby-waiting"));
    expect((await felt.boundingBox())!.y + (await felt.boundingBox())!.height).toBeLessThanOrEqual(viewport.height);
    await expectNoPageHorizontalOverflow(page);
    await info.attach("wide-short-scroll", { body: JSON.stringify({ viewport, ready, documentBefore, scrollY: await page.evaluate(() => window.scrollY),
      felt: await felt.boundingBox(), seats: await Promise.all((await seats.all()).map((seat) => seat.boundingBox())), scrollers }), contentType: "application/json" });
    // Invite and free-seat targets are available only when the room has an empty place.
    const partial = await installMultiplayerMobileFixture(page, { players: 3 }); await page.goto(partial.path);
    await expect(lobby(page).getByRole("button", { name: "Inviter des amis" })).toBeVisible();
    await page.addStyleTag({ content: ".coinche-lobby-seat-presence { font-family: monospace; }" });
    await boardGeometry(page); await touchTargets(shell);
    errors.assertClean();
  });
}

for (const theme of ["dark", "light"] as const) for (const viewport of sizes) {
  test(`@mobile @multiplayer-mobile ${theme} landing and four seats ${viewport.width}×${viewport.height}`, async ({ page }) => {
    const errors = monitorBrowserErrors(page);
    const fixture = await installMultiplayerMobileFixture(page, { theme, players: 4, ready: true, offline: true, code: "ABCDEFGHIJKL" });
    await setMobileViewport(page, viewport); await page.goto("/multiplayer");
    const input = page.getByRole("textbox", { name: "Code de table" });
    await expect(input).toBeEnabled(); await input.fill("abcdefghijkl"); await expect(input).toHaveValue("ABCDEFGHIJKL");
    await expect(input).toHaveAttribute("maxlength", "12"); await expect(input).toHaveAttribute("required", "");
    if (viewport.width < 1120) expect(await input.evaluate((element) => parseFloat(getComputedStyle(element).fontSize))).toBeGreaterThanOrEqual(16);
    const landscape = viewport.width > viewport.height;
    const safe: SafeAreas = { top: viewport.width >= 1120 ? 0 : landscape ? 0 : 47, bottom: viewport.width >= 1120 ? 0 : 34, left: landscape ? 44 : 0, right: 0 };
    await simulateSafeAreas(page, safe); await touchTargets(page.locator(".coinche-multiplayer-choices")); await expectNoPageHorizontalOverflow(page);
    if (landscape || viewport.width >= 700) {
      const create = (await page.locator(".coinche-multiplayer-create").boundingBox())!, join = (await page.locator(".coinche-multiplayer-join").boundingBox())!;
      expect(Math.abs(create.y - join.y)).toBeLessThanOrEqual(1); expect(create.x + create.width).toBeLessThan(join.x);
    }
    if (viewport.width === 390) expect((await input.boundingBox())!.y).toBeLessThan(620);
    // Keep the shared providers mounted: a forced document reload can cancel
    // their pending RPC reads and produce WebKit access-control pageerrors.
    await page.getByRole("button", { name: "Créer la table", exact: true }).click();
    await expect(page).toHaveURL(new RegExp(fixture.path + "$"));
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("ABCDEFGHIJKL");
    await simulateSafeAreas(page, safe); await expectNoPageHorizontalOverflow(page); await boardGeometry(page);
    if (landscape && viewport.width < 1120) {
      await simulateSafeAreas(page, { ...safe, left: 0, right: 44 }); await expectNoPageHorizontalOverflow(page); await boardGeometry(page);
      await simulateSafeAreas(page, safe);
    }
    await touchTargets(lobby(page)); await touchTargets(page.locator(".coinche-lobby-waiting"));
    await expect(page.locator(".coinche-lobby-seat").first()).toHaveAttribute("title", `${LONG_MULTIPLAYER_NAME} (Toi)`);
    await expect(page.locator(".coinche-lobby-seat").first()).toContainText("(Toi)");
    await expect(page.locator(".coinche-lobby-seat").first()).toContainText("Prêt");
    await expect(page.locator(".coinche-lobby-seat").nth(1)).toContainText("Placement");
    await expect(page.locator(".coinche-lobby-seat").nth(2)).toContainText("Hors ligne");
    await expect(lobby(page).getByRole("button", { name: "Inviter des amis" })).toHaveCount(0);
    await expect(lobby(page).getByRole("button", { name: "Lancer la partie" })).toBeEnabled();
    const shellScrollers = await page.locator(".coinche-lobby-shell, .coinche-lobby-shell > div").evaluateAll((elements) => elements.filter((element) => /auto|scroll/.test(getComputedStyle(element).overflowY) && element.scrollHeight > element.clientHeight).length);
    expect(shellScrollers).toBe(0);
    if (viewport.width < 1120) {
      await expect(lobby(page).getByRole("button", { name: "Règles", exact: true })).toBeHidden();
      const readsBeforeMenu = fixture.reads();
      await more(page).click(); const dialog = page.getByRole("dialog", { name: "Actions de la table" });
      await expectInsideSafeViewport(page, dialog.locator(".coinche-dialog"), safe); await touchTargets(dialog);
      expect(fixture.reads()).toBe(readsBeforeMenu); expect(fixture.intents).toHaveLength(0);
      await page.keyboard.press("Escape"); await expect(more(page)).toBeFocused();
    } else {
      await expect(more(page)).toBeHidden(); await expect(lobby(page).getByRole("button", { name: "Règles", exact: true })).toBeVisible();
      const shell = page.locator(".coinche-lobby-shell");
      expect((await shell.boundingBox())!.height).toBe(viewport.height - 56);
      expect(await shell.evaluate((element) => getComputedStyle(element).overflowY)).toBe("hidden");
      expect(await page.locator(".coinche-lobby-felt").evaluate((element) => getComputedStyle(element).minHeight)).toBe("0px");
    }
    errors.assertClean();
  });
}

test("@mobile @multiplayer-mobile first viewport and rotation preserve the loaded room", async ({ page }, info) => {
  const fixture = await installMultiplayerMobileFixture(page, { players: 4, ready: true });
  await setMobileViewport(page, { width: 390, height: 844 }); await page.goto(fixture.path);
  await expect(lobby(page)).toBeVisible(); await page.waitForLoadState("networkidle");
  const seat = page.locator(".coinche-lobby-seat").first(); const originalSeat = await seat.elementHandle();
  const originalPlayers = await page.locator(".coinche-lobby-seat").allTextContents();
  const originalFreeSeats = await page.getByText("Place libre", { exact: true }).count();
  expect(originalFreeSeats).toBe(0); // Four occupied places, not merely four permanent slots.
  const reads = fixture.reads();
  for (const viewport of [{ width: 390, height: 844 }, { width: 844, height: 390 }, { width: 390, height: 844 }]) {
    await setMobileViewport(page, viewport);
    const safe = { top: viewport.width === 390 ? 47 : 0, bottom: 34, left: viewport.width === 844 ? 44 : 0, right: 0 };
    await simulateSafeAreas(page, safe);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(fixture.view().room.code);
    await expect(lobby(page).getByRole("button", { name: "Pas prêt" })).toBeVisible();
    await expect(page.locator(".coinche-lobby-seat")).toHaveCount(4); await expect(seat).toContainText("(Toi)");
    expect(await page.locator(".coinche-lobby-seat").allTextContents()).toEqual(originalPlayers);
    expect(await page.getByText("Place libre", { exact: true }).count()).toBe(originalFreeSeats);
    expect(await originalSeat!.evaluate((element) => element.isConnected)).toBe(true);
    await boardGeometry(page);
    const header = (await page.locator(".coinche-global-header").boundingBox())!, head = (await lobby(page).boundingBox())!, table = (await page.locator(".coinche-lobby-table").boundingBox())!;
    expect(head.y).toBeGreaterThanOrEqual(header.y + header.height); expect(table.y).toBeGreaterThanOrEqual(head.y + head.height);
    if (viewport.width === 390) expect(table.y).toBeLessThanOrEqual(260);
    else {
      expect(head.height).toBeLessThanOrEqual(90); expect(table.y).toBeLessThanOrEqual(155);
      for (const position of await page.locator(".coinche-lobby-seat-position").all()) await expectInsideSafeViewport(page, position, safe);
      const visible = await page.locator(".coinche-lobby-seat").evaluateAll((seats) => seats.filter((seat) => seat.getBoundingClientRect().bottom <= innerHeight - 34).length);
      expect(visible).toBe(4);
      await info.attach("first-viewport", { body: JSON.stringify({ header, head, table, safe, visible }), contentType: "application/json" });
    }
  }
  expect(fixture.reads()).toBe(reads); expect(fixture.intents).toHaveLength(0); expect(fixture.landingActions).toHaveLength(0);
});

for (const mode of ["clipboard", "fallback", "failure"] as const) test(`@mobile @multiplayer-mobile copy keyboard ${mode}`, async ({ page }) => {
  await page.addInitScript((mode) => {
    const state = window as typeof window & { copied: string[] };
    state.copied = [];
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: mode === "clipboard" ? { writeText: async (text: string) => { state.copied.push(text); } } : undefined });
    Object.defineProperty(document, "execCommand", { configurable: true, value: () => { state.copied.push((document.activeElement as HTMLTextAreaElement).value); return mode === "fallback"; } });
  }, mode);
  const fixture = await installMultiplayerMobileFixture(page); await setMobileViewport(page, { width: 390, height: 844 }); await page.goto(fixture.path);
  const button = page.getByRole("button", { name: "Copier le code" }); await button.focus();
  const before = (await lobby(page).boundingBox())!;
  for (const key of ["Enter", "Space"]) {
    await page.keyboard.press(key); await expect(lobby(page).getByRole("status")).toHaveText(mode === "failure" ? "Copie indisponible" : "Code copié");
    await expect(button).toBeFocused();
  }
  await button.click();
  await expect.poll(() => page.evaluate(() => (window as typeof window & { copied: string[] }).copied)).toEqual(Array(3).fill(fixture.view().room.code));
  expect(Math.abs((await lobby(page).boundingBox())!.height - before.height)).toBeLessThanOrEqual(1); await expect(page.locator("textarea")).toHaveCount(0);
});

test("@mobile @multiplayer-mobile landing keyboard, long error and received invitations", async ({ page }) => {
  const fixture = await installMultiplayerMobileFixture(page, { invitations: true }); await setMobileViewport(page, { width: 390, height: 844 }); await page.goto("/multiplayer");
  const input = page.getByRole("textbox", { name: "Code de table" }); await input.fill("abcdefgh1234"); await input.focus();
  await setMobileViewport(page, { width: 390, height: 380 }); await simulateSafeAreas(page, { top: 0, bottom: 34, left: 0, right: 0 });
  await expect(input).toBeFocused(); await expect(input).toHaveValue("ABCDEFGH1234");
  const error = "Cette table est introuvable. ".repeat(8); fixture.failLanding(error);
  const join = page.getByRole("button", { name: "Rejoindre la table", exact: true });
  await join.evaluate((element) => element.scrollIntoView({ block: "center" })); await expectInsideSafeViewport(page, join, { top: 0, bottom: 34, left: 0, right: 0 }); await join.click();
  await expect(page.getByRole("status")).toHaveText(error.trim()); await expectNoPageHorizontalOverflow(page);
  expect(fixture.landingActions).toHaveLength(1); expect(fixture.landingActions[0]).toMatchObject({ code: "ABCDEFGH1234" });
  await expect(page.getByRole("heading", { name: "Invitations" })).toBeVisible();
  await expect(page.locator("main")).toContainText(LONG_MULTIPLAYER_NAME);
});

for (const state of ["loading", "signed-out", "missing-username"] as const) test(`@mobile @multiplayer-mobile landing ${state}`, async ({ page }) => {
  const fixture = await installMultiplayerMobileFixture(page, { authenticated: state !== "signed-out", loading: state === "loading", missingUsername: state === "missing-username" });
  await setMobileViewport(page, { width: 390, height: 844 }); await page.goto("/multiplayer");
  if (state === "loading") { await expect(page.getByText("Chargement de la session...", { exact: true })).toBeVisible(); fixture.releaseProfile(); await expect(page.getByRole("button", { name: "Créer la table", exact: true })).toBeEnabled(); }
  if (state === "signed-out") { await expect(page.getByRole("link", { name: "Se connecter", exact: true })).toBeVisible(); await expect(page.getByRole("button", { name: "Créer la table", exact: true })).toHaveCount(0); }
  if (state === "missing-username") { await expect(page.getByRole("link", { name: "Ouvrir le profil" })).toBeVisible(); await expect(page.getByRole("button", { name: "Créer la table", exact: true })).toBeDisabled(); }
  await expectNoPageHorizontalOverflow(page);
});

for (const scenario of [
  { players: 1 }, { players: 2 }, { players: 3, takeover: true, offline: true },
  { players: 4, ready: true, bot: true }, { players: 2, role: "guest" },
  { players: 2, role: "spectator" }, { players: 4, role: "spectator" },
] satisfies LobbyScenario[]) test(`@mobile @multiplayer-mobile roles ${JSON.stringify(scenario)}`, async ({ page }) => {
  const fixture = await installMultiplayerMobileFixture(page, scenario); await setMobileViewport(page, { width: 320, height: 568 }); await page.goto(fixture.path);
  await expect(lobby(page)).toBeVisible(); await boardGeometry(page); await touchTargets(page.locator(".coinche-lobby-table"));
  if (scenario.players === 4 && scenario.role === "spectator") {
    // Reproduce Linux's wrapped presence even on a narrower Windows system font.
    await page.addStyleTag({ content: ".coinche-lobby-seat-presence { font-family: monospace; }" });
    const presence = page.locator(".coinche-lobby-seat-presence > span:not([aria-hidden])").first();
    expect((await presence.boundingBox())!.height).toBeGreaterThanOrEqual(28);
    await boardGeometry(page);
  }
  await expect(lobby(page).getByRole("button", { name: "Inviter des amis" })).toHaveCount(scenario.players < 4 && scenario.role !== "spectator" ? 1 : 0);
  if (scenario.role) await expect(lobby(page).getByRole("button", { name: "Lancer la partie" })).toHaveCount(0);
  if ("takeover" in scenario) await expect(page.locator(".coinche-lobby-seat").nth(2)).toContainText("Bot temporaire");
  if ("bot" in scenario) { await expect(page.locator(".coinche-lobby-seat").nth(3)).toContainText("Bot"); await expect(page.locator(".coinche-lobby-seat").nth(3).locator(".coinche-rank-emblem")).toHaveCount(0); }
  await more(page).click(); const menu = page.getByRole("dialog", { name: "Actions de la table" });
  if (scenario.role) await expect(menu.getByRole("button", { name: "Transférer l'hôte" })).toHaveCount(0);
  else if (scenario.players === 1) await expect(menu.getByRole("button", { name: "Transférer l'hôte" })).toBeDisabled();
  else await expect(menu.getByRole("button", { name: "Transférer l'hôte" })).toBeEnabled();
  await page.keyboard.press("Escape");
  if (scenario.role === "spectator") {
    const join = page.getByRole("button", { name: "S'asseoir" });
    if (scenario.players === 4) { await expect(join).toBeDisabled(); await expect(page.getByText("Table pleine", { exact: true })).toBeVisible(); }
    else { await expect(join).toBeEnabled(); await page.locator(".coinche-lobby-seat").nth(2).click(); await expect(page.getByRole("button", { name: "Quitter la place" })).toBeVisible(); expect(fixture.intents).toMatchObject([{ type: "join-seat", seatIndex: 2 }]); }
  }
  await expectNoPageHorizontalOverflow(page);
});

test("@mobile @multiplayer-mobile pending ready and start keep mutation guards", async ({ page }) => {
  const fixture = await installMultiplayerMobileFixture(page, { players: 1 }); await setMobileViewport(page, { width: 390, height: 844 }); await page.goto(fixture.path);
  const ready = lobby(page).getByRole("button", { name: "Prêt", exact: true }); await expect(ready).toHaveClass(/coinche-primary-action/);
  await expect(lobby(page).getByRole("button", { name: "Lancer la partie" })).toBeDisabled();
  fixture.block("set-ready"); await ready.click(); await expect(ready).toBeDisabled(); await ready.evaluate((button) => (button as HTMLButtonElement).click());
  expect(fixture.intents).toHaveLength(1); fixture.release(); await expect(lobby(page).getByRole("button", { name: "Pas prêt" })).toBeEnabled();
  const start = lobby(page).getByRole("button", { name: "Lancer la partie" }); await expect(start).toHaveClass(/coinche-primary-action/);
  fixture.block("start-game"); await start.click(); await expect(start).toBeDisabled(); await start.evaluate((button) => (button as HTMLButtonElement).click());
  expect(fixture.intents.map((intent) => intent.type)).toEqual(["set-ready", "start-game"]); fixture.release(); await expect(start).toBeEnabled();
});

for (const viewport of [{ width: 390, height: 844 }, { width: 568, height: 320 }]) test(`@mobile @multiplayer-mobile dialogs ${viewport.width}×${viewport.height}`, async ({ page }) => {
  const fixture = await installMultiplayerMobileFixture(page, { players: 2 }); await setMobileViewport(page, viewport); await page.goto(fixture.path);
  const safe = { top: viewport.width === 390 ? 47 : 0, bottom: 34, left: 0, right: 0 }; await simulateSafeAreas(page, safe);
  await more(page).focus(); await page.keyboard.press("Enter"); await expect(more(page)).toHaveAttribute("aria-expanded", "true");
  const menu = page.getByRole("dialog", { name: "Actions de la table" });
  const last = menu.getByRole("button", { name: "Transférer l'hôte" }); await last.focus(); await page.keyboard.press("Tab");
  await expect(menu.getByRole("button", { name: "Fermer Actions de la table" })).toBeFocused(); await page.keyboard.press("Shift+Tab"); await expect(last).toBeFocused();
  await page.keyboard.press("Escape"); await expect(more(page)).toBeFocused();
  for (const action of ["Préférences", "Règles", "Transférer l'hôte"]) {
    await more(page).click(); await menu.getByRole("button", { name: action, exact: true }).click();
    const dialog = page.getByRole("dialog"); await expect(dialog).toHaveCount(1); await expectInsideSafeViewport(page, dialog.locator(".coinche-dialog"), safe);
    await expectNoPageHorizontalOverflow(page);
    if (action === "Règles") { await expect(dialog.locator(".coinche-rules-configurator")).toBeVisible(); await expectInsideSafeViewport(page, dialog.getByRole("button", { name: "Enregistrer les règles" }), safe); }
    if (action.startsWith("Transférer")) {
      const candidate = dialog.getByRole("button", { name: LONG_MULTIPLAYER_NAME, exact: true }); await touchTargets(dialog); await candidate.click();
      const confirm = dialog.getByRole("button", { name: `Confirmer pour ${LONG_MULTIPLAYER_NAME}` }); await expect(confirm).toBeEnabled(); await expectInsideSafeViewport(page, confirm, safe);
    }
    await page.keyboard.press("Escape"); await expect(more(page)).toBeFocused();
  }
  await page.getByRole("button", { name: "Inviter des amis", exact: true }).click(); const invite = page.getByRole("dialog", { name: "Inviter des amis" });
  await expect(invite.getByRole("button", { name: "Inviter", exact: true })).toHaveCount(20);
  await expectInsideSafeViewport(page, invite.locator(".coinche-dialog"), safe); await expectInsideSafeViewport(page, invite.getByRole("button", { name: "Fermer", exact: true }), safe);
  await invite.getByRole("button", { name: "Inviter", exact: true }).last().evaluate((button) => button.scrollIntoView({ block: "nearest" }));
  await expectInsideSafeViewport(page, invite.getByRole("button", { name: "Inviter", exact: true }).last(), safe); await page.keyboard.press("Escape");
  const reads = fixture.reads(); await more(page).click(); await menu.getByRole("button", { name: "Rafraîchir" }).click(); await expect.poll(fixture.reads).toBeGreaterThan(reads); await expect(lobby(page)).toBeVisible();
});

test("@mobile @multiplayer-mobile guest rules are read-only and spectator without username cannot sit", async ({ page }) => {
  const fixture = await installMultiplayerMobileFixture(page, { players: 2, role: "guest" }); await setMobileViewport(page, { width: 390, height: 844 }); await page.goto(fixture.path);
  await more(page).click(); await page.getByRole("dialog").getByRole("button", { name: "Règles", exact: true }).click();
  const rules = page.getByRole("dialog", { name: "Règles de la table" }); await expect(rules.getByRole("region", { name: "Résumé des règles" })).toBeVisible(); await expect(rules.locator(".coinche-rules-configurator")).toHaveCount(0);
  await page.keyboard.press("Escape");
  const missing = await installMultiplayerMobileFixture(page, { players: 2, role: "spectator", missingUsername: true }); await page.goto(missing.path);
  await expect(page.getByRole("link", { name: "Choisir un pseudo" })).toBeVisible(); await expect(page.getByRole("button", { name: "S'asseoir" })).toBeDisabled();
});

test("@mobile @multiplayer-mobile invitation dialog fits 320 with long names", async ({ page }) => {
  const fixture = await installMultiplayerMobileFixture(page); await setMobileViewport(page, { width: 320, height: 568 }); await page.goto(fixture.path);
  const safe = { top: 47, bottom: 34, left: 0, right: 0 }; await simulateSafeAreas(page, safe);
  await page.getByRole("button", { name: "Inviter des amis" }).click(); const dialog = page.getByRole("dialog", { name: "Inviter des amis" });
  await expect(dialog.getByRole("button", { name: "Inviter", exact: true })).toHaveCount(20); await expectInsideSafeViewport(page, dialog.locator(".coinche-dialog"), safe);
  await expectInsideSafeViewport(page, dialog.getByRole("button", { name: "Fermer", exact: true }), safe); await expectNoPageHorizontalOverflow(page);
});
