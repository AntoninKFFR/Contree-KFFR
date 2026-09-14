import { expect, type Page } from "@playwright/test";

export async function createRoomThroughUi(page: Page, displayName: string): Promise<{ code: string; roomId: string }> {
  await page.goto("/multiplayer");
  const section = page.getByRole("heading", { name: "Créer une table" }).locator("..");
  await expect(section).toBeVisible();
  await section.getByLabel("Nom affiché").fill(displayName);
  await section.getByRole("button", { name: "Créer la table" }).click();
  await expect(page).toHaveURL(/\/multiplayer\/[0-9a-f-]+$/i);
  const roomId = new URL(page.url()).pathname.split("/").at(-1)!;
  const code = (await page.locator("h1.font-mono").innerText()).trim();
  expect(code).toMatch(/^[A-Z0-9]+$/);
  await expect(page.getByText(/Statut: en attente/)).toBeVisible();
  return { code, roomId };
}

export async function joinRoomThroughUi(page: Page, code: string, displayName: string): Promise<void> {
  await page.goto("/multiplayer");
  const section = page.getByRole("heading", { name: "Rejoindre une table" }).locator("..");
  await expect(section).toBeVisible();
  await section.getByLabel("Nom affiché").fill(displayName);
  await section.getByLabel("Code de table").fill(code);
  await section.getByRole("button", { name: "Rejoindre la table" }).click();
  await expect(page).toHaveURL(/\/multiplayer\/[0-9a-f-]+$/i);
  await expect(page.getByRole("heading", { name: code })).toBeVisible();
}

export async function setLocalPreferences(
  page: Page,
  values: { speed: "fast" | "slow"; cardSize: "large" | "small"; theme: "midnight-blue" | "classic-green" },
): Promise<void> {
  await page.getByRole("button", { name: "Paramètres" }).click();
  const dialog = page.getByRole("dialog", { name: "Paramètres" });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel("Vitesse de jeu").selectOption(values.speed);
  await dialog.getByRole("button", { name: "CARTES" }).click();
  await dialog.getByLabel("Taille des cartes").selectOption(values.cardSize);
  await dialog.getByRole("button", { name: "AFFICHAGE" }).click();
  await dialog.getByLabel("Tapis de jeu").selectOption(values.theme);
  await dialog.getByRole("button", { name: "Fermer Paramètres" }).click();
  await expect(dialog).toBeHidden();
}

export async function enableTechnicalRules(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Modifier les règles" }).click();
  const dialog = page.getByRole("dialog", { name: "Règles de la table" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("combobox", { name: "Score cible" }).selectOption("1500");
  await dialog.getByRole("button", { name: /Contrats/i }).click();
  const contracts = dialog.locator('section[aria-labelledby="rules-contracts"]');
  await contracts.getByRole("checkbox", { name: /^Sans Atout/ }).check();
  await contracts.getByRole("checkbox", { name: /^Tout Atout/ }).check();
  await contracts.getByRole("checkbox", { name: /^Générale/ }).check();
  await dialog.getByRole("button", { name: "Enregistrer les règles" }).click();
  await expect(dialog).toBeHidden();
}
