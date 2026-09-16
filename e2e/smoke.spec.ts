import { expect, test } from "@playwright/test";
import { monitorBrowserErrors } from "./helpers/browserErrors";

test.describe("@smoke public production readiness", () => {
  test("@smoke rules reference stays readable in both themes and responsive widths", async ({ page }) => {
    const monitor = monitorBrowserErrors(page);
    await page.goto("/rules");
    await expect(page.getByRole("heading", { name: "Règles de la Contrée" })).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Navigation des règles" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Contrée KFFR", exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Variantes disponibles" })).toHaveCount(1);

    for (const viewport of [{ width: 1366, height: 768 }, { width: 844, height: 390 }, { width: 375, height: 667 }]) {
      await page.setViewportSize(viewport);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
      await expect(page.getByRole("navigation", { name: "Navigation des règles" })).toBeVisible();
    }

    await page.getByRole("link", { name: "Variantes disponibles" }).click();
    await expect(page).toHaveURL(/#variantes-disponibles$/);
    await expect(page.getByRole("heading", { name: "Variantes disponibles" })).toBeInViewport();
    await expect(page.getByRole("navigation", { name: "Navigation des règles" })).toBeInViewport();
    await page.getByRole("switch", { name: "Activer le thème clair" }).click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
    await expect(page.locator(".coinche-app-page")).toHaveCSS("background-color", "rgb(238, 234, 222)");
    await expect(page.locator("#variante-contrats")).toHaveCSS("background-color", "rgb(255, 253, 247)");
    monitor.assertClean();
  });

  test("home, login, solo, settings and multiplayer render without browser errors", async ({ page }) => {
    const monitor = monitorBrowserErrors(page);

    await page.goto("/");
    await expect(page.getByRole("heading", { name: "La contrée, en solo ou entre amis" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Jouer en solo" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Multijoueur" })).toHaveAttribute("href", "/multiplayer");
    await expect(page.getByText("Joue une vraie partie de Contrée, seul ou avec tes proches.")).toHaveCount(0);
    await expect(page.getByRole("region", { name: "Points forts" })).toHaveCount(0);

    await page.goto("/login");
    await expect(page.getByRole("heading", { name: "Connexion" })).toBeVisible();
    await expect(page.getByLabel("Email")).toBeVisible();
    await expect(page.getByLabel("Mot de passe")).toHaveAttribute("type", "password");

    await page.goto("/solo");
    await expect(page.getByRole("button", { name: "Ouvrir le menu de partie" })).toBeVisible();
    await page.getByRole("button", { name: "Ouvrir le menu de partie" }).click();
    await page.getByRole("complementary", { name: "Menu de partie" }).getByRole("button", { name: "Paramètres" }).click();
    await expect(page.getByRole("dialog", { name: "Paramètres" })).toBeVisible();
    await expect(page.getByLabel("Vitesse de jeu")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog", { name: "Paramètres" })).toBeHidden();

    await page.getByRole("button", { name: "Ouvrir le menu de partie" }).click();
    await page.getByRole("button", { name: "Règles de la prochaine partie" }).click();
    const rulesDialog = page.getByRole("dialog", { name: "Règles de la prochaine partie" });
    await rulesDialog.getByRole("combobox", { name: "Score cible" }).selectOption("1500");
    await rulesDialog.getByRole("button", { name: /Contrats/i }).click();
    const contracts = rulesDialog.locator('section[aria-labelledby="rules-contracts"]');
    await contracts.getByRole("checkbox", { name: /^Sans Atout/ }).check();
    await contracts.getByRole("checkbox", { name: /^Tout Atout/ }).check();
    await contracts.getByRole("checkbox", { name: /^Générale/ }).check();
    await rulesDialog.getByRole("button", { name: "Appliquer et nouvelle partie" }).click();
    await expect(rulesDialog).toBeHidden();

    await page.goto("/multiplayer");
    await expect(page.getByRole("heading", { name: "Une table, quatre places" })).toBeVisible();
    await expect(page.getByText(/Connecte-toi|Supabase est indisponible|Créer une table/)).toBeVisible();
    monitor.assertClean();
  });

  test("@smoke rules editor keeps custom target score editing fluid", async ({ page }) => {
    await page.goto("/solo");
    await page.getByRole("button", { name: "Ouvrir le menu de partie" }).click();
    await page.getByRole("button", { name: "Règles de la prochaine partie" }).click();

    const dialog = page.getByRole("dialog", { name: "Règles de la prochaine partie" });
    const dialogSurface = dialog.locator(".coinche-dialog");
    const initialSize = await dialogSurface.evaluate((element) => ({ height: element.clientHeight, width: element.clientWidth }));
    for (const section of ["Contrats", "Annonces", "Belote", "Jeu", "Réussite du contrat", "Score", "Avancé", "Partie"]) {
      await dialog.getByRole("button", { name: section, exact: true }).click();
      await expect.poll(() => dialogSurface.evaluate((element) => ({ height: element.clientHeight, width: element.clientWidth }))).toEqual(initialSize);
    }
    const targetScore = dialog.getByRole("spinbutton", { name: "Score cible personnalisé" });

    await targetScore.click();
    await page.keyboard.press("Control+A");
    await page.keyboard.press("Backspace");
    await expect(targetScore).toHaveValue("");
    await targetScore.fill("2000");
    await page.keyboard.press("Enter");
    await expect(targetScore).toHaveValue("2000");

    await targetScore.fill("1500");
    await page.keyboard.press("ArrowUp");
    await expect(targetScore).toHaveValue("2000");
    await page.keyboard.press("ArrowDown");
    await expect(targetScore).toHaveValue("1500");

    await dialog.getByRole("button", { name: "Jeu", exact: true }).click();
    await expect(dialog.getByRole("heading", { name: "Jeu", exact: true })).toBeVisible();
    await expect(dialog.getByText("Jeu de la carte", { exact: true })).toHaveCount(0);
    await dialog.getByRole("button", { name: "Score", exact: true }).click();
    await expect(dialog.getByRole("combobox", { name: "Mode de score" })).toHaveValue("ffb");
    await expect(dialog.getByRole("option", { name: "Officiel" })).toHaveJSProperty("selected", true);
    await expect(dialog.getByText("Règles partagées", { exact: true })).toHaveCount(0);
    await expect(dialog.getByText("Préférences perso inchangées", { exact: true })).toHaveCount(0);
    await expect(dialog.getByText(/Différences avec Contrée KFFR/)).toHaveCount(0);
  });

  test("@smoke multiplayer preferences reuse the stable settings experience", async ({ page }) => {
    await page.goto("/multiplayer");
    const opener = page.getByRole("button", { name: "Préférences", exact: true });
    await opener.click();

    const dialog = page.getByRole("dialog", { name: "Préférences" });
    const surface = dialog.locator(".coinche-dialog");
    await expect(dialog.locator(".coinche-settings-panel")).toBeVisible();
    await expect(dialog.locator(".coinche-settings-panel")).toHaveCSS("background-color", "rgb(9, 23, 17)");
    await expect(dialog.getByRole("searchbox", { name: "Rechercher un paramètre" })).toHaveCSS("background-color", "rgba(0, 0, 0, 0.2)");
    await expect(dialog.getByText(/Rythme de la table :/).locator("..")).toHaveCSS("background-color", "rgba(255, 255, 255, 0.043)");
    await expect(dialog.getByRole("button", { name: "Réinitialiser mes paramètres" })).toBeVisible();
    const initialSize = await surface.evaluate((element) => ({ height: element.clientHeight, width: element.clientWidth }));
    for (const section of ["AIDES", "CARTES", "AFFICHAGE", "SON", "ACCESSIBILITÉ", "JEU"]) {
      await dialog.getByRole("button", { name: section, exact: true }).click();
      await expect.poll(() => surface.evaluate((element) => ({ height: element.clientHeight, width: element.clientWidth }))).toEqual(initialSize);
    }

    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(opener).toBeFocused();

    await page.setViewportSize({ width: 844, height: 390 });
    await opener.click();
    await expect(dialog.locator(".coinche-settings-panel")).toBeVisible();
    const mobileSize = await surface.evaluate((element) => ({ height: element.clientHeight, width: element.clientWidth }));
    for (const section of ["CARTES", "AFFICHAGE", "ACCESSIBILITÉ", "JEU"]) {
      await dialog.getByRole("button", { name: section, exact: true }).click();
      await expect.poll(() => surface.evaluate((element) => ({ height: element.clientHeight, width: element.clientWidth }))).toEqual(mobileSize);
    }
    await expect(dialog.getByRole("heading", { name: "Jeu", exact: true }).locator("..").locator("..")).toHaveCSS("overflow-y", "auto");
    await expect(dialog.getByRole("button", { name: "Réinitialiser mes paramètres" })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    await dialog.getByRole("button", { name: "Fermer les préférences" }).click();
    await expect(dialog).toBeHidden();
    await expect(opener).toBeFocused();

    await opener.click();
    await dialog.click({ position: { x: 1, y: 1 } });
    await expect(dialog).toBeHidden();
    await expect(opener).toBeFocused();
  });

  test("@smoke global light theme is immediate, persistent and responsive", async ({ page }) => {
    await page.goto("/multiplayer");
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    const navigationToggle = page.getByRole("switch", { name: "Activer le thème clair" });
    await expect(navigationToggle).toBeVisible();
    await navigationToggle.click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
    await page.getByRole("button", { name: "Préférences", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Préférences" });
    await dialog.getByRole("button", { name: "AFFICHAGE", exact: true }).click();
    await expect(dialog.getByText("Apparence", { exact: true })).toHaveCount(0);
    await expect(dialog.getByRole("button", { name: "Clair", exact: true })).toHaveCount(0);
    await expect(dialog.getByRole("button", { name: "Sombre", exact: true })).toHaveCount(0);
    await expect(dialog.locator(".coinche-settings-panel")).toHaveCSS("background-color", "rgb(238, 234, 222)");
    await dialog.getByRole("button", { name: "Fermer les préférences" }).click();

    for (const path of ["/", "/rules", "/solo", "/multiplayer"]) {
      await page.goto(path);
      await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
      await expect(page.locator("body")).toHaveCSS("background-color", "rgb(238, 234, 222)");
    }
    await page.goto("/solo");
    await expect(page.getByRole("switch", { name: "Activer le thème sombre" })).toBeVisible();
    await expect(page.locator(".coinche-game-table")).toBeVisible();
    await expect(page.locator(".coinche-game-table")).toHaveCSS("background-color", "rgb(13, 91, 60)");
    await page.getByRole("button", { name: "Ouvrir le menu de partie" }).click();
    await page.getByRole("button", { name: "Règles de la prochaine partie" }).click();
    const rulesDialog = page.getByRole("dialog", { name: "Règles de la prochaine partie" });
    await expect(rulesDialog.locator(".coinche-rules-configurator")).toHaveCSS("background-color", "rgb(238, 234, 222)");
    await expect(rulesDialog.getByRole("spinbutton", { name: "Score cible personnalisé" })).toHaveCSS("color", "rgb(23, 32, 26)");
    await page.keyboard.press("Escape");
    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");

    await page.setViewportSize({ width: 844, height: 390 });
    await page.goto("/");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);

    await page.goto("/multiplayer");
    await page.getByRole("switch", { name: "Activer le thème sombre" }).click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  });

  test("@smoke KFFR branding is theme-aware, compact and responsive", async ({ page }) => {
    await page.goto("/");
    const header = page.locator(".coinche-global-header");
    const fullLogo = page.locator(".coinche-brand-logo--full");
    const compactLogo = header.locator(".coinche-brand-logo--compact");

    await expect(header.locator(":scope > div")).toHaveCSS("height", "56px");
    expect(await header.evaluate((element) => element.getBoundingClientRect().height)).toBeLessThanOrEqual(57);
    await expect(fullLogo).toBeVisible();
    await expect(compactLogo).toBeVisible();
    await expect(fullLogo.locator(".coinche-brand-logo__image--dark")).toBeVisible();
    await expect(fullLogo.locator(".coinche-brand-logo__image--light")).toBeHidden();
    await expect(page.locator('link[rel="icon"]')).toHaveAttribute("sizes", "48x48");
    await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveAttribute("sizes", "180x180");

    await page.getByRole("switch", { name: "Activer le thème clair" }).click();
    await expect(fullLogo.locator(".coinche-brand-logo__image--dark")).toBeHidden();
    await expect(fullLogo.locator(".coinche-brand-logo__image--light")).toBeVisible();

    for (const viewport of [
      { width: 1920, height: 1080 },
      { width: 1366, height: 768 },
      { width: 375, height: 667 },
      { width: 844, height: 390 },
    ]) {
      await page.setViewportSize(viewport);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
      await expect(compactLogo).toBeVisible();
      await expect(fullLogo).toBeVisible();
    }

    await page.setViewportSize({ width: 844, height: 390 });
    await page.goto("/solo");
    await expect(page.locator(".coinche-game-topbar")).toHaveCSS("height", "48px");
    await expect(page.locator(".coinche-game-topbar .coinche-brand-logo--compact")).toBeVisible();
  });

  for (const viewport of [
    { name: "mobile portrait", width: 375, height: 667 },
    { name: "mobile landscape", width: 844, height: 390 },
    { name: "desktop", width: 1366, height: 768 },
  ]) {
    test(`critical pages have no horizontal overflow at ${viewport.name}`, async ({ page }) => {
      const monitor = monitorBrowserErrors(page);
      await page.setViewportSize(viewport);
      for (const path of ["/", "/login", "/solo", "/multiplayer", "/history", "/profile", "/rules"]) {
        await page.goto(path);
        await expect.poll(async () => page.evaluate(() => document.readyState)).toMatch(/interactive|complete/);
        const overflow = await page.evaluate(() => Math.max(document.body.scrollWidth, document.documentElement.scrollWidth) - window.innerWidth);
        expect(overflow, `${path} horizontal overflow`).toBeLessThanOrEqual(1);
      }
      monitor.assertClean();
    });
  }
});
