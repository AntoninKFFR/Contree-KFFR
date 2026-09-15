import { expect, test } from "@playwright/test";
import { monitorBrowserErrors } from "./helpers/browserErrors";

test.describe("@smoke public production readiness", () => {
  test("home, login, solo, settings and multiplayer render without browser errors", async ({ page }) => {
    const monitor = monitorBrowserErrors(page);

    await page.goto("/");
    await expect(page.getByRole("heading", { name: "La table est prête." })).toBeVisible();
    await expect(page.getByRole("link", { name: "Jouer en solo" })).toBeVisible();

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
