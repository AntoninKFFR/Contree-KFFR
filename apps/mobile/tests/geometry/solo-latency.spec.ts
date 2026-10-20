import { expect, test, type ConsoleMessage } from "@playwright/test";
import { resolve } from "node:path";

// Actual RN-web scene/controller/API with a controlled HTTP wait; no UI mocks.
for (const delay of [600, 1600]) test(`Solo latency benchmark ${delay}ms`, async ({ page }, info) => {
  await page.setViewportSize({ width: 844, height: 390 });
  const samples = [];
  for (let run = 0; run < 5; run++) {
    const traces: Promise<Record<string, string | number>>[] = [];
    const listen = (message: ConsoleMessage) => {
      if (message.text().startsWith("[Solo performance]")) traces.push(message.args()[1].jsonValue());
    };
    page.on("console", listen);
    await page.goto(`/?screen=solo&parity=start&postDelay=${delay}`);
    const card = page.getByRole("button", { name: /^Jouer / }).first();
    await expect(card).toBeEnabled();
    const sample = await card.evaluate(async (button) => {
      const start = performance.now();
      let feedback: number | undefined;
      return await new Promise<{ feedbackMs: number; confirmedMs: number }>((resolve) => {
        const observe = () => {
          const confirmed = document.querySelector('[data-testid="solo-play-0"]');
          const provisional = document.querySelector('[data-testid="solo-provisional-card"]');
          if (feedback === undefined && (provisional || confirmed)) feedback = performance.now() - start;
          if (confirmed) resolve({ feedbackMs: feedback!, confirmedMs: performance.now() - start });
          else requestAnimationFrame(observe);
        };
        (button as HTMLElement).click();
        requestAnimationFrame(observe);
      });
    });
    await page.evaluate(() => new Promise(requestAnimationFrame));
    const phases = (await Promise.all(traces)).filter((trace) => trace.operation === "play-card");
    page.off("console", listen);
    samples.push({ ...sample, phases });
    if (!process.env.SOLO_BASELINE) expect(sample.feedbackMs).toBeLessThan(150);
    expect(sample.confirmedMs).toBeGreaterThanOrEqual(delay);
  }
  await info.attach("latency.json", { body: JSON.stringify({ delay, samples }, null, 2), contentType: "application/json" });
  console.log(JSON.stringify({ benchmark: process.env.SOLO_BASELINE ? "before" : "after", delay, samples }));
});

for (const refused of [false, true]) test(`Solo provisional flight ${refused ? "rolls back" : "joins the confirmed trick"}`, async ({ page }, info) => {
  await page.setViewportSize({ width: 844, height: 390 });
  await page.goto(`/?screen=solo&parity=start&motion=1&postDelay=1600${refused ? "&solo=action-error" : ""}`);
  const card = page.getByRole("button", { name: /^Jouer / }).first();
  await expect(card).toBeEnabled();
  // Let the real 220ms + staggered deal finish before measuring its origin.
  await page.waitForTimeout(500);
  const label = (await card.getAttribute("aria-label"))!;
  const original = (await page.getByTestId("solo-hand-card").first().boundingBox())!;
  if (!refused) await page.screenshot({ path: resolve("docs/parity-150/captures/latency-before-touch.png") });
  // Browser scrollIntoView on a clipped fan changes the viewport; a DOM click
  // invokes the real Pressable without that Playwright-specific auto-scroll.
  await card.evaluate((button) => (button as HTMLElement).click());
  const provisional = page.getByTestId("solo-provisional-card");
  await expect(provisional).toBeVisible();
  await expect.poll(async () => { const box = (await provisional.boundingBox())!; return Math.abs(box.x + box.width / 2 - 427); }).toBeLessThan(.5);
  const flying = (await provisional.boundingBox())!;
  await expect(page.getByTestId("solo-play-0")).toHaveCount(0);
  await expect(page.getByRole("progressbar")).toHaveCount(0);
  await page.screenshot({ path: info.outputPath("pending-flight.png") });
  if (!refused) await page.screenshot({ path: resolve("docs/parity-150/captures/latency-immediate-flight.png") });
  await expect(provisional).toHaveCount(0);
  if (refused) {
    const restored = page.getByRole("button", { name: label, exact: true });
    await expect(page.getByRole("alert")).toContainText("Action refusée");
    await expect(restored).toBeVisible();
    await expect.poll(async () => Math.abs((await page.getByTestId("solo-hand-card").first().boundingBox())!.y - original.y)).toBeLessThan(2);
    await expect(page.getByTestId("solo-play-0")).toHaveCount(0);
  } else {
    const confirmed = (await page.getByTestId("solo-play-0").boundingBox())!;
    expect(Math.abs(confirmed.x - flying.x)).toBeLessThan(3);
    expect(Math.abs(confirmed.y - flying.y)).toBeLessThan(3);
    await page.screenshot({ path: resolve("docs/parity-150/captures/latency-confirmed.png") });
  }
});
