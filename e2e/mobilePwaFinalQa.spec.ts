import { expect, type Page } from "@playwright/test";
import { test, installFinalQaFixture, qaSafeAreas, captureQaSnapshot, expectMinTouchTarget } from "./helpers/mobilePwaFinalQa";
import { MOBILE_VIEWPORTS, DESKTOP_VIEWPORTS, simulateSafeAreas, setMobileViewport, expectInsideSafeViewport } from "./helpers/mobile";
import { installHomeProgressionFixture } from "./helpers/homeProgressionFixture";
import { installFriendsMobileFixture } from "./helpers/friendsMobileFixture";
import { installMultiplayerMobileFixture } from "./helpers/multiplayerMobileFixture";
import { installMobileGameFixture, mobileGameState } from "./helpers/mobileGameFixture";
import { installMobileNavigationFixture } from "./helpers/mobileNavigationFixture";
import { installTrainingMobileFixture } from "./helpers/trainingMobileFixture";
import { openFirstTrainingQuestion } from "./helpers/trainingGame";
import { IPAD_UA, simulatePwaEnvironment } from "./helpers/pwa";
import { PLAYER_PREFERENCES_STORAGE_KEY } from "../lib/preferences/playerPreferences";

const burger = (page: Page) => page.getByRole("button", { name: "Ouvrir le menu" });
const navigation = (page: Page) => page.getByRole("navigation", { name: "Navigation mobile" });
async function navigate(page: Page, name: string) {
  await burger(page).click();
  await navigation(page).getByRole("link", { name, exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Navigation KFFR" })).toHaveCount(0);
  await expect(page.locator("body")).not.toHaveCSS("overflow", "hidden");
}
async function navigateRoute(page: Page, path: string) {
  const mobile = page.viewportSize()!.width < 1120;
  const nav = mobile ? navigation(page) : page.getByRole("navigation", { name: "Navigation principale" });
  if (mobile) await burger(page).click();
  if (path === "/training") {
    const training = nav.getByRole("button", { name: "Entraînement", exact: true });
    if (await training.getAttribute("aria-expanded") !== "true") await training.click();
  } else if (!mobile && ["/solo", "/multiplayer"].includes(path)) {
    const play = nav.getByRole("button", { name: "Jouer", exact: true });
    if (await play.getAttribute("aria-expanded") !== "true") await play.click();
  }
  await nav.locator(`a[href="${path}"]`).click();
  await expect(page).toHaveURL(new RegExp(path === "/" ? "/$" : path + "$"));
}
async function cycleTheme(page: Page, checkpoint?: (theme: "light" | "dark") => Promise<void>) {
  for (const theme of ["light", "dark"] as const) {
    await page.getByRole("switch", { name: theme === "light" ? "Activer le thème clair" : "Activer le thème sombre" }).click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
    await expect.poll(() => page.evaluate(key => JSON.parse(localStorage.getItem(key)!).visual.theme, PLAYER_PREFERENCES_STORAGE_KEY)).toBe(theme);
    await checkpoint?.(theme);
  }
}

// The specialized suites still own state permutations. These eight journeys
// expose shared-shell failures across real client-side route changes.
for (const [index, viewport] of MOBILE_VIEWPORTS.entries()) {
  test(`@mobile @pwa-final-qa authenticated transverse journey ${viewport.width}x${viewport.height}`, async ({ page, qa }, info) => {
    test.setTimeout(90_000);
    const fixture = await installFinalQaFixture(page);
    const safe = qaSafeAreas(viewport.width, viewport.height, index % 2 === 1);
    await setMobileViewport(page, viewport); await page.goto("/"); await simulateSafeAreas(page, safe);
    await expect(page.locator("main .progression-card").getByRole("heading", { name: `Niveau ${fixture.home.summary.level}` })).toBeVisible();
    await expect(page.locator(".coinche-global-header")).toHaveAttribute("data-header-variant", "default");
    await qa.control(burger(page), safe);
    await qa.control(page.locator("main").getByRole("link", { name: /Jouer en solo/ }), safe, true);
    await page.evaluate(() => scrollTo(0, 0)); await qa.checkpoint("home-auth");
    if (viewport.width === 390) await captureQaSnapshot(page, info, "home", "auth");

    await navigate(page, "Ma progression");
    await expect(page.getByRole("heading", { level: 1, name: `Niveau ${fixture.home.summary.level}` })).toBeVisible();
    await expect(page.getByRole("list", { name: "Missions de départ" }).getByRole("listitem")).toHaveCount(5);
    await expect(page.getByRole("list", { name: "Missions hebdomadaires" }).getByRole("listitem")).toHaveCount(3);
    await expect(page.getByRole("heading", { name: "Collection", exact: true })).toBeVisible();
    await qa.checkpoint("progression");
    if (viewport.width === 430) await captureQaSnapshot(page, info, "progression", "missions");

    await navigate(page, "Amis");
    await expect(page.locator(".friend-presence-row")).toHaveCount(20);
    await qa.checkpoint("friends");
    if (viewport.width === 320) await captureQaSnapshot(page, info, "friends", "long-list");
    const friend = page.locator(".friend-presence-row").first();
    for (const control of [friend.getByRole("button", { name: "Jouer", exact: true }), friend.getByRole("button", { name: "S’entraîner" }), friend.getByRole("button", { name: /Plus d’actions/ })]) {
      await qa.control(control, safe, true);
    }
    await friend.getByRole("link", { name: "Voir le profil de Alice" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Alice" })).toBeVisible();
    await expect(page.locator("main").getByRole("heading", { name: "Solo", exact: true })).toBeVisible();
    await expect(page.locator("main").getByRole("heading", { name: "Multijoueur", exact: true })).toBeVisible();
    await expect(page.locator("main .profile-frame")).toBeVisible();
    await qa.checkpoint("friend-profile");
    await page.getByRole("link", { name: "← Retour aux amis" }).click();
    await expect(page.locator(".friend-presence-row")).toHaveCount(20);

    await burger(page).click(); await navigation(page).getByRole("button", { name: "Entraînement", exact: true }).click();
    await navigation(page).getByRole("link", { name: "Calculer", exact: true }).click();
    await expect(page).toHaveURL(/\/training#calculer$/);
    const heading = page.locator("#calculer h2");
    await expect.poll(() => heading.evaluate(element => element.getBoundingClientRect().top
      - document.querySelector(".coinche-global-header")!.getBoundingClientRect().bottom)).toBeGreaterThanOrEqual(0);
    await expect.poll(() => heading.evaluate(element => element.getBoundingClientRect().top
      - document.querySelector(".coinche-global-header")!.getBoundingClientRect().bottom)).toBeLessThanOrEqual(56);
    await qa.control(page.locator(".training-level-available").first(), safe, true);
    await qa.checkpoint("training-anchor");
    if (viewport.width === 390) await captureQaSnapshot(page, info, "training", "hub");

    await navigate(page, "Multijoueur");
    await expect(page.getByRole("button", { name: "Créer la table", exact: true })).toBeEnabled();
    await qa.control(page.getByRole("button", { name: "Créer la table", exact: true }), safe, true);
    await qa.control(page.getByRole("button", { name: "Rejoindre la table", exact: true }), safe, true);
    await qa.checkpoint("multiplayer-landing");
    await page.getByRole("button", { name: "Créer la table", exact: true }).click();
    await expect(page).toHaveURL(new RegExp(fixture.lobby.path + "$"));
    await expect(page.locator(".coinche-lobby-seat")).toHaveCount(4);
    await qa.control(page.getByRole("button", { name: "Copier le code" }), safe, true);
    await qa.control(page.getByRole("button", { name: "Lancer la partie", exact: true }), safe, true);
    await qa.checkpoint("lobby-four");
    if (viewport.width === 844) {
      await page.evaluate(() => scrollTo(0, 0));
      for (const seat of await page.locator(".coinche-lobby-seat").all()) await expectInsideSafeViewport(page, seat, safe);
      await captureQaSnapshot(page, info, "lobby", "four");
    }
    expect(fixture.lobby.intents).toEqual([]);
  });
}

test("@mobile @pwa-final-qa anonymous Home, audio controls and light preference", async ({ page, qa }, info) => {
  await installHomeProgressionFixture(page, { authenticated: false, preservePreferencesOnReload: true });
  await setMobileViewport(page, { width: 390, height: 844 }); await page.goto("/");
  const safe = qaSafeAreas(390, 844); await simulateSafeAreas(page, safe);
  await expect(page.locator("main .progression-card")).toHaveCount(0);
  await qa.control(page.locator("main").getByRole("link", { name: /Jouer en solo/ }), safe);
  await page.getByRole("button", { name: "Contrôles audio" }).click();
  const audio = page.getByRole("dialog", { name: "Lecteur audio" });
  await expectInsideSafeViewport(page, audio, safe);
  for (const button of await audio.getByRole("button").all()) await qa.control(button, safe);
  const volume = audio.getByRole("slider", { name: "Volume musique" });
  await volume.focus(); await volume.press("Home"); await expect(volume).toHaveValue("0");
  await volume.press("End"); await expect(volume).toHaveValue("100");
  await page.keyboard.press("Escape"); await expect(audio).toHaveCount(0);
  await cycleTheme(page);
  await page.getByRole("switch", { name: "Activer le thème clair" }).click();
  await qa.checkpoint("home-anonymous-light"); await captureQaSnapshot(page, info, "home", "anonymous");
  await page.waitForLoadState("networkidle"); await page.goto("/progression");
  await expect(page.getByRole("heading", { name: "Connecte-toi pour suivre ta progression" })).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await qa.checkpoint("progression-signed-out");
});

test("@mobile @pwa-final-qa drawer focus, safe edges, body lock and four Training anchors", async ({ page, qa }) => {
  await installFinalQaFixture(page); await setMobileViewport(page, { width: 390, height: 844 }); await page.goto("/rules");
  const safe = qaSafeAreas(390, 844); await simulateSafeAreas(page, safe);
  await page.waitForLoadState("networkidle");
  await page.evaluate(() => scrollTo(0, 200));
  await burger(page).evaluate(element => element.focus({ preventScroll: true }));
  await expect(burger(page)).toBeFocused(); await page.keyboard.press("Enter");
  const close = page.getByRole("button", { name: "Fermer le menu" });
  await expect(close).toBeFocused(); await qa.control(close, safe);
  await expect(page.locator("body")).toHaveCSS("overflow", "hidden");
  const before = await page.evaluate(() => scrollY);
  await page.mouse.wheel(0, 300);
  expect(await page.evaluate(() => scrollY)).toBe(before);
  await page.keyboard.press("Shift+Tab"); await expect(navigation(page).getByRole("link", { name: "Ma progression" })).toBeFocused();
  await page.keyboard.press("Tab"); await expect(close).toBeFocused();
  await page.keyboard.press("Tab");
  expect(await navigation(page).evaluate(element => element.contains(document.activeElement))).toBe(true);
  await page.keyboard.press("Escape"); await expect(burger(page)).toBeFocused();
  await expect(page.locator("body")).not.toHaveCSS("overflow", "hidden");
  for (const [label, id] of [["Calculer", "calculer"], ["Mémoriser", "memoriser"], ["Déduire", "deduire"], ["Annoncer", "annoncer"]]) {
    await burger(page).click();
    const accordion = navigation(page).getByRole("button", { name: "Entraînement", exact: true });
    if (await accordion.getAttribute("aria-expanded") !== "true") await accordion.click();
    await qa.control(navigation(page).getByRole("link", { name: label, exact: true }), safe, true);
    await navigation(page).getByRole("link", { name: label, exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/training#${id}$`));
    await expect.poll(() => page.locator(`#${id} h2`).evaluate(element => element.getBoundingClientRect().top
      - document.querySelector(".coinche-global-header")!.getBoundingClientRect().bottom)).toBeGreaterThanOrEqual(0);
    await expect.poll(() => page.locator(`#${id} h2`).evaluate(element => element.getBoundingClientRect().top
      - document.querySelector(".coinche-global-header")!.getBoundingClientRect().bottom)).toBeLessThanOrEqual(56);
    await qa.checkpoint(`training-${id}`);
  }
});

test("@mobile @pwa-final-qa login keyboard preserves both inputs and reachable submit", async ({ page, qa }) => {
  await installMobileNavigationFixture(page, { authenticated: false });
  await setMobileViewport(page, { width: 390, height: 844 }); await page.goto("/login");
  await expect(page.getByRole("heading", { name: "Connexion", exact: true })).toBeVisible();
  const email = page.getByRole("textbox", { name: "Email", exact: true }); const password = page.getByLabel("Mot de passe", { exact: true });
  await email.fill("qa@example.test"); await password.fill("fixture-only");
  for (const input of [email, password]) {
    await input.focus(); await setMobileViewport(page, { width: 390, height: 380 });
    const safe = { top: 0, bottom: 34, left: 0, right: 0 }; await simulateSafeAreas(page, safe);
    expect(await input.evaluate(element => parseFloat(getComputedStyle(element).fontSize))).toBeGreaterThanOrEqual(16);
    await qa.control(input, safe, true); await expect(input).toBeFocused();
    await qa.control(page.locator("form").getByRole("button", { name: "Se connecter", exact: true }), safe, true);
    await qa.checkpoint("login-keyboard");
    await setMobileViewport(page, { width: 390, height: 844 });
  }
  await expect(email).toHaveValue("qa@example.test"); await expect(password).toHaveValue("fixture-only");
});

test("@mobile @pwa-final-qa friend search survives keyboard and orientation", async ({ page, qa }) => {
  await installFriendsMobileFixture(page, { count: 1 });
  await setMobileViewport(page, { width: 390, height: 844 }); await page.goto("/friends");
  await expect(page.locator(".friend-presence-row")).toHaveCount(1);
  const search = page.getByRole("textbox", { name: "Pseudo", exact: true }); await search.fill("Ali");
  await expect(page.locator(".friends-search-row").first()).toBeVisible();
  await search.focus(); await setMobileViewport(page, { width: 390, height: 380 });
  const safe = { top: 0, bottom: 34, left: 0, right: 0 }; await simulateSafeAreas(page, safe);
  expect(await search.evaluate(element => parseFloat(getComputedStyle(element).fontSize))).toBeGreaterThanOrEqual(16);
  await qa.control(search, safe, true);
  await qa.control(page.locator(".friends-search-row").last().getByRole("button").first(), safe, true);
  await qa.checkpoint("friends-keyboard");
  for (const viewport of [{ width: 844, height: 390 }, { width: 390, height: 844 }]) {
    await setMobileViewport(page, viewport); await expect(search).toHaveValue("Ali"); await qa.checkpoint("friends-resize");
  }
});

test("@mobile @pwa-final-qa room code survives keyboard and Home Indicator", async ({ page, qa }) => {
  await installMultiplayerMobileFixture(page);
  await setMobileViewport(page, { width: 390, height: 844 }); await page.goto("/multiplayer");
  const code = page.getByRole("textbox", { name: "Code de table" }); await code.fill("ABC123"); await code.focus();
  await setMobileViewport(page, { width: 390, height: 380 });
  const safe = { top: 0, bottom: 34, left: 0, right: 0 }; await simulateSafeAreas(page, safe);
  expect(await code.evaluate(element => parseFloat(getComputedStyle(element).fontSize))).toBeGreaterThanOrEqual(16);
  await qa.control(code, safe, true); await expect(code).toHaveValue("ABC123");
  await qa.control(page.getByRole("button", { name: "Rejoindre la table", exact: true }), safe, true);
  await qa.checkpoint("room-code-keyboard");
  await setMobileViewport(page, { width: 390, height: 844 }); await expect(code).toHaveValue("ABC123");
});

test("@mobile @pwa-final-qa themes and resize on Home Friends Training and lobby", async ({ page, qa }) => {
  const fixture = await installFinalQaFixture(page);
  await setMobileViewport(page, { width: 390, height: 844 }); await page.goto("/");
  for (const route of ["/", "/friends", "/training", fixture.lobby.path]) {
    if (route === fixture.lobby.path) {
      await navigateRoute(page, "/multiplayer");
      await page.getByRole("button", { name: "Créer la table", exact: true }).click();
      await expect(page).toHaveURL(new RegExp(fixture.lobby.path + "$"));
    } else if (route !== "/") await navigateRoute(page, route);
    await expect(page.locator(".coinche-global-header")).toHaveAttribute("data-header-variant", "default");
    await cycleTheme(page, theme => qa.checkpoint(`${route}-${theme}`));
    for (const viewport of [{ width: 390, height: 844 }, { width: 844, height: 390 }]) {
      await setMobileViewport(page, viewport); await simulateSafeAreas(page, qaSafeAreas(viewport.width, viewport.height));
      await qa.checkpoint(`${route}-resized`);
    }
  }
  expect(fixture.lobby.intents).toEqual([]);
  expect(fixture.lobby.view().room.code).toBe("LOBBY125");
  expect(fixture.lobby.view().players.every(player => player.is_ready)).toBe(true);
});

for (const players of [1, 4] as const) test(`@mobile @pwa-final-qa lobby ${players} copy and menu focus`, async ({ page, qa }) => {
  const fixture = await installMultiplayerMobileFixture(page, { players, ready: true });
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: async (text: string) => { Object.assign(window, { qaCopiedCode: text }); } } });
  });
  await setMobileViewport(page, { width: 390, height: 844 }); await page.goto(fixture.path);
  const safe = qaSafeAreas(390, 844); await simulateSafeAreas(page, safe);
  const copy = page.getByRole("button", { name: "Copier le code" }); await qa.control(copy, safe, true);
  await copy.focus(); await page.keyboard.press("Enter");
  await expect(page.locator(".coinche-lobby-header").getByRole("status")).toHaveText("Code copié");
  expect(await page.evaluate(() => (window as typeof window & { qaCopiedCode: string }).qaCopiedCode)).toBe(fixture.view().room.code);
  await expect(copy).toBeFocused();
  await expect(page.locator(".coinche-lobby-seat")).toHaveCount(4);
  if (players === 1) {
    await qa.control(page.getByRole("button", { name: "Inviter des amis", exact: true }), safe, true);
    await expect(page.locator("button.coinche-lobby-seat").filter({ hasText: "Place libre" })).toHaveCount(3);
  }
  const more = page.getByRole("button", { name: "Plus d’actions pour la table" }); await qa.control(more, safe, true);
  await more.focus(); await page.keyboard.press("Enter");
  const menu = page.getByRole("dialog", { name: "Actions de la table" });
  await qa.control(menu.getByRole("button", { name: "Fermer Actions de la table" }), safe);
  for (const label of ["Préférences", "Règles", "Rafraîchir", "Transférer l'hôte"]) await expectMinTouchTarget(menu.getByRole("button", { name: label, exact: true }));
  await page.keyboard.press("Escape"); await expect(more).toBeFocused();
  await qa.checkpoint(`lobby-${players}`);
});

for (const mode of ["solo", "multi"] as const) test(`@mobile @pwa-final-qa ${mode} focus visibility rotation and chrome cleanup`, async ({ page, qa }, info) => {
  const fixture = await installMobileGameFixture(page, mobileGameState(mode === "solo" ? "bidding" : "playing"));
  const width = mode === "solo" ? 568 : 844; await setMobileViewport(page, { width, height: width === 568 ? 320 : 390 });
  await page.goto(mode === "solo" ? "/solo" : fixture.path);
  const safe = qaSafeAreas(width, width === 568 ? 320 : 390); await simulateSafeAreas(page, safe);
  await expect(page.locator(".coinche-scene-hand-card button")).toHaveCount(8);
  const before = JSON.stringify(fixture.snapshot());
  const hand = await page.locator(".coinche-scene-hand-card button").allTextContents();
  for (const position of [0, 3, 7]) await qa.control(page.locator(".coinche-scene-hand-card button").nth(position), safe);
  if (mode === "solo") {
    await expect(page.getByRole("button", { name: /^Valeur / })).toHaveCount(9);
    await expect(page.getByRole("button", { name: /^Atout / })).toHaveCount(6);
    for (const control of await page.locator(".coinche-bidding-panel button").all()) await qa.control(control, safe);
  } else {
    await expect(page.locator(".coinche-player-panel")).toHaveCount(4);
    await expect(page.getByText("Bot temporaire")).toBeVisible();
    await expect(page.getByText("Hôte", { exact: true })).toBeVisible();
    await expect(page.getByRole("timer")).toBeVisible();
  }
  await captureQaSnapshot(page, info, mode, mode === "solo" ? "bidding" : "playing");
  await cycleTheme(page);
  await page.evaluate(() => {
    window.dispatchEvent(new Event("blur"));
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" });
    document.dispatchEvent(new Event("visibilitychange"));
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
    document.dispatchEvent(new Event("visibilitychange")); window.dispatchEvent(new Event("focus"));
  });
  for (const viewport of [{ width: 390, height: 844 }, { width: 844, height: 390 }, { width: 390, height: 844 }, { width: 844, height: 390 }]) {
    await setMobileViewport(page, viewport); await simulateSafeAreas(page, qaSafeAreas(viewport.width, viewport.height));
    if (viewport.width === 390) {
      await expect(page.getByRole("heading", { name: "Tournez votre téléphone" })).toBeVisible();
      await expect(page.locator(".coinche-game-scene")).toHaveCount(0);
    } else {
      await expect(page.locator(".coinche-scene-hand-card button")).toHaveCount(8);
      expect(await page.locator(".coinche-scene-hand-card button").allTextContents()).toEqual(hand);
    }
    expect(JSON.stringify(fixture.snapshot())).toBe(before); expect(fixture.intents).toEqual([]);
    await qa.checkpoint(`${mode}-rotation`);
  }
  await page.getByRole("link", { name: "Accueil — KFFR Contrée" }).click();
  await expect(page.locator(".coinche-global-header")).toHaveAttribute("data-header-variant", "default");
  await expect(page.locator(".coinche-global-header")).toHaveCSS("height", "56px");
  await qa.checkpoint(`${mode}-exit`);
});

test("@mobile @pwa-final-qa light active Solo portrait notice stays isolated", async ({ page, qa }, info) => {
  await installMobileGameFixture(page, mobileGameState("playing")); await setMobileViewport(page, { width: 390, height: 844 }); await page.goto("/solo");
  const safe = qaSafeAreas(390, 844); await simulateSafeAreas(page, safe);
  await page.getByRole("switch", { name: "Activer le thème clair" }).click();
  await expect(page.getByRole("heading", { name: "Tournez votre téléphone" })).toBeVisible();
  await expect(page.locator(".coinche-game-scene, .coinche-scene-hand-card button")).toHaveCount(0);
  await expect(page.locator(".coinche-global-header")).toHaveAttribute("data-header-variant", "compact-game");
  await captureQaSnapshot(page, info, "solo", "portrait-notice"); await qa.checkpoint("solo-portrait-light");
  await page.getByRole("link", { name: "Accueil — KFFR Contrée" }).click();
  await expect(page.locator(".coinche-global-header")).toHaveAttribute("data-header-variant", "default");
  await expect(page.locator(".coinche-global-header")).toHaveCSS("height", `${56 + safe.top}px`);
  await qa.checkpoint("solo-playing-exit");
});

for (const action of ["Capot", "Surcontrer"] as const) test(`@mobile @pwa-final-qa ${action} confirmation hides underlying choices`, async ({ page, qa }) => {
  const state = mobileGameState();
  if (action === "Surcontrer") state.bids = [{ playerId: 0, action: "bid", value: 90, trump: "hearts" }, { playerId: 1, action: "coinche" }];
  const fixture = await installMobileGameFixture(page, state);
  await setMobileViewport(page, { width: 568, height: 320 }); await page.goto("/solo");
  const safe = qaSafeAreas(568, 320, true); await simulateSafeAreas(page, safe);
  const trigger = page.getByRole("button", { name: action, exact: true }); await qa.control(trigger, safe);
  await trigger.focus(); await page.keyboard.press("Enter");
  const dialog = page.getByRole("alertdialog"); await expect(page.locator(".coinche-bidding-layout")).toBeHidden();
  await expect(page.locator(".coinche-bidding-layout")).toHaveAttribute("inert", "");
  if (action === "Surcontrer") await expect(page.locator(".coinche-bidding-empty")).toBeHidden();
  for (const label of ["Confirmer", "Annuler"]) await qa.control(dialog.getByRole("button", { name: label }), safe);
  await page.keyboard.press("Escape"); await expect(trigger).toBeFocused();
  expect(fixture.intents).toEqual([]); await qa.checkpoint(`${action}-confirmation`);
});

test("@mobile @pwa-final-qa four Training families retain feedback across navigation", async ({ page, qa }) => {
  test.setTimeout(90_000);
  await installTrainingMobileFixture(page);
  await setMobileViewport(page, { width: 390, height: 844 });
  for (const axis of ["trick-value", "master-cards", "opponent-voids", "bid-reading"]) {
    await page.goto(`/training/puzzle/${axis}?level=1`); await simulateSafeAreas(page, qaSafeAreas(390, 844));
    await expect(page.getByLabel("Exercice 1 sur 10")).toBeVisible();
    if (axis === "master-cards" || axis === "opponent-voids") await page.getByRole("button", { name: "Répondre", exact: true }).click();
    if (axis === "trick-value") await page.getByRole("textbox", { name: "Ta réponse en points" }).fill("0");
    const label = axis === "master-cards" ? "Valider : aucune carte" : axis === "opponent-voids" ? "Valider la réponse" : "Valider";
    const action = page.getByRole("button", { name: label, exact: true });
    await qa.control(action, qaSafeAreas(390, 844), true); await action.focus(); await page.keyboard.press("Enter");
    await expect(page.locator(".training-feedback")).toBeVisible();
    await qa.control(page.getByRole("button", { name: "Exercice suivant" }), qaSafeAreas(390, 844), true);
    await qa.checkpoint(`training-${axis}-feedback`);
  }
});

test("@mobile @pwa-final-qa real Training question, resume and exit restore chrome", async ({ page, qa }) => {
  test.setTimeout(90_000);
  await installTrainingMobileFixture(page);
  const { dialog } = await openFirstTrainingQuestion(page);
  await setMobileViewport(page, { width: 568, height: 320 }); const safe = qaSafeAreas(568, 320); await simulateSafeAreas(page, safe);
  await qa.control(dialog.getByRole("button", { name: "Valider", exact: true }), safe);
  await dialog.getByRole("textbox", { name: "Ta réponse en points" }).fill("0");
  await dialog.getByRole("button", { name: "Valider", exact: true }).click();
  await qa.control(dialog.getByRole("button", { name: "Reprendre la partie" }), safe);
  await dialog.getByRole("button", { name: "Reprendre la partie" }).click(); await expect(dialog).toHaveCount(0);
  await expect(page.locator(".coinche-global-header")).toHaveAttribute("data-header-variant", "compact-game");
  await page.getByRole("link", { name: "Accueil — KFFR Contrée" }).click();
  await expect(page.locator(".coinche-global-header")).toHaveAttribute("data-header-variant", "default");
  await qa.checkpoint("training-exit");
});

for (const viewport of [{ width: 768, height: 900 }, { width: 1024, height: 768 }, ...DESKTOP_VIEWPORTS]) {
  test(`@mobile @pwa-final-qa tablet desktop route smoke ${viewport.width}x${viewport.height}`, async ({ page, qa }) => {
    const fixture = await installFinalQaFixture(page, "dark", false);
    if (viewport.width < 1120) await simulatePwaEnvironment(page, { ua: IPAD_UA, platform: "MacIntel", touch: 5 });
    await setMobileViewport(page, viewport);
    await page.goto("/");
    if (viewport.width < 1120) expect(await page.evaluate(() => navigator.userAgent)).toContain("iPad");
    else expect(await page.evaluate(() => navigator.userAgent)).not.toContain("iPad");
    for (const path of ["/", "/friends", "/training", "/multiplayer", "/solo"]) {
      if (path !== "/") await navigateRoute(page, path);
      await expect(page.locator(".coinche-global-header")).toBeVisible();
      await expect(page.getByRole("heading", { name: "Installer KFFR pour continuer" })).toHaveCount(0);
      await expect(page.locator(".coinche-global-header")).toHaveAttribute("data-header-variant", "default");
      await qa.checkpoint(path);
    }
    await page.getByRole("button", { name: "Commencer la partie" }).click();
    await expect(page.locator(".coinche-game-scene")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Tournez votre téléphone" })).toHaveCount(0);
    await expect(page.locator(".coinche-global-header")).toHaveCSS("height", "56px");
    await qa.checkpoint("desktop-tablet-game");
    expect(fixture.lobby.intents).toEqual([]);
  });
}
