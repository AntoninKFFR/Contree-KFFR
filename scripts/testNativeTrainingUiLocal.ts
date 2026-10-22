import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { chromium, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import type { TrainingDuoView } from "@/lib/trainingDuoTypes";
const configPath = process.env.NATIVE_TRAINING_LOCAL_CONFIG;
if (!configPath) throw Error("A disposable loopback configuration is required.");
const config = JSON.parse(readFileSync(configPath, "utf8")) as { API_URL: string; ANON_KEY: string; SERVICE_ROLE_KEY: string };
const backend = process.env.NATIVE_TRAINING_LOCAL_BACKEND ?? "http://127.0.0.1:3007", visual = "http://127.0.0.1:8091";
for (const url of [backend, visual, config.API_URL]) assert.ok(["localhost", "127.0.0.1"].includes(new URL(url).hostname), "Never test authenticated training against production");
const admin = createClient(config.API_URL, config.SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const users: string[] = [], sessions: string[] = [];
const browser = await chromium.launch(); const directory = "apps/mobile/docs/training-153/captures"; mkdirSync(directory, { recursive: true });
const suffix = randomUUID().slice(0, 8), evidence: unknown[] = [];
if (process.env.NATIVE_TRAINING_UI_GAME_ONLY === "1") evidence.push(...JSON.parse(readFileSync("apps/mobile/docs/training-153/ui-local-integration.json", "utf8")).scenarios.filter((s: { direction?: string }) => s.direction));
async function identity(label: string) {
  const email = `native-ui-${label}-${suffix}@example.test`, password = `Local-${randomUUID()}-Test`;
  const created = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { username: `Ui${label}${suffix}` } });
  assert.ifError(created.error); assert.ok(created.data.user); users.push(created.data.user.id);
  const client = createClient(config.API_URL, config.ANON_KEY, { auth: { persistSession: false } });
  const result = await client.auth.signInWithPassword({ email, password }); assert.ifError(result.error); assert.ok(result.data.session);
  return result.data.session;
}
try {
  const a = await identity("A"), b = await identity("B");
  for (const direction of (process.env.NATIVE_TRAINING_UI_GAME_ONLY === "1" ? [] : ["native-web", "web-native"] as const)) {
    const nativeContext = await browser.newContext({ viewport: { width: 844, height: 390 }, reducedMotion: "reduce" });
    const webContext = await browser.newContext({ viewport: { width: 1280, height: 800 }, reducedMotion: "reduce" });
    const nativeIdentity = direction === "native-web" ? a : b, webIdentity = direction === "native-web" ? b : a;
    await nativeContext.addInitScript(({ url, key, session }) => { Object.assign(globalThis, { __nativeLocalBackend: { url, key, session } }); }, { url: config.API_URL, key: config.ANON_KEY, session: nativeIdentity });
    await webContext.addInitScript(({ key, session }) => localStorage.setItem(key, JSON.stringify(session)), { key: `sb-${new URL(config.API_URL).hostname.split(".")[0]}-auth-token`, session: webIdentity });
    await nativeContext.route("https://contree-kffr.vercel.app/api/**", async (route) => {
      const url = new URL(route.request().url());
      const response = await route.fetch({ url: backend + url.pathname + url.search });
      await route.fulfill({ response });
    });
    const native = await nativeContext.newPage(), web = await webContext.newPage();
    const errors: string[] = [], intents: unknown[] = [];
    for (const [side, page] of [["native", native], ["web", web]] as const) page.on("response", async (r) => { if (r.request().method() === "POST" && /\/api\/training\/duo\/sessions\/[^/]+$/.test(new URL(r.url()).pathname)) { const request = r.request().postDataJSON(), result = await r.json().catch(() => ({})); intents.push({ side, intent: request.intent?.type, ready: request.intent?.ready, version: request.expectedVersion, status: r.status(), code: result.code, stateVersion: result.data?.session.stateVersion, readiness: result.data?.participants.map((p: { slot: number; isReady: boolean }) => [p.slot,p.isReady]) }); } }); native.on("pageerror", (e) => errors.push(e.message)); web.on("pageerror", (e) => errors.push(e.message));
    try {
      await native.goto(visual + "/?screen=training&axis=duo&multi=live"); await web.goto(backend + "/training/duo");
      let view: TrainingDuoView;
      if (direction === "native-web") {
        const created = native.waitForResponse((r) => r.url().endsWith("/api/training/duo/sessions") && r.request().method() === "POST");
        await native.getByRole("button", { name: "Créer une session Duo", exact: true }).click(); view = (await (await created).json()).data;
        await web.getByRole("textbox", { name: "Code de session", exact: true }).fill(view.session.code!); await web.getByRole("button", { name: "Rejoindre", exact: true }).click();
      } else {
        await web.getByLabel("Niveau", { exact: true }).selectOption("3");
        const created = web.waitForResponse((r) => r.url().endsWith("/api/training/duo/sessions") && r.request().method() === "POST");
        await web.getByRole("button", { name: "Créer le duo", exact: true }).click(); view = (await (await created).json()).data;
        await native.getByRole("textbox", { name: "Code de session Duo", exact: true }).fill(view.session.code!); await native.getByRole("button", { name: "Rejoindre par code", exact: true }).click();
      }
      assert.ok(view.session.id); sessions.push(view.session.id);
      await expect(web.getByRole("heading", { name: "Salon duo", exact: true })).toBeVisible();
      await expect(web.locator("[aria-label=Participants]")).toContainText(nativeIdentity.user.user_metadata.username);
      await Promise.all([native.getByRole("button", { name: "Je suis prêt", exact: true }).click(), web.getByRole("button", { name: "Je suis prêt", exact: true }).click()]);
      if (direction === "native-web") await native.getByRole("button", { name: "Commencer à deux", exact: true }).click();
      else await web.getByRole("button", { name: "Démarrer", exact: true }).click();
      for (let i = 0; i < 10; i++) {
        await expect(native.getByText(`Question ${i + 1} / 10`, { exact: true })).toBeVisible();
        await expect(web.getByRole("heading", { name: `Exercice ${i + 1} / 10`, exact: true })).toBeVisible();
        if (i === 0) { await native.screenshot({ path: `${directory}/duo-${direction}-native-question.png` }); await web.screenshot({ path: `${directory}/duo-${direction}-web-question.png` }); }
        await native.getByRole("button", { name: "Valider : aucune affirmation", exact: true }).click();
        await expect(native.getByText("Ta réponse est enregistrée. En attente de l’autre joueur.", { exact: true })).toBeVisible();
        await expect(web.getByRole("checkbox").first()).toBeEnabled();
        await expect(web.getByRole("heading", { name: "Correction", exact: true })).toHaveCount(0);
        await web.getByRole("checkbox").first().check(); await web.getByRole("button", { name: "Valider", exact: true }).click();
        await expect(native.getByText("Ce que promet la doctrine", { exact: true })).toBeVisible();
        await expect(web.getByRole("heading", { name: "Correction", exact: true })).toBeVisible();
        if (i === 0) { await native.screenshot({ path: `${directory}/duo-${direction}-native-correction.png` }); await web.screenshot({ path: `${directory}/duo-${direction}-web-correction.png` }); }
        if (i === 4) { await native.reload(); await expect(native.getByText("Ce que promet la doctrine", { exact: true })).toBeVisible(); }
        await Promise.all([native.getByRole("button", { name: "Prêt pour la suite", exact: true }).click(), web.getByRole("button", { name: i === 9 ? "Prêt pour le résultat" : "Prêt pour la question suivante", exact: true }).click()]);
      }
      await expect(native.getByText("Série terminée", { exact: true })).toBeVisible(); await expect(web.getByRole("heading", { name: "Résultat", exact: true })).toBeVisible();
      await native.screenshot({ path: `${directory}/duo-${direction}-native-result.png` }); await web.screenshot({ path: `${directory}/duo-${direction}-web-result.png` });
      assert.deepEqual(errors, []);
      evidence.push({ direction, questions: 10, level: view.session.level, nativeViewport: { width: 844, height: 390 }, webViewport: { width: 1280, height: 800 }, nativeRenderer: "actual React Native Web components; not physical iPhone", backend: "real local Next.js, Supabase Auth/Postgres/Realtime", independentControls: true, privateUntilBothAnswer: true, reloadResumedCorrection: true });
      console.log("Actual UI crossplay passed", direction);
    } catch (error) { mkdirSync("test-results", { recursive: true }); await native.screenshot({ path: "test-results/native-training-ui-failure.png" }); await web.screenshot({ path: "test-results/web-training-ui-failure.png" }); console.log("Intent diagnostics", JSON.stringify(intents)); console.log("Native status", (await native.locator("body").innerText()).slice(0, 1200)); console.log("Web participants", await web.locator("[aria-label=Participants]").innerText().catch(() => "unavailable")); throw error; } finally { await native.goto("about:blank"); await nativeContext.unrouteAll({ behavior: "wait" }); await nativeContext.close(); await webContext.close(); }
  }
  // Real Solo game through the native table and authoritative API.
  const gameContext = await browser.newContext({ viewport: { width: 844, height: 390 }, reducedMotion: "reduce" });
  try {
    await gameContext.addInitScript(({ url, key, session }) => { Object.assign(globalThis, { __nativeLocalBackend: { url, key, session } }); }, { url: config.API_URL, key: config.ANON_KEY, session: a });
    await gameContext.route("https://contree-kffr.vercel.app/api/**", async (route) => { const url = new URL(route.request().url()); await route.fulfill({ response: await route.fetch({ url: backend + url.pathname + url.search }) }); });
    const game = await gameContext.newPage(); let moves = 0;
    game.on("request", (r) => { if (r.method() === "POST" && r.url().includes("/api/solo/sessions/")) moves++; });
    await game.goto(visual + "/?screen=training&axis=game&multi=live");
    await game.getByRole("button", { name: "Ouvrir la table d’entraînement", exact: true }).click();
    await game.getByRole("button", { name: "Nouvelle partie", exact: true }).click();
    const deadline = Date.now() + 90000;
    const paused = game.getByText("La partie est en pause pour cette question.", { exact: true });
    while (!await paused.isVisible() && Date.now() < deadline) {
      const control = game.getByRole("button", { name: /^Jouer |^Annoncer$|^Passer$/ }).and(game.locator(":visible:not([aria-disabled=true]):not([disabled])")).first();
      if (await control.count()) await control.click({ timeout: 500 }).catch(() => {});
      await game.waitForTimeout(100);
    }
    await game.screenshot({ path: "test-results/native-training-game-before-question.png" });
    await expect(paused).toBeVisible();
    const atPause = moves; await game.waitForTimeout(1000); assert.equal(moves, atPause, "No bot or forced-card mutation during pedagogical pause");
    await game.screenshot({ path: directory + "/native-game-paused-844.png" });
    await game.getByRole("button", { name: "0", exact: true }).click(); await game.getByRole("button", { name: "Valider", exact: true }).click();
    await expect(game.getByText(/Bonne réponse !|Réponse à revoir/)).toBeVisible();
    await game.screenshot({ path: directory + "/native-game-correction-844.png" });
    await game.getByRole("button", { name: "Reprendre la partie", exact: true }).click(); await expect(paused).toHaveCount(0);
    const resumeDeadline = Date.now() + 15000;
    while (moves === atPause && Date.now() < resumeDeadline) { const control = game.getByRole("button", { name: /^Jouer / }).and(game.locator(":visible:not([aria-disabled=true]):not([disabled])")).first(); if (await control.count()) await control.click({ timeout: 500 }).catch(() => {}); await game.waitForTimeout(100); }
    assert.ok(moves > atPause, "The authoritative game resumes after correction");
    evidence.push({ scenario: "in-game", backend: "real Solo API and bots", nativeTable: "SoloRoom", movesBeforeQuestion: atPause, pausedMutations: 0, correctionAndResume: true });
    console.log("Actual native training game pause/correction/resume passed");
  } finally { for (const page of gameContext.pages()) await page.goto("about:blank"); await gameContext.unrouteAll({ behavior: "wait" }); await gameContext.close(); }
  writeFileSync("apps/mobile/docs/training-153/ui-local-integration.json", JSON.stringify({ completedAt: new Date().toISOString(), scenarios: evidence }, null, 2));
} finally {
  await browser.close(); if (sessions.length) await admin.from("training_duo_sessions").delete().in("id", sessions);
  for (const id of users) { const result = await admin.auth.admin.deleteUser(id); assert.ifError(result.error); }
}
