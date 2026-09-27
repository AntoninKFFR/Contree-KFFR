import { expect, type Page, type Response } from "@playwright/test";
import type { TrainingDuoIntent, TrainingDuoView } from "@/lib/trainingDuoTypes";

const apiPrefix = "/api/training/duo/sessions";
const alwaysForbidden = new Set(["host_user_id", "user_id", "seed", "access_token", "email"]);
const beforeRevealForbidden = new Set([
  "promise", "guaranteed", "possibleMeanings", "explanation", "illustrationHand",
  "score", "correct", "answer", "answers", "selectedAssertionIds", "result", "scoreA", "scoreB", "commonSuccesses",
]);

export function monitorDuoTraffic(page: Page) {
  let revealed = false;
  let inspected = 0;
  const accountIds = new Set<string>();
  const errors: string[] = [];
  const pending: Promise<void>[] = [];
  const disallowedWrites: string[] = [];
  const responseHandler = (response: Response) => {
    const path = new URL(response.url()).pathname;
    if (!path.startsWith(apiPrefix) || !response.ok() || response.status() === 204) return;
    const revealAllowedAtRequest = revealed;
    pending.push((async () => {
      try {
        const payload: unknown = await response.json();
        const phase = (payload as { data?: { session?: { questionPhase?: string } } })?.data?.session?.questionPhase;
        const mustRemainPublic = phase === "answering" || !revealAllowedAtRequest;
        const visit = (value: unknown): void => {
          if (!value || typeof value !== "object") return;
          if (Array.isArray(value)) { for (const item of value) visit(item); return; }
          for (const [key, nested] of Object.entries(value)) {
            if (alwaysForbidden.has(key) || (mustRemainPublic && beforeRevealForbidden.has(key))) {
              errors.push(`Forbidden duo API field: ${key}`);
            }
            visit(nested);
          }
        };
        visit(payload);
        const serialized = JSON.stringify(payload);
        for (const id of accountIds) if (serialized.includes(id)) errors.push("Duo API exposed an account UUID.");
        inspected += 1;
      } catch { errors.push("Could not inspect a successful duo API response."); }
    })());
  };
  const requestHandler = (request: { url: () => string; method: () => string }) => {
    if (request.method() !== "POST") return;
    const path = new URL(request.url()).pathname;
    if (path === "/api/training/series" || /^\/api\/(?:ratings?|history|multiplayer|social\/invitations)/.test(path)) {
      disallowedWrites.push(path);
    }
  };
  page.on("response", responseHandler);
  page.on("request", requestHandler);
  return {
    setAccountIds(ids: string[]) { for (const id of ids) accountIds.add(id); },
    withholdReveal() { revealed = false; },
    allowReveal() { revealed = true; },
    async assertSafeTraffic() {
      await Promise.all(pending);
      expect(inspected, "Duo API traffic must actually be inspected").toBeGreaterThan(0);
      expect(errors, "Duo HTTP projection privacy").toEqual([]);
      expect(disallowedWrites, "Duo must not write training records or game/social state").toEqual([]);
    },
    stop() { page.off("response", responseHandler); page.off("request", requestHandler); },
  };
}

export async function accountId(page: Page): Promise<string> {
  return page.evaluate(() => {
    for (const key of Object.keys(localStorage)) {
      if (!key.startsWith("sb-") || !key.endsWith("-auth-token")) continue;
      const parsed = JSON.parse(localStorage.getItem(key) ?? "null") as { user?: { id?: string } };
      if (parsed?.user?.id) return parsed.user.id;
    }
    throw new Error("Authenticated account id is missing.");
  });
}

export async function duoRequest(page: Page, sessionId: string, intent?: TrainingDuoIntent) {
  return page.evaluate(async ({ sessionId, intent }) => {
    let token: string | null = null;
    for (const key of Object.keys(localStorage)) {
      if (!key.startsWith("sb-") || !key.endsWith("-auth-token")) continue;
      const session = JSON.parse(localStorage.getItem(key) ?? "null") as { access_token?: string };
      if (session?.access_token) { token = session.access_token; break; }
    }
    if (!token) throw new Error("Authenticated duo session is missing.");
    const path = `/api/training/duo/sessions/${encodeURIComponent(sessionId)}`;
    const current = await fetch(path, { cache: "no-store", headers: { Authorization: `Bearer ${token}` } });
    const currentBody = await current.json() as { data?: TrainingDuoView; code?: string };
    if (!intent) return { status: current.status, body: currentBody };
    if (!currentBody.data) throw new Error(`Duo GET failed with HTTP ${current.status}.`);
    const response = await fetch(path, { method: "POST", cache: "no-store", headers: {
      Authorization: `Bearer ${token}`, "Content-Type": "application/json",
    }, body: JSON.stringify({ expectedVersion: currentBody.data.session.stateVersion, intent }) });
    return { status: response.status, body: response.status === 204 ? null : await response.json() as { data?: TrainingDuoView; code?: string } };
  }, { sessionId, intent });
}

export async function duoView(page: Page, sessionId: string): Promise<TrainingDuoView> {
  const result = await duoRequest(page, sessionId);
  expect(result.status).toBe(200);
  if (!result.body?.data) throw new Error("Duo projection is missing.");
  return result.body.data;
}

export async function attemptDuoJoin(page: Page, code: string): Promise<{
  status: number; retryAfter: string | null; body: Record<string, unknown>;
}> {
  return page.evaluate(async (attemptedCode) => {
    let token: string | null = null;
    for (const key of Object.keys(localStorage)) {
      if (!key.startsWith("sb-") || !key.endsWith("-auth-token")) continue;
      const session = JSON.parse(localStorage.getItem(key) ?? "null") as { access_token?: string };
      if (session?.access_token) { token = session.access_token; break; }
    }
    if (!token) throw new Error("Authenticated duo session is missing.");
    const response = await fetch("/api/training/duo/sessions/join", {
      method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ code: attemptedCode }),
    });
    return { status: response.status, retryAfter: response.headers.get("Retry-After"),
      body: await response.json() as Record<string, unknown> };
  }, code);
}

export async function createDuoThroughUi(page: Page, level: 1 | 2 | 3 | 4 = 4) {
  await page.goto("/training/duo");
  await expect(page.getByRole("heading", { name: "Lire les enchères à deux" })).toBeVisible();
  await page.getByRole("combobox", { name: "Niveau" }).selectOption(String(level));
  const response = page.waitForResponse((item) => item.request().method() === "POST" && new URL(item.url()).pathname === apiPrefix);
  await page.getByRole("button", { name: "Créer le duo" }).click();
  expect((await response).status()).toBe(201);
  await expect(page).toHaveURL(/\/training\/duo\/[0-9a-f-]+$/i);
  const sessionId = new URL(page.url()).pathname.split("/").at(-1)!;
  const code = (await page.locator("p.font-mono").innerText()).trim();
  expect(code).toMatch(/^[A-HJ-NP-Z2-9]{10}$/);
  return { sessionId, code };
}

export async function joinDuoThroughUi(page: Page, code: string, sessionId: string) {
  await page.goto("/training/duo");
  await page.getByRole("textbox", { name: "Code de session" }).fill(code);
  const response = page.waitForResponse((item) => item.request().method() === "POST" && new URL(item.url()).pathname === `${apiPrefix}/join`);
  await page.getByRole("button", { name: "Rejoindre" }).click();
  expect((await response).status()).toBe(200);
  await expect(page).toHaveURL(new RegExp(`/training/duo/${sessionId}$`));
}

export async function assertNoPrematureReveal(page: Page) {
  await expect(page.getByRole("region", { name: "Correction de la lecture" })).toHaveCount(0);
  await expect(page.getByRole("region", { name: "Exemple de main compatible" })).toHaveCount(0);
  for (const text of ["Selon la doctrine de l’application", "Bonne réponse", "Mauvaise réponse"]) {
    await expect(page.getByText(text, { exact: false })).toHaveCount(0);
  }
}
