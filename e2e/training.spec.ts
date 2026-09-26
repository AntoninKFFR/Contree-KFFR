import { expect, test } from "@playwright/test";
import { monitorBrowserErrors } from "./helpers/browserErrors";
import { generatorVersion } from "@/engine/training/generator";
import { generateTrickValueSeries } from "@/engine/training/trickValue";
import { challengeDifficulty, challengeRunSeed, generateChallengeExercise } from "@/engine/training/trickValueChallenge";

const unlockedProgress = {
  version: 1,
  axes: {
    "trick-value": {
      unlockedLevel: 2,
      levels: {
        1: { bestScore: 8, completedSeries: 1 },
        2: { bestScore: 0, completedSeries: 0 },
      },
    },
  },
};
const challengeUnlockedProgress = {
  ...unlockedProgress,
  axes: { "trick-value": {
    ...unlockedProgress.axes["trick-value"],
    levels: { ...unlockedProgress.axes["trick-value"].levels, 2: { bestScore: 8, completedSeries: 1 } },
  } },
};

async function unlockChallenges(page: import("@playwright/test").Page) {
  await page.goto("/training");
  await page.evaluate((value) => localStorage.setItem("coinche:training-progress:v1", JSON.stringify(value)), challengeUnlockedProgress);
}

function challengeAnswer(mode: "survival" | "blitz", index: number, correctAnswers: number) {
  return generateChallengeExercise({
    runSeed: challengeRunSeed(mode, 0), exerciseIndex: index, generatorVersion,
    difficulty: challengeDifficulty(mode, index, correctAnswers),
  }).answer;
}

test("@smoke public training hub shows level 1 and locks level 2", async ({ page }) => {
  const browserErrors = monitorBrowserErrors(page);
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/");
  await expect(page.getByRole("navigation", { name: "Navigation principale" }).getByRole("link", { name: "Entraînement" })).toBeVisible();
  await page.getByRole("navigation", { name: "Navigation principale" }).getByRole("link", { name: "Entraînement" }).click();
  await expect(page).toHaveURL(/\/training$/);
  await expect(page.getByRole("heading", { name: "Fondamentaux" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Confirmé" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Survie" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Blitz" })).toBeVisible();
  await expect(page.getByText("Réussis 8/10 en Confirmé pour débloquer ce mode.")).toHaveCount(2);
  await expect(page.getByRole("link", { name: "Jouer en Survie" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Jouer en Blitz" })).toHaveCount(0);
  await expect(page.getByText("Obtiens 8/10 au niveau 1 pour débloquer ce niveau.")).toBeVisible();
  await expect(page.getByRole("link", { name: "Jouer le niveau 2" })).toHaveCount(0);
  await page.getByRole("link", { name: "Jouer le niveau 1" }).click();
  await expect(page).toHaveURL(/level=1/);
  await expect(page.getByText("Niveau 1 · Fondamentaux")).toBeVisible();
  await expect(page.getByLabel("Aide des valeurs des cartes")).toBeVisible();
  const answer = page.getByRole("textbox", { name: "Ta réponse en points" });
  await answer.click();
  await answer.fill("a1b2c3d4");
  await expect(answer).toHaveValue("123");
  await answer.press("Backspace");
  await expect(answer).toHaveValue("12");
  await answer.press("Home");
  await answer.press("Delete");
  await expect(answer).toHaveValue("2");
  await answer.fill("0");
  await page.keyboard.press("Enter");
  await expect(page.getByText(/Ce pli vaut \d+ points/)).toBeVisible();
  browserErrors.assertClean();
});

test("@smoke completes ten level-1 exercises without an account on mobile", async ({ page }) => {
  const browserErrors = monitorBrowserErrors(page);
  const trainingPosts: string[] = [];
  page.on("request", (request) => {
    if (request.method() === "POST" && request.url().includes("/api/training/series")) trainingPosts.push(request.url());
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/training");
  await expect(page.getByRole("heading", { name: "Entraînement" })).toBeVisible();
  await page.getByRole("button", { name: "Ouvrir le menu" }).click();
  await expect(page.getByRole("navigation", { name: "Navigation mobile" }).getByRole("link", { name: "Entraînement" })).toBeVisible();
  await page.getByRole("button", { name: "Ouvrir le menu" }).click();
  await page.getByRole("link", { name: "Jouer le niveau 1" }).click();
  for (let exercise = 1; exercise <= 10; exercise += 1) {
    await expect(page.getByLabel(`Exercice ${exercise} sur 10`)).toBeVisible();
    await expect(page.getByRole("list", { name: "Cartes du pli" }).locator("li")).toHaveCount(4);
    await expect(page.getByLabel("Aide des valeurs des cartes")).toBeVisible();
    await expect(page.getByText("Dernier pli · 10 de der")).toHaveCount(0);
    const zero = page.getByRole("button", { name: "0", exact: true });
    const size = await zero.boundingBox();
    expect(size?.height).toBeGreaterThanOrEqual(44);
    await zero.click();
    await page.getByRole("button", { name: "Valider" }).click();
    await expect(page.getByText(/Ce pli vaut \d+ points/)).toBeVisible();
    await expect(zero).toHaveCount(0);
    await page.getByRole("button", { name: exercise === 10 ? "Voir le résultat" : "Exercice suivant" }).click();
  }
  await expect(page.getByRole("heading", { name: "Résultat" })).toBeVisible();
  await expect(page.getByText(/Meilleur score du niveau 1/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Rejouer le niveau 1" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Retour aux niveaux" })).toBeVisible();
  const stored = await page.evaluate(() => localStorage.getItem("coinche:training-progress:v1"));
  expect(JSON.parse(stored ?? "null").axes["trick-value"].levels["1"].completedSeries).toBe(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  expect(trainingPosts).toEqual([]);
  browserErrors.assertClean();
});

test("@smoke unlocked players can choose either level explicitly", async ({ page }) => {
  const browserErrors = monitorBrowserErrors(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/training");
  await page.evaluate((value) => localStorage.setItem("coinche:training-progress:v1", JSON.stringify(value)), unlockedProgress);
  await page.reload();
  await expect(page.getByRole("link", { name: "Jouer le niveau 1" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Jouer le niveau 2" })).toBeVisible();
  await page.getByRole("link", { name: "Jouer le niveau 1" }).click();
  await expect(page).toHaveURL(/level=1/);
  await expect(page.getByText("Niveau 1 · Fondamentaux")).toBeVisible();
  await page.getByRole("link", { name: "Changer de niveau" }).click();
  await page.getByRole("link", { name: "Jouer le niveau 2" }).click();
  await expect(page).toHaveURL(/level=2/);
  await expect(page.getByText("Niveau 2 · Confirmé")).toBeVisible();
  await expect(page.getByLabel("Aide des valeurs des cartes")).toHaveCount(0);
  for (let exercise = 1; exercise <= 3; exercise += 1) {
    await expect(page.getByLabel(`Exercice ${exercise} sur 10`)).toBeVisible();
    if (exercise === 3) {
      await expect(page.getByText("Dernier pli · 10 de der")).toBeVisible();
      break;
    }
    await page.getByRole("button", { name: "0", exact: true }).click();
    await page.getByRole("button", { name: "Valider" }).click();
    await expect(page.getByText(/Ce pli vaut \d+ points/)).toHaveCount(0);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  browserErrors.assertClean();
});

test("@smoke standard desktop exercise fits 1366x768 and mobile has no horizontal overflow", async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto("/training/puzzle/trick-value?level=1");
  await expect(page.getByRole("list", { name: "Cartes du pli" }).locator("li")).toHaveCount(4);
  await expect(page.getByRole("button", { name: "Valider" })).toBeVisible();
  const desktop = await page.evaluate(() => ({
    horizontal: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    vertical: document.documentElement.scrollHeight - document.documentElement.clientHeight,
  }));
  expect(desktop.horizontal).toBeLessThanOrEqual(0);
  expect(desktop.vertical).toBeLessThanOrEqual(8);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
});

test("@smoke confirmed level advances automatically, records the score and finishes after ten answers", async ({ page }) => {
  await page.goto("/training");
  await page.evaluate((value) => localStorage.setItem("coinche:training-progress:v1", JSON.stringify(value)), unlockedProgress);
  await page.goto("/training/puzzle/trick-value?level=2");
  const exercises = generateTrickValueSeries({ seed: 580000, generatorVersion, level: 2 });
  const submitted = exercises.map((exercise, index) => index === 0 ? String(exercise.answer) : "0");
  for (let index = 0; index < 10; index += 1) {
    await expect(page.getByLabel(`Exercice ${index + 1} sur 10`)).toBeVisible();
    await expect(page.getByLabel("Aide des valeurs des cartes")).toHaveCount(0);
    await expect(page.getByText(/Ce pli vaut \d+ points/)).toHaveCount(0);
    const answer = page.getByRole("textbox", { name: "Ta réponse en points" });
    await answer.fill(submitted[index]);
    await answer.press("Enter");
    await expect(page.getByRole("button", { name: "Exercice suivant" })).toHaveCount(0);
  }
  await expect(page.getByRole("heading", { name: "Résultat" })).toBeVisible();
  const expected = submitted.filter((value, index) => Number(value) === exercises[index].answer).length;
  await expect(page.getByText(`${expected} / 10`, { exact: true })).toBeVisible();
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem("coinche:training-progress:v1") ?? "null"));
  expect(stored.axes["trick-value"].levels[2]).toEqual({ bestScore: expected, completedSeries: 1 });
});

test("@smoke training tones follow existing global and UI sound preferences", async ({ page }) => {
  await page.addInitScript(() => {
    const tones: number[] = [];
    Object.assign(window, { __trainingTones: tones });
    Object.defineProperty(window, "AudioContext", { configurable: true, value: class {
      state = "running";
      currentTime = 0;
      destination = {};
      createOscillator() {
        return { frequency: { value: 0 }, type: "sine", connect() {}, start() { tones.push(this.frequency.value); }, stop() {} };
      }
      createGain() { return { gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect() {} }; }
    } });
  });
  await page.goto("/training");
  await page.evaluate((value) => localStorage.setItem("coinche:training-progress:v1", JSON.stringify(value)), unlockedProgress);
  await page.evaluate(() => {
    const key = "coinche:player-preferences:v1";
    const preferences = JSON.parse(localStorage.getItem(key) ?? "null");
    preferences.audio.enabled = true;
    preferences.audio.uiSounds = true;
    preferences.audio.volume = 0.5;
    localStorage.setItem(key, JSON.stringify(preferences));
  });
  await page.goto("/training/puzzle/trick-value?level=2");
  const exercises = generateTrickValueSeries({ seed: 580000, generatorVersion, level: 2 });
  await page.getByRole("textbox", { name: "Ta réponse en points" }).fill(String(exercises[0].answer));
  await page.getByRole("textbox", { name: "Ta réponse en points" }).press("Enter");
  await expect(page.getByLabel("Exercice 2 sur 10")).toBeVisible();
  await page.getByRole("textbox", { name: "Ta réponse en points" }).fill(String(exercises[1].answer === 0 ? 1 : 0));
  await page.getByRole("textbox", { name: "Ta réponse en points" }).press("Enter");
  await expect(page.getByLabel("Exercice 3 sur 10")).toBeVisible();
  expect(await page.evaluate(() => (window as typeof window & { __trainingTones: number[] }).__trainingTones)).toEqual([880, 220]);

  await page.evaluate(() => {
    const key = "coinche:player-preferences:v1";
    const preferences = JSON.parse(localStorage.getItem(key) ?? "null");
    preferences.audio.uiSounds = false;
    localStorage.setItem(key, JSON.stringify(preferences));
  });
  await page.reload();
  await page.getByRole("textbox", { name: "Ta réponse en points" }).fill("0");
  await page.getByRole("textbox", { name: "Ta réponse en points" }).press("Enter");
  expect(await page.evaluate(() => (window as typeof window & { __trainingTones: number[] }).__trainingTones)).toEqual([]);
});

test("@smoke invalid and locked training levels are handled", async ({ page }) => {
  const locked = await page.goto("/training/puzzle/trick-value?level=2");
  expect(locked?.status()).toBe(200);
  await expect(page.getByRole("heading", { name: "Niveau 2 verrouillé" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Retour aux niveaux" })).toBeVisible();
  const invalid = await page.goto("/training/puzzle/trick-value?level=3");
  expect(invalid?.status()).toBe(404);
  const unknown = await page.goto("/training/puzzle/unknown-axis?level=1");
  expect(unknown?.status()).toBe(404);
  const badMode = await page.goto("/training/puzzle/trick-value?mode=unknown");
  expect(badMode?.status()).toBe(404);
  const ambiguous = await page.goto("/training/puzzle/trick-value?mode=blitz&level=2");
  expect(ambiguous?.status()).toBe(404);
  const lockedChallenge = await page.goto("/training/puzzle/trick-value?mode=survival");
  expect(lockedChallenge?.status()).toBe(200);
  await expect(page.getByRole("heading", { name: "Mode verrouillé" })).toBeVisible();
});

test("@smoke challenges unlock together after Confirmé 8/10 and remain responsive", async ({ page }) => {
  const browserErrors = monitorBrowserErrors(page);
  await unlockChallenges(page);
  await page.reload();
  await expect(page.getByRole("link", { name: "Jouer en Survie" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Jouer en Blitz" })).toBeVisible();
  for (const viewport of [{ width: 1366, height: 768 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport);
    for (const mode of ["survival", "blitz"] as const) {
      await page.goto(`/training/puzzle/trick-value?mode=${mode}`);
      await expect(page.getByRole("list", { name: "Cartes du pli" }).locator("li")).toHaveCount(4);
      const overflow = await page.evaluate(() => ({
        horizontal: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        vertical: document.documentElement.scrollHeight - document.documentElement.clientHeight,
      }));
      expect(overflow.horizontal).toBeLessThanOrEqual(0);
      if (viewport.width === 1366) expect(overflow.vertical).toBeLessThanOrEqual(8);
    }
  }
  browserErrors.assertClean();
});

test("@smoke Survie loses lives on wrong answer and timeout, then records a finished run", async ({ page }) => {
  const browserErrors = monitorBrowserErrors(page);
  await page.clock.install();
  await unlockChallenges(page);
  await page.goto("/training/puzzle/trick-value?mode=survival");
  await expect(page.getByLabel("Vies restantes : 3")).toBeVisible();
  const answer = page.getByRole("textbox", { name: "Ta réponse en points" });
  await expect(answer).toBeFocused();
  await answer.fill(String(challengeAnswer("survival", 0, 0)));
  await answer.press("Enter");
  await page.clock.runFor(200);
  await expect(page.getByLabel("Vies restantes : 3")).toBeVisible();
  await expect(page.getByText("Score 1 · Palier 1")).toBeVisible();
  await expect(page.getByText("Pli 2")).toBeVisible();
  await answer.fill(String(challengeAnswer("survival", 1, 1) === 0 ? 1 : 0));
  await answer.press("Enter");
  await page.clock.runFor(200);
  await expect(page.getByLabel("Vies restantes : 2")).toBeVisible();
  await expect(page.getByText("Pli 3")).toBeVisible();
  await expect(answer).toBeFocused();
  await page.clock.fastForward(9_100);
  await page.clock.runFor(200);
  await expect(page.getByLabel("Vies restantes : 1")).toBeVisible();
  await expect(page.getByText("Pli 4")).toBeVisible();
  await answer.fill(String(challengeAnswer("survival", 3, 1) === 0 ? 1 : 0));
  await answer.press("Enter");
  await expect(page.getByRole("heading", { name: "Résultat Survie" })).toBeVisible();
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem("coinche:training-progress:v1") ?? "null"));
  expect(stored.axes["trick-value"].challenges.survival).toEqual({ bestScore: 1, bestStreak: 0, completedRuns: 1 });
  expect(stored.axes["trick-value"].challenges.blitz.completedRuns).toBe(0);
  await page.getByRole("link", { name: "Retour entraînement" }).click();
  await expect(page.getByText("Record : 1 pli")).toBeVisible();
  browserErrors.assertClean();
});

test("@smoke challenge resolves a double submit once and cancels its clock on navigation", async ({ page }) => {
  const browserErrors = monitorBrowserErrors(page);
  await page.clock.install();
  await unlockChallenges(page);
  await page.goto("/training/puzzle/trick-value?mode=survival");
  await page.getByRole("textbox", { name: "Ta réponse en points" }).fill(String(challengeAnswer("survival", 0, 0) === 0 ? 1 : 0));
  await page.evaluate(() => {
    const button = [...document.querySelectorAll("button")].find((candidate) => candidate.textContent === "Valider");
    button?.click();
    button?.click();
  });
  await page.clock.runFor(200);
  await expect(page.getByLabel("Vies restantes : 2")).toBeVisible();
  await expect(page.getByText("Pli 2")).toBeVisible();
  await page.getByRole("link", { name: "Retour entraînement" }).click();
  await page.clock.fastForward(30_000);
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem("coinche:training-progress:v1") ?? "null"));
  expect(stored.axes["trick-value"].challenges?.survival?.completedRuns ?? 0).toBe(0);
  browserErrors.assertClean();
});

test("@smoke Survie counts elapsed background time across successive question deadlines", async ({ page }) => {
  await page.clock.install();
  await unlockChallenges(page);
  await page.goto("/training/puzzle/trick-value?mode=survival");
  await expect(page.getByLabel("Vies restantes : 3")).toBeVisible();
  await page.clock.fastForward(30_000);
  await page.clock.runFor(600);
  await expect(page.getByRole("heading", { name: "Résultat Survie" })).toBeVisible();
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem("coinche:training-progress:v1") ?? "null"));
  expect(stored.axes["trick-value"].challenges.survival.completedRuns).toBe(1);
});

test("@smoke Blitz applies time bonuses, escalating penalties and finishes at its deadline", async ({ page }) => {
  const browserErrors = monitorBrowserErrors(page);
  await page.clock.install();
  await unlockChallenges(page);
  await page.goto("/training/puzzle/trick-value?mode=blitz");
  const timer = page.locator('[aria-label^="Temps restant :"]');
  await expect(timer).toBeVisible();
  expect(Number((await timer.getAttribute("aria-label"))?.match(/[\d.]+/)?.[0])).toBeGreaterThan(59);
  await page.clock.fastForward(10_000);
  const answer = page.getByRole("textbox", { name: "Ta réponse en points" });
  await answer.fill(String(challengeAnswer("blitz", 0, 0)));
  await answer.press("Enter");
  await expect(page.getByText("+1,5 s")).toBeVisible();
  await page.clock.runFor(200);
  await expect(page.getByText("Pli 2")).toBeVisible();
  await expect(answer).toBeFocused();
  await answer.fill(String(challengeAnswer("blitz", 1, 1) === 0 ? 1 : 0));
  await answer.press("Enter");
  await expect(page.getByText("−8 s")).toBeVisible();
  await page.clock.runFor(200);
  await answer.fill(String(challengeAnswer("blitz", 2, 1) === 0 ? 1 : 0));
  await answer.press("Enter");
  await expect(page.getByText("−16 s")).toBeVisible();
  await page.clock.runFor(200);
  await page.clock.fastForward(60_000);
  await expect(page.getByRole("heading", { name: "Résultat Blitz" })).toBeVisible();
  await expect(page.getByText("1 bonne réponse", { exact: true })).toBeVisible();
  await expect(page.getByText("Meilleure série de la run : 1")).toBeVisible();
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem("coinche:training-progress:v1") ?? "null"));
  expect(stored.axes["trick-value"].challenges.blitz).toEqual({ bestScore: 1, bestStreak: 1, completedRuns: 1 });
  browserErrors.assertClean();
});

test("@smoke home training action remains visible at tablet widths", async ({ page }) => {
  for (const width of [640, 680, 718]) {
    await page.setViewportSize({ width, height: 800 });
    await page.goto("/");
    const action = page.getByRole("link", { name: "Entraînement" });
    await expect(action).toBeVisible();
    const box = await action.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.x + box!.width).toBeLessThanOrEqual(width);
  }
});
