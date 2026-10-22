import { test, expect } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
const evidence = process.env.SEAT_RESERVATION_CAPTURE_DIR ?? "geometry-results/seat-reservation";
test.use({ hasTouch: true });

for (const failure of ["wrong-ack", "http", "network", "stale"]) test(`seat reservation ${failure}: actual refusal stays visible, then explicit retry confirms the seat`, async ({ page }) => {
  const trace: unknown[] = [];
  page.on("console", async (message) => { if (message.text().startsWith("[lobby-seat]")) trace.push(await message.args()[1]?.jsonValue()); });
  await page.setViewportSize({ width: 844, height: 390 });
  await page.goto(`/?screen=multiplayer&multi=lobby-free&guest=1&hostSeat=1&seatFailure=${failure}&postDelay=500`);
  await page.getByRole("button", { name: "Rouvrir la dernière table de cet appareil" }).click();
  const seat = page.getByTestId("lobby-seat-2");
  const intents = () => page.evaluate(() => (globalThis as unknown as { __multiplayerFixture: { requests: { body: { expectedVersion?: number; intent?: { type: string; seatIndex: number } } | null }[] } }).__multiplayerFixture.requests.flatMap((r) => r.body?.intent?.type === "join-seat" ? [r.body] : []));
  const box = (await seat.boundingBox())!;
  await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
  await expect(seat).toContainText("Réservation…");
  await expect.poll(intents).toHaveLength(1);
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(seat).not.toContainText("Moi");
  await expect(page.getByText(/ · Moi$/)).toHaveCount(0);
  const message = await page.getByRole("alert").innerText();
  // A scheduled background GET used to clear the only error immediately.
  await page.waitForTimeout(4300);
  await expect(page.getByRole("alert")).toHaveText(message);
  expect(await intents()).toHaveLength(1);
  mkdirSync(evidence, { recursive: true });
  await page.screenshot({ path: join(evidence, `${failure}-refused.png`) });
  await seat.tap(); await expect(seat).toContainText("Moi");
  const sent = await intents(); expect(sent).toHaveLength(2);
  expect(sent[1]!.expectedVersion).toBe(sent[0]!.expectedVersion! + (failure === "stale" ? 1 : 0));
  const authoritative = await page.evaluate(() => (globalThis as unknown as { __multiplayerFixture: { current: () => { viewerSeatIndex: number | null } } }).__multiplayerFixture.current().viewerSeatIndex);
  expect(authoritative).toBe(2);
  await expect(page.getByRole("alert")).toHaveCount(0);
  await page.screenshot({ path: join(evidence, `${failure}-confirmed.png`) });
  writeFileSync(join(evidence, `${failure}-trace.json`), JSON.stringify(trace, null, 2));
});

test("north stays north through changing, leaving, and joining another place", async ({ page }) => {
  await page.setViewportSize({ width: 844, height: 390 });
  await page.goto("/?screen=multiplayer&multi=lobby-free&guest=1&hostSeat=0&postDelay=300");
  await page.getByRole("button", { name: "Rouvrir la dernière table de cet appareil" }).click();
  const positions = await Promise.all([0, 1, 2, 3].map((seat) => page.getByTestId(`lobby-seat-${seat}`).boundingBox()));
  // Match the fixed web lobby: 0 south, 1 east, 2 north, 3 west.
  expect(positions[2]!.y).toBeLessThan(positions[1]!.y);
  expect(positions[1]!.y).toBeLessThan(positions[0]!.y);
  expect(positions[3]!.x).toBeLessThan(positions[0]!.x);
  expect(positions[0]!.x).toBeLessThan(positions[1]!.x);
  const assertPositions = async () => expect(await Promise.all([0, 1, 2, 3].map((seat) => page.getByTestId(`lobby-seat-${seat}`).boundingBox()))).toEqual(positions);
  mkdirSync(evidence, { recursive: true });
  await page.screenshot({ path: join(evidence, "fixed-positions-before.png") });
  for (const seat of [2, 3]) {
    await page.getByTestId(`lobby-seat-${seat}`).tap();
    await expect(page.getByTestId(`lobby-seat-${seat}`)).toContainText("Moi");
    await assertPositions();
    await page.screenshot({ path: join(evidence, `fixed-positions-confirmed-${seat}.png`) });
  }
  await page.getByRole("button", { name: "Quitter la place", exact: true }).tap();
  await expect(page.getByText(/ · Moi$/)).toHaveCount(0);
  await assertPositions();
  await page.getByTestId("lobby-seat-1").tap();
  await expect(page.getByTestId("lobby-seat-1")).toContainText("Moi");
  await assertPositions();
  // Let the actual lifecycle's scheduled refresh reconcile the confirmed seat.
  await page.waitForTimeout(4300);
  await expect(page.getByTestId("lobby-seat-1")).toContainText("Moi");
  await assertPositions();
  const result = await page.evaluate(() => {
    const fixture = (globalThis as unknown as { __multiplayerFixture: { current: () => { viewerSeatIndex: number | null }; requests: { body: { intent?: unknown } | null }[] } }).__multiplayerFixture;
    return { seat: fixture.current().viewerSeatIndex, intents: fixture.requests.flatMap((r) => r.body?.intent ? [r.body.intent] : []) };
  });
  expect(result).toEqual({ seat: 1, intents: [{ type: "join-seat", seatIndex: 2 }, { type: "join-seat", seatIndex: 3 }, { type: "leave-seat" }, { type: "join-seat", seatIndex: 1 }] });
  await page.screenshot({ path: join(evidence, "fixed-positions-rejoin-1.png") });
  writeFileSync(join(evidence, "fixed-positions.json"), JSON.stringify({ positions, result }, null, 2));
});
