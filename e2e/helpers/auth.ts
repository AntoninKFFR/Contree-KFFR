import { expect, type Page } from "@playwright/test";

export type E2ECredentials = { email: string; password: string };

export function fourPlayerCredentials(): { credentials: E2ECredentials[]; missing: string[] } {
  const credentials: E2ECredentials[] = [];
  const missing: string[] = [];
  for (let player = 1; player <= 4; player += 1) {
    const emailName = `E2E_USER_${player}_EMAIL`;
    const passwordName = `E2E_USER_${player}_PASSWORD`;
    const email = process.env[emailName]?.trim();
    const password = process.env[passwordName];
    if (!email) missing.push(emailName);
    if (!password) missing.push(passwordName);
    if (email && password) credentials.push({ email, password });
  }
  if (credentials.length === 4 && new Set(credentials.map(({ email }) => email.toLocaleLowerCase())).size !== 4) {
    missing.push("E2E_USER_EMAILS_MUST_BE_DISTINCT");
  }
  return { credentials, missing };
}

export async function loginAs(page: Page, credentials: E2ECredentials): Promise<void> {
  await page.goto("/login");
  await expect(page.getByRole("heading", { name: "Connexion" })).toBeVisible();
  await page.getByLabel("Email").fill(credentials.email);
  await page.getByLabel("Mot de passe").fill(credentials.password);
  await page.getByRole("button", { name: "Se connecter" }).click();
  await expect(page.getByText("Connexion réussie.", { exact: true })).toBeVisible();
  await expect(page.getByText(/^Connecté avec /)).toBeVisible();
  await expect.poll(async () => page.evaluate(() => Object.keys(localStorage).some((key) => key.startsWith("sb-") && key.endsWith("-auth-token")))).toBe(true);
}
