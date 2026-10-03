import { expect, test, type Locator, type Page } from "@playwright/test";
import { installTrainingMobileFixture, TRAINING_VIEWPORTS } from "./helpers/trainingMobileFixture";
import { expectInsideSafeViewport, expectNoPageHorizontalOverflow, setMobileViewport, simulateSafeAreas } from "./helpers/mobile";
import { monitorBrowserErrors } from "./helpers/browserErrors";
import { trainingUIFixture, LONG_TRAINING_NAME, LONG_TRAINING_LEVEL } from "./helpers/trainingUIFixture";

const themes = ["dark", "light"] as const;
const safe = { top: 24, bottom: 34, left: 0, right: 0 };
const card = (page: Page, name: string) => page.locator(".training-mode-card").filter({ has: page.getByRole("heading", { name, exact: true }) });

async function touchTargets(locator: Locator) {
  const boxes = await locator.evaluateAll((elements) => elements.map((element) => { const box = element.getBoundingClientRect(); return { width: box.width, height: box.height }; }));
  expect(boxes.length).toBeGreaterThan(0);
  for (const box of boxes) { expect(Math.round(box.width * 1000) / 1000).toBeGreaterThanOrEqual(44); expect(Math.round(box.height * 1000) / 1000).toBeGreaterThanOrEqual(44); }
}
async function reachable(page: Page, action: Locator) {
  // A browser viewport includes the home-indicator area. Center the real control
  // with native document scrolling before checking its safe-area bounds.
  await action.evaluate((element) => element.scrollIntoView({ block: "center" }));
  await expectInsideSafeViewport(page, action, safe);
  await touchTargets(action);
}
async function anchorBelowHeader(page: Page, id: string) {
  const heading = page.locator(`#${id} h2`);
  await expect(heading).toBeInViewport();
  await expect.poll(async () => (await heading.boundingBox())!.y - ((await page.locator(".coinche-global-header").boundingBox())!.y + (await page.locator(".coinche-global-header").boundingBox())!.height)).toBeGreaterThanOrEqual(2);
}

for (const theme of themes) for (const records of ["guest", "empty", "multiple", "error"] as const) {
  test(`@mobile @training-mobile hub matrix ${theme} ${records}`, async ({ page }) => {
    test.setTimeout(90000);
    const errors = monitorBrowserErrors(page);
    await installTrainingMobileFixture(page, { theme, records, unlocked: records === "multiple" });
    await page.goto("/training");
    if (records === "guest") await expect(page.getByText("Connecte-toi pour synchroniser tes records. Les annonces restent locales.")).toBeVisible();
    if (records === "error") await expect(page.getByText("Records du compte indisponibles pour le moment.")).toBeVisible();
    if (records === "multiple") {
      await expect(page.getByText("Record compte : 10 / 10 · Meilleur temps : 123,4 s · Niveau 4")).toBeVisible();
      await expect(card(page, "Valeur d’un pli").getByText("Niveau 1 · Record local : 10 / 10")).toBeVisible();
      await expect(card(page, "Valeur d’un pli").locator(".training-card-record")).toHaveCount(4);
      await expect(page.getByRole("link", { name: "Jouer en Survie" })).toBeVisible();
      await expect(page.getByRole("link", { name: "Compter son tas en mode Normal" })).toBeVisible();
    } else {
      await expect(card(page, "Valeur d’un pli").getByRole("link", { name: "Niveau 1 · Fondamentaux" })).toHaveAttribute("aria-current", "step");
      await expect(card(page, "Valeur d’un pli").getByLabel("Niveau 2 verrouillé")).toHaveJSProperty("tagName", "SPAN");
      await expect(page.getByRole("link", { name: "Jouer en Survie" })).toHaveCount(0);
      await expect(page.getByRole("link", { name: "Compter son tas en mode Normal" })).toHaveCount(0);
    }
    const featured = card(page, "Lire les enchères");
    await expect(featured).toHaveClass(/training-mode-card-featured/);
    await expect(featured.getByRole("link", { name: "Jouer à deux" })).toHaveAttribute("href", "/training/duo");
    await expect(featured.getByRole("link", { name: "Voir les conventions" })).toHaveAttribute("href", "/training/conventions/bidding");
    for (const viewport of TRAINING_VIEWPORTS) {
      await setMobileViewport(page, viewport); await simulateSafeAreas(page, safe);
      await expectNoPageHorizontalOverflow(page);
      if (viewport.width === 390 && records === "multiple") {
        // Compare the scoped density with the existing base styles in the same
        // browser: platform fonts can change wrapping and absolute heights.
        await page.evaluate(() => document.fonts.ready);
        const header = page.locator(".coinche-page-header");
        const section = page.locator("#calculer");
        const trickCard = card(page, "Valeur d’un pli");
        const compact = { header: (await header.boundingBox())!.height, section: (await section.boundingBox())!.height, card: (await trickCard.boundingBox())!.height };
        const trainingPage = page.locator(".training-page");
        await trainingPage.evaluate((element) => element.classList.remove("training-page"));
        const base = { header: (await header.boundingBox())!.height, section: (await section.boundingBox())!.height, card: (await trickCard.boundingBox())!.height };
        await page.locator(".coinche-app-page").evaluate((element) => element.classList.add("training-page"));
        expect(compact.header).toBeLessThan(base.header);
        expect(compact.section).toBeLessThan(base.section * .85);
        expect(compact.card).toBeLessThan(base.card * .9);
        expect((await card(page, "Valeur d’un pli").locator(".training-level-track").boundingBox())!.height).toBe(44);
      }
      await touchTargets(page.locator(".training-card-action, .training-level-available"));
      // Do not hide overflowing descriptions, metadata or level tracks inside a card.
      expect(await page.locator(".training-mode-card, .training-level-track").evaluateAll((elements) => elements.every((element) => element.scrollWidth <= element.clientWidth))).toBe(true);
      for (const id of ["calculer", "memoriser", "deduire", "annoncer"]) await expect(page.locator(`#${id} h2`)).toBeVisible();
      await reachable(page, featured.getByRole("link", { name: "Jouer en solo" }));
    }
    if (records !== "error") errors.assertClean(); // The 500 response is intentional in the account failure fixture.
  });
}

for (const viewport of [{ width: 390, height: 844 }, { width: 844, height: 390 }]) {
  test(`@mobile @training-mobile fresh anchors and real drawer ${viewport.width}`, async ({ page }) => {
    await installTrainingMobileFixture(page);
    await page.addInitScript(() => document.addEventListener("DOMContentLoaded", () => { document.documentElement.style.setProperty("--safe-top", "47px"); }));
    await setMobileViewport(page, viewport);
    for (const id of ["calculer", "memoriser", "deduire", "annoncer"]) {
      await page.goto(`/training#${id}`); await anchorBelowHeader(page, id); await expectNoPageHorizontalOverflow(page);
    }
    await page.goto("/"); await page.getByRole("button", { name: "Ouvrir le menu" }).click();
    const navigation = page.getByRole("navigation", { name: "Navigation mobile" });
    await navigation.getByRole("button", { name: "Entraînement", exact: true }).click();
    await navigation.getByRole("link", { name: "Mémoriser", exact: true }).click();
    await expect(page).toHaveURL(/\/training#memoriser$/); await expect(page.getByRole("dialog", { name: "Navigation KFFR" })).toHaveCount(0);
    await anchorBelowHeader(page, "memoriser");
  });
}

const families = [
  { axis: "trick-value", content: "Cartes du pli", action: "Valider", study: false },
  { axis: "master-cards", content: "Phase d’observation", action: "Répondre", study: true },
  { axis: "opponent-voids", content: "Phase d’observation", action: "Répondre", study: true },
  { axis: "bidding", content: "Ta main", action: "Passer", study: false },
  { axis: "bid-reading", content: "Historique public des enchères", action: "Valider", study: false },
] as const;

for (const theme of themes) for (const family of families) {
  test(`@mobile @training-mobile ${family.axis} question feedback and result matrix ${theme}`, async ({ page }) => {
    test.setTimeout(120000);
    const errors = monitorBrowserErrors(page);
    await installTrainingMobileFixture(page, { theme }); await page.goto(`/training/puzzle/${family.axis}?level=1`);
    await expect(page.getByLabel("Exercice 1 sur 10")).toBeVisible();
    for (const viewport of TRAINING_VIEWPORTS) {
      await setMobileViewport(page, viewport); await simulateSafeAreas(page, safe);
      const header = page.locator(".training-session-header"); await header.scrollIntoViewIfNeeded();
      await expect(header).toBeInViewport();
      if (viewport.width === 390 || viewport.width === 844) expect((await header.boundingBox())!.height).toBeLessThan(120);
      const content = family.axis === "bidding" ? page.getByText(family.content, { exact: true }) : page.getByLabel(family.content, { exact: true });
      await expect(content).toBeVisible();
      await expect(page.getByRole("progressbar", { name: "Progression de la série" })).toHaveAttribute("aria-valuenow", "1");
      await reachable(page, page.getByRole("button", { name: family.action, exact: true }));
      await expectNoPageHorizontalOverflow(page);
    }
    if (family.study) {
      await page.getByRole("button", { name: "Répondre", exact: true }).click();
      for (const viewport of TRAINING_VIEWPORTS) {
        await setMobileViewport(page, viewport);
        await touchTargets(page.locator('[aria-label="Sélection des cartes"] button, [aria-label="Grille des coupures"] button'));
        await reachable(page, page.getByRole("button", { name: family.axis === "master-cards" ? "Valider : aucune carte" : "Valider la réponse", exact: true }));
        await expectNoPageHorizontalOverflow(page);
      }
    }
    const submit = async (alreadyAnswering = false) => {
      if (family.study && !alreadyAnswering) await page.getByRole("button", { name: "Répondre", exact: true }).click();
      if (family.axis === "trick-value") await page.getByRole("textbox", { name: "Ta réponse en points" }).fill("0");
      await page.getByRole("button", { name: family.axis === "master-cards" ? "Valider : aucune carte" : family.axis === "opponent-voids" ? "Valider la réponse" : family.action, exact: true }).click();
    };
    await submit(true);
    await expect(page.locator(".training-feedback")).toBeVisible();
    if (family.axis === "bidding" || family.axis === "bid-reading") await expect(page.getByRole("button", { name: "Exercice suivant" })).toBeFocused();
    for (const viewport of TRAINING_VIEWPORTS) {
      await setMobileViewport(page, viewport);
      await reachable(page, page.getByRole("button", { name: "Exercice suivant" }));
      await expectNoPageHorizontalOverflow(page);
    }
    await page.getByRole("button", { name: "Exercice suivant" }).click();
    for (let index = 2; index <= 10; index++) {
      await expect(page.getByLabel(`Exercice ${index} sur 10`)).toBeVisible();
      await submit(); await page.getByRole("button", { name: index === 10 ? "Voir le résultat" : "Exercice suivant" }).click();
    }
    await expect(page.getByRole("heading", { name: "Résultat", exact: true })).toBeVisible();
    for (const viewport of TRAINING_VIEWPORTS) {
      await setMobileViewport(page, viewport); await simulateSafeAreas(page, safe);
      const actions = page.locator(".training-result-actions").locator("button, a");
      for (const action of await actions.all()) await reachable(page, action);
      await expectNoPageHorizontalOverflow(page);
    }
    errors.assertClean();
  });
}

test("@mobile @training-mobile numeric input keeps focus when the keyboard reduces the viewport", async ({ page }) => {
  await installTrainingMobileFixture(page); await setMobileViewport(page, { width: 390, height: 844 });
  await page.goto("/training/puzzle/trick-value?level=1"); await simulateSafeAreas(page, safe);
  const input = page.getByRole("textbox", { name: "Ta réponse en points" });
  await input.fill("12"); await input.focus();
  expect(await input.evaluate((element) => parseFloat(getComputedStyle(element).fontSize))).toBeGreaterThanOrEqual(16);
  await setMobileViewport(page, { width: 390, height: 380 });
  await expect(input).toBeFocused(); await expect(input).toHaveValue("12");
  await reachable(page, page.getByRole("button", { name: "Valider", exact: true }));
  await expect(input).toBeFocused(); await page.getByRole("button", { name: "Valider", exact: true }).click();
  await expect(page.getByText(/Ce pli vaut \d+ points/)).toBeVisible();
  await reachable(page, page.getByRole("button", { name: "Exercice suivant" })); await expectNoPageHorizontalOverflow(page);
});

for (const theme of themes) test(`@mobile @training-mobile pile briefing, game setup and reduced motion ${theme}`, async ({ page }) => {
  await installTrainingMobileFixture(page, { theme, unlocked: true }); await page.emulateMedia({ reducedMotion: "reduce" });
  for (const viewport of TRAINING_VIEWPORTS) {
    await setMobileViewport(page, viewport); await page.goto("/training/puzzle/pile-count?mode=manual"); await simulateSafeAreas(page, safe);
    await reachable(page, page.getByRole("button", { name: "Commencer à compter" })); await expectNoPageHorizontalOverflow(page);
    await page.goto("/training/game"); await simulateSafeAreas(page, safe);
    await expect(page.getByRole("heading", { name: "Entraînement en partie", exact: true })).toBeVisible();
    await reachable(page, page.getByRole("button", { name: "Lancer la partie" })); await expectNoPageHorizontalOverflow(page);
  }
  await page.goto("/training/puzzle/trick-value?level=1"); await page.getByRole("textbox", { name: "Ta réponse en points" }).fill("0");
  await page.getByRole("button", { name: "Valider", exact: true }).click();
  await expect(page.locator(".training-feedback")).toHaveCSS("animation-name", "none");
});

for (const theme of themes) test(`@mobile @training-mobile shared components retain long text, locked semantics and focus ${theme}`, async ({ page }) => {
  await installTrainingMobileFixture(page, { theme }); await page.goto("/training");
  // Render the real components with production CSS, without adding an application test route.
  await page.locator(".coinche-app-page").evaluate((element, markup) => { element.outerHTML = markup; }, trainingUIFixture());
  await expect(page.getByRole("heading", { name: LONG_TRAINING_NAME })).toHaveCount(2);
  await expect(page.getByText(`Niveau 3 · ${LONG_TRAINING_LEVEL}`, { exact: true })).toHaveCount(2);
  const current = page.getByRole("link", { name: `Niveau 3 · ${LONG_TRAINING_LEVEL}` });
  await expect(current).toHaveAttribute("aria-current", "step");
  await expect(page.getByLabel("Niveau 4 verrouillé")).toHaveJSProperty("tagName", "SPAN");
  for (const viewport of TRAINING_VIEWPORTS) {
    await setMobileViewport(page, viewport); await simulateSafeAreas(page, safe);
    await expectNoPageHorizontalOverflow(page); await touchTargets(page.locator(".training-level-available, .training-card-action"));
    await reachable(page, page.getByRole("button", { name: "Exercice suivant" }));
    await reachable(page, page.getByRole("button", { name: "Rejouer" }));
  }
  await page.keyboard.press("Tab"); await current.focus(); await expect(current).toBeFocused();
  await expect(current).toHaveCSS("outline-style", "solid");
});
