import { expect, test } from "@playwright/test";
import { monitorBrowserErrors } from "./helpers/browserErrors";

test.describe("@smoke public production readiness", () => {
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
