import { expect, test, type Page } from "@playwright/test";

const sizes = [{ width: 568, height: 320 }, { width: 667, height: 375 }, { width: 844, height: 390 }, { width: 932, height: 430 }];
async function geometry(page: Page, connected: boolean, left = 47, right = 47, bottom = 21) {
  await expect(page.getByTestId("game-screen")).toBeVisible();
  await expect(page.getByTestId("game-screen").getByTestId("secondary-scroll")).toHaveCount(0);
  const result = await page.evaluate(({ connected, left, right, bottom }) => {
    const errors: string[] = [];
    const viewport = { width: innerWidth, height: innerHeight };
    if (document.documentElement.scrollWidth > innerWidth + 1 || document.documentElement.scrollHeight > innerHeight + 1) errors.push("document overflow");
    const content = document.querySelector('[data-testid="game-content"]')!.getBoundingClientRect();
    for (const element of document.querySelectorAll('[data-testid="game-screen"], [data-testid="game-screen"] *')) {
      const style = getComputedStyle(element);
      if ([style.overflowX, style.overflowY].some((value) => ["auto", "scroll"].includes(value))) errors.push("scrollable principal screen");
    }
    if (content.left < left - 1 || content.right > innerWidth - right + 1) errors.push("content crosses side safe areas");
    const interactive = Array.from(document.querySelectorAll('[role="button"],[role="tab"],[role="link"]')).filter((e) => e.getBoundingClientRect().width && e.getBoundingClientRect().height);
    for (const element of interactive) {
      const r = element.getBoundingClientRect();
      if (r.width < 43.5 || r.height < 43.5) errors.push("touch target under 44: " + element.textContent);
      if (r.left < left - 1 || r.right > innerWidth - right + 1 || r.bottom > innerHeight - bottom + 1 || r.top < -1) errors.push("control outside safe viewport: " + element.textContent);
      if (element.closest('[data-testid="game-content"]') && (r.top < content.top - 1 || r.bottom > content.bottom + 1)) errors.push("control outside content: " + element.textContent);
      const panel = element.closest('[data-testid="game-panel"]');
      if (panel) {
        const bounds = panel.getBoundingClientRect();
        if (r.left < bounds.left - 1 || r.right > bounds.right + 1 || r.top < bounds.top - 1 || r.bottom > bounds.bottom + 1) errors.push("control outside panel: " + element.textContent);
      }
    }
    for (const element of Array.from(document.querySelectorAll('[data-testid="game-screen"] *'))) {
      if (element.childElementCount || !element.textContent?.trim()) continue;
      const r = element.getBoundingClientRect();
      if (!r.width || !r.height) continue;
      const color = (value: string) => (value.match(/[\d.]+/g) || []).slice(0, 3).map(Number);
      const luminance = (rgb: number[]) => rgb.map((channel) => channel / 255).map((channel) => channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4).reduce((sum, channel, index) => sum + channel * [0.2126, 0.7152, 0.0722][index], 0);
      let background: Element | null = element;
      while (background && ["transparent", "rgba(0, 0, 0, 0)"].includes(getComputedStyle(background).backgroundColor)) background = background.parentElement;
      const foregroundLuminance = luminance(color(getComputedStyle(element).color));
      const backgroundLuminance = luminance(color(background ? getComputedStyle(background).backgroundColor : "rgb(6,18,13)"));
      const contrast = (Math.max(foregroundLuminance, backgroundLuminance) + 0.05) / (Math.min(foregroundLuminance, backgroundLuminance) + 0.05);
      if (contrast < 4.5) errors.push("text contrast under 4.5: " + element.textContent);
      if (r.left < left - 1 || r.right > innerWidth - right + 1 || r.bottom > (connected ? content.bottom : innerHeight - bottom) + 1 || r.top < -1) errors.push("text outside screen: " + element.textContent);
      if (element.scrollWidth > element.clientWidth + 1 && element.clientWidth > 0) errors.push("text clipped horizontally: " + element.textContent);
      const button = element.closest('[role="button"],[role="tab"],[role="link"]');
      if (button) {
        const bounds = button.getBoundingClientRect();
        const range = document.createRange(); range.selectNodeContents(element); const glyphs = range.getBoundingClientRect();
        if (glyphs.left < bounds.left - 1 || glyphs.right > bounds.right + 1 || glyphs.top < bounds.top - 1 || glyphs.bottom > bounds.bottom + 1) errors.push("text outside its control: " + element.textContent);
      }
    }
    if (connected) {
      const nav = document.querySelector('[data-testid="game-navigation"]')!.getBoundingClientRect();
      if (Math.abs(nav.height - bottom - 48) > 1) errors.push("navigation must be 48 + one bottom inset");
      if (content.bottom > nav.top + 1) errors.push("navigation overlaps content");
    }
    return { errors, viewport };
  }, { connected, left, right, bottom });
  expect(result.errors).toEqual([]);
}

for (const size of sizes) {
  for (const screen of ["home", "profile", "login"]) {
    test(screen + " fits " + size.width + "x" + size.height, async ({ page }, info) => {
      await page.setViewportSize(size);
      await page.goto("/?screen=" + screen);
      await geometry(page, screen !== "login");
      if (screen === "home") {
        await expect(page.getByRole("button", { name: /Bientôt disponible sur iPhone/ })).toHaveCount(3);
        for (const button of await page.getByRole("button", { name: /Bientôt disponible sur iPhone/ }).all()) await expect(button).toBeDisabled();
        await page.getByRole("tab", { name: "Onglet Profil" }).click();
        await expect(page.getByLabel("Pseudo KFFR : Antonin KFFR")).toBeVisible();
        await page.getByRole("link", { name: "Retour à l’accueil" }).click();
        await geometry(page, true);
      }
      await page.screenshot({ path: info.outputPath(screen + ".png") });
    });
  }
  for (const state of ["loading", "offline", "logout", "configuration"]) {
    test(state + " fits " + size.width + "x" + size.height, async ({ page }, info) => {
      await page.setViewportSize(size);
      await page.goto("/?screen=profile&state=" + state);
      await geometry(page, true);
      await expect(page.getByText("Antonin KFFR", { exact: true })).toHaveCount(0);
      await page.screenshot({ path: info.outputPath(state + ".png") });
    });
  }
  test("long username and modal at " + size.width, async ({ page }, info) => {
    await page.setViewportSize(size);
    for (const [index, username] of ["Un très long pseudo KFFR qui reste intégralement lisible", "WWWWWWWWWWWWWWWWWWWWWW"].entries()) {
      await page.goto("/?screen=profile&username=" + encodeURIComponent(username));
      await geometry(page, true);
      await page.getByRole("button", { name: "Voir mon pseudo" }).click();
      await expect(page.getByLabel("Pseudo KFFR : " + username)).toBeVisible();
      await expect(page.getByTestId("secondary-scroll")).toBeVisible();
      expect(await page.getByTestId("secondary-scroll").evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
      await page.screenshot({ path: info.outputPath("long-username-" + index + ".png") });
      await page.getByRole("button", { name: "Fermer" }).click();
      await geometry(page, true);
    }
  });
  test("large text reorganizes " + size.width, async ({ page }, info) => {
    await page.setViewportSize(size);
    for (const screen of ["home", "profile", "login"]) {
      await page.goto("/?screen=" + screen + "&font=1.6");
      await geometry(page, screen !== "login");
      await page.screenshot({ path: info.outputPath(screen + "-large-text.png") });
    }
    for (const state of ["loading", "offline", "logout", "configuration"]) {
      await page.goto("/?screen=profile&state=" + state + "&font=1.6");
      await geometry(page, true);
      await page.screenshot({ path: info.outputPath(state + "-large-text.png") });
    }
  });
}
test("asymmetric safe areas, rotation fallback and native form modal", async ({ page }, info) => {
  for (const [left, right] of [[59, 0], [0, 59]]) {
    await page.setViewportSize({ width: 844, height: 390 });
    await page.goto("/?screen=profile&left=" + left + "&right=" + right);
    await geometry(page, true, left, right);
    await page.screenshot({ path: info.outputPath("island-" + left + ".png") });
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByTestId("rotation-notice")).toBeVisible();
  await page.screenshot({ path: info.outputPath("rotation-fallback.png") });
  await page.setViewportSize({ width: 844, height: 390 });
  await expect(page.getByText("Mon profil", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Pseudo KFFR : Antonin KFFR")).toBeVisible();
  await geometry(page, true, 0, 59);
  await page.goto("/?screen=login");
  await page.getByRole("button", { name: "Se connecter", exact: true }).click();
  await expect(page.getByLabel("Adresse email")).toBeVisible();
  await page.getByLabel("Adresse email").fill("qa@example.test");
  await page.getByLabel("Mot de passe").fill("test-only");
  await page.setViewportSize({ width: 844, height: 200 });
  await page.screenshot({ path: info.outputPath("login-reduced-height.png") });
  await page.getByRole("button", { name: "Se connecter", exact: true }).click();
  await expect(page.getByRole("tab", { name: "Onglet Accueil" })).toBeVisible();
});

for (const size of [sizes[0], sizes[2]]) {
  test("comparable art directions at " + size.width, async ({ page }, info) => {
    await page.setViewportSize(size);
    for (const proposal of ["club", "salon"]) {
      await page.goto("/?proposal=" + proposal);
      await geometry(page, true);
      const modes = page.getByRole("button", { name: /Bientôt disponible sur iPhone/ });
      await expect(modes).toHaveCount(3);
      for (const mode of await modes.all()) await expect(mode).toBeDisabled();
      await page.screenshot({ path: info.outputPath("proposal-" + proposal + ".png"), animations: "disabled" });
    }
  });
}

test("real Reanimated press feedback follows live Reduce Motion and keyboard focus", async ({ page }, info) => {
  await page.setViewportSize(sizes[2]);
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto("/?screen=login");
  const button = page.getByRole("button", { name: "Se connecter", exact: true });
  const face = button.locator(":scope > div").first();
  const duration = () => face.evaluate((element) => getComputedStyle(element).transitionDuration);
  const scale = () => face.evaluate((element) => new DOMMatrix(getComputedStyle(element).transform).a);
  await expect.poll(duration).toBe("0.12s");
  await button.hover();
  await page.mouse.down();
  await expect.poll(scale).toBeCloseTo(0.97, 2);
  await page.screenshot({ path: info.outputPath("login-pressed.png"), animations: "disabled" });
  // Move away to cancel the click while still exercising release feedback.
  await page.mouse.move(10, 10); await page.mouse.up();
  await expect.poll(scale).toBe(1);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect.poll(duration).toBe("0s");
  await button.hover(); await page.mouse.down();
  await expect.poll(scale).toBe(1);
  await page.mouse.move(10, 10); await page.mouse.up();
  await button.focus();
  await expect(button).toBeFocused();
  await page.screenshot({ path: info.outputPath("login-keyboard-focus.png"), animations: "disabled" });
  await page.keyboard.press("Enter");
  await expect(page.getByLabel("Adresse email")).toBeVisible();
  await page.getByLabel("Adresse email").focus();
  await page.screenshot({ path: info.outputPath("login-form-focus.png"), animations: "disabled" });
  await page.getByRole("button", { name: "Fermer" }).click();
  await geometry(page, false);
});
