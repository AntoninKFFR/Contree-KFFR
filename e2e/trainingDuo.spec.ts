import { expect, test, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { BID_READING_ASSERTION_LABELS, BID_READING_MEANING_LABELS } from "@/engine/training/bidReading";
import { twoPlayerCredentials, loginAs } from "./helpers/auth";
import { monitorBrowserErrors } from "./helpers/browserErrors";
import {
  accountId, assertNoPrematureReveal, createDuoThroughUi, duoRequest, duoView,
  joinDuoThroughUi, monitorDuoTraffic,
} from "./helpers/trainingDuo";

const auth = twoPlayerCredentials();
const duoBrowserErrors = (page: Page) => monitorBrowserErrors(page, { allowDuoHttp409: true });
if (process.env.E2E_REQUIRE_TRAINING_DUO_AUTH === "1" && auth.missing.length > 0) {
  throw new Error(`Authenticated training duo E2E cannot run without ${auth.missing.join(", ")}.`);
}
const viewports = [
  { width: 390, height: 844 }, { width: 667, height: 375 },
  { width: 844, height: 390 }, { width: 1366, height: 768 },
];

async function twoBrowsers(browser: Browser, baseURL: string | undefined) {
  const contexts: BrowserContext[] = [];
  const pages: Page[] = [];
  try {
    for (let index = 0; index < 2; index += 1) {
      const context = await browser.newContext({ baseURL, viewport: { width: 1366, height: 768 } });
      contexts.push(context);
      const page = await context.newPage();
      pages.push(page);
      await loginAs(page, auth.credentials[index]);
    }
    return { contexts, pages };
  } catch (error) {
    await Promise.all(contexts.map((context) => context.close()));
    throw error;
  }
}

async function expectResponsive(page: Page, stage: "lobby" | "answering" | "revealed" | "result") {
  for (const viewport of viewports) {
    await page.setViewportSize(viewport);
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    const heading = page.getByRole("heading", { level: 1 });
    await expect(heading).toHaveCount(1);
    await expect(heading).toBeVisible();
    const important = stage === "lobby" ? page.getByRole("button", { name: "Je suis prêt" })
      : stage === "answering" ? page.getByRole("button", { name: "Valider" })
        : stage === "revealed" ? page.getByRole("button", { name: "Prêt pour la question suivante" })
          : page.getByRole("link", { name: "Refaire un duo" });
    await important.scrollIntoViewIfNeeded();
    await expect(important).toBeVisible();
    expect((await important.boundingBox())?.height).toBeGreaterThanOrEqual(44);
    if (stage === "lobby") {
      const code = page.locator("p.font-mono");
      await expect(code).toBeVisible();
      expect(await code.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
      await expect(page.getByText(/Place A ·/)).toBeVisible();
    }
    if (stage === "answering") {
      const firstChoice = page.getByRole("checkbox").first();
      await expect(firstChoice).toBeVisible();
      await firstChoice.check();
      await expect(firstChoice).toBeChecked();
      await firstChoice.uncheck();
      await expect(firstChoice).not.toBeChecked();
      await expect(page.getByRole("region", { name: "Historique public des enchères" })).toBeVisible();
    }
    if (stage === "revealed") {
      await expect(page.getByRole("region", { name: "Correction de la lecture" })).toBeVisible();
      await expect(page.getByRole("region", { name: "Exemple de main compatible" })).toBeVisible();
    }
  }
}

async function submitEmpty(page: Page) {
  await page.getByRole("button", { name: "Valider" }).click();
}

test.describe("@training-duo two authenticated browser contexts", () => {
  test.skip(auth.missing.length > 0, `Missing authenticated E2E variables: ${auth.missing.join(", ")}`);
  test.describe.configure({ mode: "serial" });

  test("plays ten questions with private first answer, Realtime, CAS, offline reconnect and responsive views", async ({ browser, baseURL }) => {
    test.setTimeout(900_000);
    const { contexts, pages } = await twoBrowsers(browser, baseURL);
    const pageA = pages[0];
    let pageB = pages[1];
    const errorA = duoBrowserErrors(pageA);
    let errorB = duoBrowserErrors(pageB);
    const trafficA = monitorDuoTraffic(pageA);
    let trafficB = monitorDuoTraffic(pageB);
    try {
      const ids = await Promise.all([accountId(pageA), accountId(pageB)]);
      trafficA.setAccountIds(ids); trafficB.setAccountIds(ids);
      const progressBefore = await Promise.all([pageA, pageB].map((page) => page.evaluate(() => localStorage.getItem("coinche:training-progress:v1"))));
      const { sessionId, code } = await createDuoThroughUi(pageA, 4);
      const host = await duoView(pageA, sessionId);
      expect(host.session.level).toBe(4);
      expect(host.viewerSlot).toBe(0);
      await joinDuoThroughUi(pageB, code, sessionId);
      await expect.poll(async () => (await duoView(pageA, sessionId)).participants.length).toBe(2);
      const guest = await duoView(pageB, sessionId);
      expect(guest.viewerSlot).toBe(1);
      expect(guest.participants.map((participant) => participant.displayName)).toEqual((await duoView(pageA, sessionId)).participants.map((participant) => participant.displayName));
      await expect(pageA.getByText(/Place A · .* · Toi/)).toBeVisible();
      await expect(pageB.getByText(/Place B · .* · Toi/)).toBeVisible();
      await expect(pageA.getByText(/Hôte · Pas prêt · En ligne/)).toBeVisible();
      await expect(pageB.getByText(/Pas prêt · En ligne/).last()).toBeVisible();
      await expect(pageA.getByRole("button", { name: "Démarrer" })).toBeDisabled();
      await expect(pageB.getByRole("button", { name: "Démarrer" })).toHaveCount(0);
      await expectResponsive(pageA, "lobby");
      await pageA.getByRole("button", { name: "Je suis prêt" }).click();
      await pageB.getByRole("button", { name: "Je suis prêt" }).click();
      await expect(pageA.getByRole("button", { name: "Démarrer" })).toBeEnabled();
      await pageA.getByRole("button", { name: "Démarrer" }).click();
      for (const page of [pageA, pageB]) await expect(page.getByRole("heading", { name: "Exercice 1 / 10" })).toBeVisible();
      const firstA = await duoView(pageA, sessionId);
      const firstB = await duoView(pageB, sessionId);
      expect(firstA.exercise).toEqual(firstB.exercise);
      expect(await pageA.getByRole("region", { name: "Historique public des enchères" }).innerText())
        .toBe(await pageB.getByRole("region", { name: "Historique public des enchères" }).innerText());
      const choiceLabels = (page: Page) => page.getByRole("checkbox").evaluateAll((inputs) => inputs.map((input) => input.parentElement?.textContent));
      expect(await choiceLabels(pageA)).toEqual(await choiceLabels(pageB));
      await expectResponsive(pageA, "answering");
      await assertNoPrematureReveal(pageA); await assertNoPrematureReveal(pageB);
      await trafficA.assertSafeTraffic(); await trafficB.assertSafeTraffic();

      await submitEmpty(pageA);
      await expect(pageA.getByRole("status").filter({ hasText: "Réponse enregistrée" })).toBeVisible();
      await expect(pageA.getByText("En attente de ton partenaire…")).toBeVisible();
      await expect(pageA.getByRole("checkbox")).toHaveCount(0);
      await expect(pageB.getByRole("button", { name: "Valider" })).toBeEnabled();
      await assertNoPrematureReveal(pageA); await assertNoPrematureReveal(pageB);
      await trafficA.assertSafeTraffic(); await trafficB.assertSafeTraffic();
      await pageA.reload();
      await expect(pageA).toHaveURL(new RegExp(`/training/duo/${sessionId}$`));
      await expect(pageA.getByText("Réponse enregistrée")).toBeVisible();
      await expect(pageA.getByRole("heading", { name: "Exercice 1 / 10" })).toBeVisible();
      await expect(pageA.getByRole("checkbox")).toHaveCount(0);
      await assertNoPrematureReveal(pageA);
      await trafficA.assertSafeTraffic();

      trafficA.allowReveal(); trafficB.allowReveal();
      await submitEmpty(pageB);
      for (const page of [pageA, pageB]) await expect(page.getByRole("region", { name: "Correction de la lecture" })).toBeVisible();
      const revealed = await duoView(pageA, sessionId);
      expect(revealed.exercise?.kind).toBe("revealed");
      if (revealed.exercise?.kind !== "revealed") throw new Error("The second answer did not reveal the correction.");
      expect(revealed.exercise.answers).toHaveLength(2);
      for (const page of [pageA, pageB]) {
        await expect(page.getByRole("region", { name: "Correction de la lecture" }).getByText("Selon la doctrine de l’application")).toBeVisible();
        await expect(page.getByText("Une main compatible parmi d’autres")).toBeVisible();
        await expect(page.getByText("Cette enchère peut correspondre à :")).toBeVisible();
        for (const answer of revealed.exercise.answers) {
          const label = answer.slot === (page === pageA ? 0 : 1) ? "Toi" : revealed.participants[answer.slot].displayName;
          const answerCard = page.getByRole("heading", { name: label }).locator("..");
          await expect(answerCard).toBeVisible();
          await expect(answerCard.getByText(`${answer.correct ? "Bonne" : "Mauvaise"} réponse · ${answer.score} / 1`)).toBeVisible();
        }
        for (const id of revealed.exercise.promise.guaranteed) await expect(page.getByText(BID_READING_ASSERTION_LABELS[id])).toBeVisible();
        for (const meaning of revealed.exercise.promise.possibleMeanings) await expect(page.getByText(BID_READING_MEANING_LABELS[meaning])).toBeVisible();
        for (const line of revealed.exercise.promise.explanation) await expect(page.getByText(line)).toBeVisible();
      }
      await expectResponsive(pageA, "revealed");
      await pageA.getByRole("button", { name: "Prêt pour la question suivante" }).click();
      await expect(pageA.getByText("Ton partenaire regarde encore la correction.")).toBeVisible();
      await expect(pageA.getByRole("heading", { name: "Exercice 1 / 10" })).toBeVisible();
      await expect(pageB.getByRole("heading", { name: "Exercice 1 / 10" })).toBeVisible();
      await pageB.getByRole("button", { name: "Prêt pour la question suivante" }).click();
      for (const page of [pageA, pageB]) await expect(page.getByRole("heading", { name: "Exercice 2 / 10" })).toBeVisible();
      await expect(pageA.getByRole("heading", { name: "Exercice 2 / 10" })).toBeFocused();
      expect((await duoView(pageA, sessionId)).session.currentIndex).toBe(1);

      for (let question = 2; question <= 10; question += 1) {
        for (const page of [pageA, pageB]) await expect(page.getByRole("heading", { name: `Exercice ${question} / 10` })).toBeVisible();
        trafficA.withholdReveal(); trafficB.withholdReveal();
        if (question !== 4) await submitEmpty(pageA);
        await expect(pageA.getByText("Réponse enregistrée")).toBeVisible();
        await assertNoPrematureReveal(pageA);
        await trafficA.assertSafeTraffic(); await trafficB.assertSafeTraffic();
        trafficA.allowReveal(); trafficB.allowReveal();
        await submitEmpty(pageB);
        for (const page of [pageA, pageB]) await expect(page.getByRole("region", { name: "Correction de la lecture" })).toBeVisible();
        const button = question === 10 ? "Prêt pour le résultat" : "Prêt pour la question suivante";
        if (question === 2) {
          await Promise.all([pageA.getByRole("button", { name: button }).click(), pageB.getByRole("button", { name: button }).click()]);
          for (const page of [pageA, pageB]) await expect(page.getByRole("heading", { name: "Exercice 3 / 10" })).toBeVisible();
          expect((await duoView(pageA, sessionId)).session.currentIndex).toBe(2);
        } else {
          await pageA.getByRole("button", { name: button }).click();
          if (question < 10) await expect(pageA.getByRole("heading", { name: `Exercice ${question} / 10` })).toBeVisible();
          await pageB.getByRole("button", { name: button }).click();
          if (question < 10) for (const page of [pageA, pageB]) await expect(page.getByRole("heading", { name: `Exercice ${question + 1} / 10` })).toBeVisible();
        }
        if (question === 3) {
          trafficA.withholdReveal(); trafficB.withholdReveal();
          await submitEmpty(pageA);
          await expect(pageA.getByText("En attente de ton partenaire…")).toBeVisible();
          const prior = await duoView(pageB, sessionId);
          const storage = await contexts[1].storageState();
          errorB.assertClean(); trafficB.stop();
          await contexts[1].close();
          await expect.poll(async () => (await duoView(pageA, sessionId)).participants[1].isConnected, { timeout: 90_000 }).toBe(false);
          await expect(pageA.getByText("Ton partenaire est hors ligne. La session reprendra à son retour.")).toBeVisible();
          await expect(pageA.getByRole("heading", { name: "Exercice 4 / 10" })).toBeVisible();
          expect((await duoView(pageA, sessionId)).session.status).toBe("active");
          const restoredContext = await browser.newContext({ baseURL, storageState: storage, viewport: { width: 1366, height: 768 } });
          contexts[1] = restoredContext;
          pageB = await restoredContext.newPage();
          errorB = duoBrowserErrors(pageB);
          trafficB = monitorDuoTraffic(pageB); trafficB.setAccountIds(ids); trafficB.allowReveal();
          await pageB.goto(`/training/duo/${sessionId}`);
          await expect(pageB.getByRole("heading", { name: "Exercice 4 / 10" })).toBeVisible();
          const after = await duoView(pageB, sessionId);
          expect(after.viewerSlot).toBe(prior.viewerSlot);
          expect(after.session.status).toBe("active");
          expect(after.participants).toHaveLength(2);
          await expect.poll(async () => (await duoView(pageA, sessionId)).participants[1].isConnected).toBe(true);
        }
      }
      for (const page of [pageA, pageB]) await expect(page.getByRole("heading", { name: "Résultat" })).toBeVisible();
      const resultA = await duoView(pageA, sessionId);
      const resultB = await duoView(pageB, sessionId);
      expect(resultA.session.status).toBe("completed");
      expect(resultB.result).toEqual(resultA.result);
      const result = resultA.result!;
      for (const value of [result.scoreA, result.scoreB, result.commonSuccesses]) expect(value).toBeGreaterThanOrEqual(0);
      for (const value of [result.scoreA, result.scoreB, result.commonSuccesses]) expect(value).toBeLessThanOrEqual(10);
      await expect(pageA.getByText("Ton score").locator("..")).toContainText(`${result.scoreA} / 10`);
      await expect(pageA.getByText("Score de", { exact: false }).locator("..")).toContainText(`${result.scoreB} / 10`);
      await expect(pageB.getByText("Ton score").locator("..")).toContainText(`${result.scoreB} / 10`);
      await expect(pageB.getByText("Score de", { exact: false }).locator("..")).toContainText(`${result.scoreA} / 10`);
      for (const page of [pageA, pageB]) {
        await expect(page.getByText("Réussites communes").locator("..")).toContainText(`${result.commonSuccesses} / 10`);
        await expect(page.getByText("Cette session duo ne modifie pas ta progression ni tes records.")).toBeVisible();
      }
      await expectResponsive(pageA, "result");
      const progressAfter = await Promise.all([pageA, pageB].map((page) => page.evaluate(() => localStorage.getItem("coinche:training-progress:v1"))));
      expect(progressAfter).toEqual(progressBefore);
      await trafficA.assertSafeTraffic(); await trafficB.assertSafeTraffic();
      errorA.assertClean(); errorB.assertClean();
    } finally {
      trafficA.stop(); trafficB.stop();
      await Promise.all(contexts.map((context) => context.close()));
    }
  });

  test("recovers a terminal session after partner context closes and an active leave", async ({ browser, baseURL }) => {
    test.setTimeout(180_000);
    const { contexts, pages } = await twoBrowsers(browser, baseURL);
    const [pageA, pageB] = pages;
    const errors = pages.map(duoBrowserErrors);
    try {
      const { sessionId, code } = await createDuoThroughUi(pageA);
      await joinDuoThroughUi(pageB, code, sessionId);
      await pageA.getByRole("button", { name: "Je suis prêt" }).click();
      await pageB.getByRole("button", { name: "Je suis prêt" }).click();
      await expect(pageA.getByRole("button", { name: "Démarrer" })).toBeEnabled();
      await pageA.getByRole("button", { name: "Démarrer" }).click();
      await expect(pageB.getByRole("heading", { name: "Exercice 1 / 10" })).toBeVisible();
      const storage = await contexts[1].storageState();
      errors[1].assertClean();
      await contexts[1].close();
      const leaveResponse = pageA.waitForResponse((response) => response.request().method() === "POST"
        && new URL(response.url()).pathname === `/api/training/duo/sessions/${sessionId}`);
      await pageA.getByRole("button", { name: "Quitter la session et l’interrompre" }).click();
      expect((await leaveResponse).status()).toBe(200);
      await expect(pageA.getByRole("heading", { name: "Session interrompue" })).toBeVisible();
      const restored = await browser.newContext({ baseURL, storageState: storage, viewport: { width: 1366, height: 768 } });
      contexts[1] = restored;
      const restoredPage = await restored.newPage();
      const restoredErrors = duoBrowserErrors(restoredPage);
      await restoredPage.goto(`/training/duo/${sessionId}`);
      await expect(restoredPage.getByRole("heading", { name: "Session interrompue" })).toBeVisible();
      expect((await duoView(restoredPage, sessionId)).viewerSlot).toBe(1);
      await assertNoPrematureReveal(restoredPage);
      errors[0].assertClean(); restoredErrors.assertClean();
    } finally { await Promise.all(contexts.map((context) => context.close())); }
  });

  test("cancels an active question when the guest leaves explicitly", async ({ browser, baseURL }) => {
    test.setTimeout(180_000);
    const { contexts, pages } = await twoBrowsers(browser, baseURL);
    const [pageA, pageB] = pages;
    const errors = pages.map(duoBrowserErrors);
    try {
      const { sessionId, code } = await createDuoThroughUi(pageA);
      await joinDuoThroughUi(pageB, code, sessionId);
      await pageA.getByRole("button", { name: "Je suis prêt" }).click();
      await pageB.getByRole("button", { name: "Je suis prêt" }).click();
      await expect(pageA.getByRole("button", { name: "Démarrer" })).toBeEnabled();
      await pageA.getByRole("button", { name: "Démarrer" }).click();
      for (const page of pages) await expect(page.getByRole("heading", { name: "Exercice 1 / 10" })).toBeVisible();
      const leaveResponse = pageB.waitForResponse((response) => response.request().method() === "POST"
        && new URL(response.url()).pathname === `/api/training/duo/sessions/${sessionId}`);
      await pageB.getByRole("button", { name: "Quitter la session et l’interrompre" }).click();
      expect((await leaveResponse).status()).toBe(200);
      for (const page of pages) {
        await expect(page.getByRole("heading", { name: "Session interrompue" })).toBeVisible();
        await assertNoPrematureReveal(page);
      }
      errors.forEach((monitor) => monitor.assertClean());
    } finally { await Promise.all(contexts.map((context) => context.close())); }
  });

  test("handles guest lobby leave 204, rejoin and host cancellation", async ({ browser, baseURL }) => {
    test.setTimeout(180_000);
    const { contexts, pages } = await twoBrowsers(browser, baseURL);
    const [pageA, pageB] = pages;
    const errors = pages.map(duoBrowserErrors);
    try {
      const { sessionId, code } = await createDuoThroughUi(pageA);
      await joinDuoThroughUi(pageB, code, sessionId);
      const leaveResponse = pageB.waitForResponse((response) => response.request().method() === "POST"
        && new URL(response.url()).pathname === `/api/training/duo/sessions/${sessionId}`);
      await pageB.getByRole("button", { name: "Quitter", exact: true }).click();
      expect((await leaveResponse).status()).toBe(204);
      await expect(pageB).toHaveURL(/\/training\/duo$/);
      await expect.poll(async () => (await duoView(pageA, sessionId)).participants.length).toBe(1);
      await expect(pageA.getByText("En attente d’un joueur", { exact: false })).toBeVisible();
      expect((await duoView(pageA, sessionId)).session.status).toBe("lobby");
      await joinDuoThroughUi(pageB, code, sessionId);
      await expect.poll(async () => (await duoView(pageA, sessionId)).participants.length).toBe(2);
      await pageA.getByRole("button", { name: "Annuler le duo" }).click();
      for (const page of [pageA, pageB]) await expect(page.getByRole("heading", { name: "Session interrompue" })).toBeVisible();
      errors.forEach((monitor) => monitor.assertClean());
    } finally { await Promise.all(contexts.map((context) => context.close())); }
  });

  test("blocks start while a ready partner is offline, then allows it after reconnect", async ({ browser, baseURL }) => {
    test.setTimeout(240_000);
    const { contexts, pages } = await twoBrowsers(browser, baseURL);
    const [pageA, pageB] = pages;
    const errors = pages.map(duoBrowserErrors);
    try {
      const { sessionId, code } = await createDuoThroughUi(pageA);
      await joinDuoThroughUi(pageB, code, sessionId);
      await pageA.getByRole("button", { name: "Je suis prêt" }).click();
      await pageB.getByRole("button", { name: "Je suis prêt" }).click();
      await expect(pageA.getByRole("button", { name: "Démarrer" })).toBeEnabled();
      const storage = await contexts[1].storageState();
      errors[1].assertClean();
      await contexts[1].close();
      await expect.poll(async () => (await duoView(pageA, sessionId)).participants[1].isConnected, { timeout: 90_000 }).toBe(false);
      await expect(pageA.getByRole("button", { name: "Démarrer" })).toBeDisabled();
      const rejected = await duoRequest(pageA, sessionId, { type: "start" });
      expect(rejected.status).toBe(409);
      expect(rejected.body?.code).toBe("duo_partner_offline");
      expect((await duoView(pageA, sessionId)).session.status).toBe("lobby");
      const restored = await browser.newContext({ baseURL, storageState: storage, viewport: { width: 1366, height: 768 } });
      contexts[1] = restored;
      const restoredPage = await restored.newPage();
      const restoredErrors = duoBrowserErrors(restoredPage);
      await restoredPage.goto(`/training/duo/${sessionId}`);
      await expect(restoredPage.getByRole("heading", { name: "Salon duo" })).toBeVisible();
      await expect.poll(async () => (await duoView(pageA, sessionId)).participants[1].isConnected).toBe(true);
      await expect(pageA.getByRole("button", { name: "Démarrer" })).toBeEnabled();
      await pageA.getByRole("button", { name: "Annuler le duo" }).click();
      errors[0].assertClean(); restoredErrors.assertClean();
    } finally { await Promise.all(contexts.map((context) => context.close())); }
  });
});
