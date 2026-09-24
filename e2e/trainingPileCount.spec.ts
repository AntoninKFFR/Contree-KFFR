import { expect, test } from "@playwright/test";
import { monitorBrowserErrors } from "./helpers/browserErrors";
import { SUIT_LABELS } from "@/engine/cards";
import { generatePileCountSeries, pileGeneratorVersion, type PileCountMode } from "@/engine/training/pileCount";
import { emptyTrainingProgress, pileCountSeriesSeed, recordPileCountSeries } from "@/components/training/progress";

const PROGRESS_KEY = "coinche:training-progress:v1";
const SPEED_KEY = "coinche:training-pile-speed:v1";
const seriesFor = (mode: PileCountMode, progress = emptyTrainingProgress()) =>
  generatePileCountSeries({ seed: pileCountSeriesSeed(progress, mode), generatorVersion: pileGeneratorVersion });

test("@smoke training hub lists the pile-count modes with normal locked", async ({ page }) => {
  const browserErrors = monitorBrowserErrors(page);
  await page.goto("/training");
  await expect(page.getByRole("heading", { name: "Compter son tas" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Compter son tas en mode Débutant" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Compter son tas en mode Libre" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Compter son tas en mode Manuel" })).toBeVisible();
  await expect(page.getByText("Record à établir (10/10)")).toBeVisible();
  await expect(page.getByRole("link", { name: "Compter son tas en mode Normal" })).toHaveCount(0);
  await expect(page.getByText("Réussis 8/10 en Débutant pour débloquer ce mode.")).toBeVisible();
  // The existing trick-value entry points stay unique.
  await expect(page.getByRole("link", { name: "Jouer le niveau 1" })).toHaveCount(1);
  browserErrors.assertClean();
});

test("@smoke pile-count beginner shows trump, ten de der and belote before a pausable scroll", async ({ page }) => {
  const browserErrors = monitorBrowserErrors(page);
  await page.setViewportSize({ width: 390, height: 844 });
  const [first] = seriesFor("beginner");
  await page.goto("/training/puzzle/pile-count?mode=beginner");
  await expect(page.getByText(`Voici le tas de plis de ton équipe : ${first.trickCount} pli${first.trickCount > 1 ? "s" : ""}, soit ${first.cards.length} cartes.`)).toBeVisible();
  await expect(page.getByText(SUIT_LABELS[first.trump], { exact: true })).toBeVisible();
  await expect(page.getByText(first.hasTenDeDer ? "✓ ton équipe l’a (+10)" : "✗ pour l’autre équipe")).toBeVisible();
  await expect(page.getByText(first.hasBelote ? "✓ ton équipe l’a (+20)" : "✗ pas pour ton équipe")).toBeVisible();
  await page.getByRole("button", { name: "Lancer le défilement" }).click();
  await expect(page.getByRole("list", { name: "Rappel de la donne" })).toBeVisible();
  await expect(page.getByLabel("Aide des valeurs des cartes")).toBeVisible();
  await page.getByRole("button", { name: "Pause" }).click();
  const frozen = await page.getByText(/^Carte \d+ \/ \d+$/).textContent();
  await page.waitForTimeout(2000);
  await expect(page.getByText(/^Carte \d+ \/ \d+$/)).toHaveText(frozen ?? "");
  await expect(page.getByRole("button", { name: "Reprendre" })).toHaveAttribute("aria-pressed", "true");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  browserErrors.assertClean();
});

test("@smoke pile-count free mode plays a full series at the chosen speed without a record", async ({ page }) => {
  test.setTimeout(180_000);
  const browserErrors = monitorBrowserErrors(page);
  await page.setViewportSize({ width: 390, height: 844 });
  const series = seriesFor("free");
  await page.goto("/training");
  await page.evaluate(([key, value]) => localStorage.setItem(key, value), [SPEED_KEY, "300"]);
  await page.getByRole("link", { name: "Compter son tas en mode Libre" }).click();
  await expect(page.getByText("Vitesse : 0,3 s par carte")).toBeVisible();
  for (const [index, exercise] of series.entries()) {
    await expect(page.getByLabel(`Tas ${index + 1} sur 10`)).toBeVisible();
    await page.getByRole("button", { name: "Lancer le défilement" }).click();
    const answer = page.getByRole("textbox", { name: "Ton total en points" });
    await expect(answer).toBeVisible({ timeout: 20_000 });
    // Outside beginner mode, the pile can only be looked at once the answer is given.
    if (index === 0) await expect(page.getByRole("button", { name: "Revoir le tas" })).toHaveCount(0);
    await answer.fill(String(index === 0 ? exercise.answer + 1 : exercise.answer));
    await answer.press("Enter");
    await expect(page.getByText(index === 0 ? "Mauvaise réponse" : "Bonne réponse !")).toBeVisible();
    if (index === 0) {
      await page.getByRole("button", { name: "Voir le détail du tas" }).click();
      await expect(page.getByRole("list", { name: "Détail du tas" }).locator("li"))
        .toHaveCount(exercise.cards.length + Number(exercise.hasTenDeDer) + Number(exercise.hasBelote));
    }
    await expect(page.getByText(`162 − ${exercise.teamTrickPoints} = ${exercise.otherTeamTrickPoints}`)).toBeVisible();
    await page.getByRole("button", { name: index === series.length - 1 ? "Voir le résultat" : "Tas suivant" }).click();
  }
  await expect(page.getByRole("heading", { name: "Résultat" })).toBeVisible();
  await expect(page.getByText("9 / 10", { exact: true })).toBeVisible();
  await expect(page.getByText("Mode libre : ce score n’est pas enregistré comme record.")).toBeVisible();
  const stored = await page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? "null"), PROGRESS_KEY);
  expect(stored.axes["pile-count"].modes.free).toEqual({ completedSeries: 1 });
  expect(stored.axes["pile-count"].modes.beginner).toEqual({ bestScore: 0, completedSeries: 0 });
  browserErrors.assertClean();
});

test("@smoke pile-count beginner can review the whole pile when answering", async ({ page }) => {
  test.setTimeout(90_000);
  const browserErrors = monitorBrowserErrors(page);
  const [first] = seriesFor("beginner");
  await page.goto("/training/puzzle/pile-count?mode=beginner");
  await page.getByRole("button", { name: "Lancer le défilement" }).click();
  await expect(page.getByRole("textbox", { name: "Ton total en points" })).toBeVisible({ timeout: first.cards.length * 1500 + 10_000 });
  await expect(page.getByRole("list", { name: "Toutes les cartes du tas" })).toHaveCount(0);
  await page.getByRole("button", { name: "Revoir le tas" }).click();
  const beforeAnswer = page.getByRole("list", { name: "Toutes les cartes du tas" });
  await expect(beforeAnswer.locator("li")).toHaveCount(first.cards.length);
  // No card value before answering: it would give the answer away.
  await expect(beforeAnswer.getByText(/^\+\d+$/)).toHaveCount(0);
  await page.getByRole("button", { name: "Masquer le tas" }).click();
  await expect(beforeAnswer).toHaveCount(0);

  await page.getByRole("textbox", { name: "Ton total en points" }).fill(String(first.answer));
  await page.getByRole("textbox", { name: "Ton total en points" }).press("Enter");
  await page.getByRole("button", { name: "Voir le détail du tas" }).click();
  const detail = page.getByRole("list", { name: "Détail du tas" });
  await expect(detail.locator("li")).toHaveCount(first.cards.length + Number(first.hasTenDeDer) + Number(first.hasBelote));
  await expect(detail.getByText(/^\+\d+$/)).toHaveCount(first.cards.length + Number(first.hasTenDeDer) + Number(first.hasBelote));
  await expect(page.locator("#pile-review").getByText(`Total : ${first.answer} points`)).toBeVisible();
  // The values can be hidden to recount the pile, then shown again.
  await page.getByRole("button", { name: "Masquer les points" }).click();
  await expect(detail.locator("li")).toHaveCount(first.cards.length);
  await expect(detail.getByText(/^\+\d+$/)).toHaveCount(0);
  await expect(page.locator("#pile-review").getByText(/^Total : /)).toHaveCount(0);
  await page.getByRole("button", { name: "Afficher les points" }).click();
  await expect(detail.getByText(/^\+\d+$/)).toHaveCount(first.cards.length + Number(first.hasTenDeDer) + Number(first.hasBelote));
  await page.getByRole("button", { name: "Masquer le détail du tas" }).click();
  await expect(detail).toHaveCount(0);
  browserErrors.assertClean();
});

test("@smoke pile-count manual mode: arrows and keyboard, timed piles and a 10/10 record", async ({ page }) => {
  test.setTimeout(120_000);
  const browserErrors = monitorBrowserErrors(page);
  await page.setViewportSize({ width: 390, height: 844 });
  const series = seriesFor("manual");
  await page.goto("/training");
  await page.getByRole("link", { name: "Compter son tas en mode Manuel" }).click();
  for (const [index, exercise] of series.entries()) {
    await expect(page.getByLabel(`Tas ${index + 1} sur 10`)).toBeVisible();
    await page.getByRole("button", { name: "Commencer à compter" }).click();
    await expect(page.getByRole("timer")).toBeVisible();
    await expect(page.getByText(`Carte 1 / ${exercise.cards.length}`)).toBeVisible();
    if (index === 0) {
      // On-screen arrows, including going back one card.
      await expect(page.getByRole("button", { name: "Carte précédente" })).toBeDisabled();
      await page.getByRole("button", { name: "Carte suivante" }).click();
      await page.getByRole("button", { name: "Carte précédente" }).click();
      await expect(page.getByText(`Carte 1 / ${exercise.cards.length}`)).toBeVisible();
      for (let card = 1; card < exercise.cards.length; card += 1) await page.getByRole("button", { name: "Carte suivante" }).click();
      await page.getByRole("button", { name: "Répondre" }).click();
    } else {
      // Keyboard arrows.
      await page.keyboard.press("ArrowRight");
      await page.keyboard.press("ArrowLeft");
      await expect(page.getByText(`Carte 1 / ${exercise.cards.length}`)).toBeVisible();
      for (let card = 0; card < exercise.cards.length; card += 1) await page.keyboard.press("ArrowRight");
    }
    const answer = page.getByRole("textbox", { name: "Ton total en points" });
    await expect(answer).toBeVisible();
    await answer.fill(String(exercise.answer));
    await answer.press("Enter");
    await expect(page.getByText("Bonne réponse !")).toBeVisible();
    await expect(page.getByText(/^Temps pour ce tas : /)).toBeVisible();
    if (index === 0) {
      await page.getByRole("button", { name: "Voir le détail du tas" }).click();
      await expect(page.getByRole("list", { name: "Détail du tas" })).toBeVisible();
    }
    await page.getByRole("button", { name: index === series.length - 1 ? "Voir le résultat" : "Tas suivant" }).click();
  }
  await expect(page.getByText("10 / 10", { exact: true })).toBeVisible();
  await expect(page.getByText(/^Temps total : /)).toBeVisible();
  await expect(page.getByText("Nouveau record !")).toBeVisible();
  const stored = await page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? "null"), PROGRESS_KEY);
  expect(stored.axes["pile-count"].modes.manual.completedSeries).toBe(1);
  expect(stored.axes["pile-count"].modes.manual.bestTimeMs).toBeGreaterThan(0);
  await page.getByRole("link", { name: "Retour à l’entraînement" }).click();
  await expect(page.getByText(/^Record : /)).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  browserErrors.assertClean();
});

test("@smoke pile-count normal unlocks after beginner, and bad routes are handled", async ({ page }) => {
  const locked = await page.goto("/training/puzzle/pile-count?mode=normal");
  expect(locked?.status()).toBe(200);
  await expect(page.getByRole("heading", { name: "Mode Normal verrouillé" })).toBeVisible();

  const progress = recordPileCountSeries(emptyTrainingProgress(), "beginner", 8);
  await page.evaluate(([key, value]) => localStorage.setItem(key, value), [PROGRESS_KEY, JSON.stringify(progress)]);
  await page.goto("/training");
  await page.getByRole("link", { name: "Compter son tas en mode Normal" }).click();
  const [first] = seriesFor("normal", progress);
  await expect(page.getByText(`soit ${first.cards.length} cartes.`)).toBeVisible();
  await expect(page.getByText("Mode Normal")).toBeVisible();

  expect((await page.goto("/training/puzzle/pile-count?mode=expert"))?.status()).toBe(404);
  expect((await page.goto("/training/puzzle/pile-count?level=1"))?.status()).toBe(404);
  await page.goto("/training/puzzle/pile-count");
  await expect(page).toHaveURL(/\/training$/);
});
