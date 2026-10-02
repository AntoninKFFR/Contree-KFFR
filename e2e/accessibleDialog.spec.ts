import { expect, test } from "@playwright/test";
import { installMobileNavigationFixture } from "./helpers/mobileNavigationFixture";

test("@mobile @navigation settings summary and closed/open details preserve native Tab and Shift+Tab", async ({ page }) => {
  await installMobileNavigationFixture(page);
  await page.setViewportSize({ width: 844, height: 390 }); await page.goto("/solo");
  await page.getByRole("button", { name: "Menu Partie" }).click();
  await page.getByRole("complementary", { name: "Menu de partie" }).getByRole("button", { name: "Paramètres" }).click();
  const dialog = page.getByRole("dialog", { name: "Paramètres" });
  const close = dialog.getByRole("button", { name: "Fermer les paramètres" });
  const summary = dialog.locator("summary").filter({ hasText: "Réglages avancés" });
  const details = summary.locator("..");
  const preceding = dialog.getByRole("checkbox", { name: "Confirmer la Générale" });
  const sliders = details.locator('input[type="range"]');
  await expect(details).not.toHaveAttribute("open"); await preceding.focus();
  await page.keyboard.press("Tab"); await expect(summary).toBeFocused();
  await page.keyboard.press("Shift+Tab"); await expect(preceding).toBeFocused();
  await page.keyboard.press("Tab"); await expect(summary).toBeFocused();
  await page.keyboard.press("Tab"); await expect(close).toBeFocused();
  await page.keyboard.press("Shift+Tab"); await expect(summary).toBeFocused();
  await page.keyboard.press("Enter"); await expect(details).toHaveAttribute("open");
  for (let index = 0; index < 3; index++) {
    await page.keyboard.press("Tab"); await expect(sliders.nth(index)).toBeFocused();
  }
  await page.keyboard.press("Tab"); await expect(close).toBeFocused();
  for (let index = 2; index >= 0; index--) {
    await page.keyboard.press("Shift+Tab"); await expect(sliders.nth(index)).toBeFocused();
  }
  await page.keyboard.press("Shift+Tab"); await expect(summary).toBeFocused();
  await page.keyboard.press("Enter"); await expect(details).not.toHaveAttribute("open");
  await page.keyboard.press("Tab"); await expect(close).toBeFocused();
  await page.getByRole("button", { name: "Menu Partie" }).focus(); await expect(close).toBeFocused();
  await page.keyboard.press("Escape"); await expect(dialog).toHaveCount(0);
  await expect(page.locator("body")).not.toHaveCSS("overflow", "hidden");
});

test("@mobile @navigation settings above the drawer keep dialogStack priority and restore focus", async ({ page }) => {
  await installMobileNavigationFixture(page);
  await page.setViewportSize({ width: 844, height: 390 }); await page.goto("/solo");
  await page.getByRole("button", { name: "Menu Partie" }).click();
  // Exercise overlapping lifetimes using the real menu callbacks, without a test-only app route.
  await page.evaluate(() => {
    const preferences = [...document.querySelectorAll<HTMLButtonElement>("#game-menu-panel button")].find((button) => button.textContent === "Paramètres")!;
    document.querySelector<HTMLButtonElement>('button[aria-label="Ouvrir le menu"]')!.click();
    preferences.click();
  });
  const navigation = page.getByRole("dialog", { name: "Navigation KFFR" });
  const settings = page.getByRole("dialog", { name: "Paramètres" });
  await expect(navigation).toBeVisible(); await expect(settings).toBeVisible();
  const close = settings.getByRole("button", { name: "Fermer les paramètres" });
  await expect(close).toBeFocused();
  await navigation.getByRole("button", { name: "Fermer le menu" }).focus(); await expect(close).toBeFocused();
  await page.keyboard.press("Shift+Tab"); await expect(settings.locator("summary")).toBeFocused();
  await page.keyboard.press("Tab"); await expect(close).toBeFocused();
  await page.keyboard.press("Escape"); await expect(settings).toHaveCount(0); await expect(navigation).toBeVisible();
  const navigationClose = navigation.getByRole("button", { name: "Fermer le menu" });
  await expect(navigationClose).toBeFocused(); await expect(page.locator("body")).toHaveCSS("overflow", "hidden");
  await page.keyboard.press("Shift+Tab"); await expect(navigation.getByRole("link", { name: "Ma progression" })).toBeFocused();
  await page.keyboard.press("Tab"); await expect(navigationClose).toBeFocused();
  await page.keyboard.press("Escape"); await expect(navigation).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Ouvrir le menu" })).toBeFocused();
  await expect(page.locator("body")).not.toHaveCSS("overflow", "hidden");
});
