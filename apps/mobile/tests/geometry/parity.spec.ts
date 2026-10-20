import { test, expect } from "@playwright/test";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import fixtures from "../parity/states.json";
const dir = "docs/parity-150/captures";
for (const viewport of [{ width: 844, height: 390 }, { width: 568, height: 320 }, { width: 932, height: 430 }]) {
  for (const stage of ["bidding", "start", "trick", "result"] as const) test(`parity ${viewport.width} ${stage}`, async ({ page }) => {
    const errors: string[] = []; page.on("pageerror", (error) => errors.push(error.message));
    await page.setViewportSize(viewport);
    await page.goto(`/?screen=solo&parity=${stage}&top=0&left=47&right=47&bottom=21`);
    await expect(page.getByTestId("solo-card-table")).toBeVisible();
    if (stage === "bidding") await expect(page.getByTestId("solo-bidding")).toBeVisible();
    if (stage === "result") await expect(page.getByTestId("solo-round-result")).toBeVisible();
    await page.evaluate(async () => { await document.fonts.ready; await Promise.all(Array.from(document.images).map((image) => image.decode())); });
    mkdirSync(dir, { recursive: true });
    await page.screenshot({ path: `${dir}/native-${viewport.width}-${stage}.png` });
    const geometry = await page.evaluate(() => {
      const box = (selector: string) => { const node = document.querySelector(selector); if (!node) return null; const { x, y, width, height } = node.getBoundingClientRect(); return { x, y, width, height }; };
      return { table: box('[data-testid="solo-card-table"]'), bidding: box('[data-testid="solo-bidding"]'), hand: box('[data-testid="solo-hand"]'), cards: Array.from(document.querySelectorAll('[data-testid="solo-hand-card"] [role="button"]')).map((node) => { const { x, y, width, height } = node.getBoundingClientRect(); return { x, y, width, height }; }), players: [0, 1, 2, 3].map((p) => box(`[data-testid="solo-seat-${p}"]`)), trick: box('[data-testid="solo-trick-area"]'), overflow: { x: document.documentElement.scrollWidth - innerWidth, y: document.documentElement.scrollHeight - innerHeight } };
    });
    const fixtureDigest = createHash("sha256").update(JSON.stringify(fixtures[stage].state)).digest("hex");
    writeFileSync(`${dir}/native-${viewport.width}-${stage}.json`, JSON.stringify({ ...geometry, fixtureDigest }, null, 2));
    const reference = JSON.parse(readFileSync(`${dir}/web-${viewport.width}-${stage}.json`, "utf8")) as { table: typeof geometry.table; bidding: typeof geometry.bidding; trick: typeof geometry.trick; players: typeof geometry.players; cards: typeof geometry.cards; fixtureDigest: string };
    expect(fixtureDigest).toBe(reference.fixtureDigest);
    const compare = (actual: NonNullable<typeof geometry.table> | null, expected: NonNullable<typeof geometry.table> | null) => {
      expect(Boolean(actual)).toBe(Boolean(expected));
      if (actual && expected) for (const axis of ["x", "y", "width", "height"] as const) expect(Math.abs(actual[axis] - expected[axis]), `${stage}: ${axis}`).toBeLessThanOrEqual(1);
    };
    compare(geometry.table, reference.table); compare(geometry.bidding, reference.bidding); compare(geometry.trick, reference.trick);
    for (const [p, webIndex] of [[0, 3], [1, 2], [2, 0], [3, 1]]) compare(geometry.players[p], reference.players[webIndex]);
    expect(geometry.cards).toHaveLength(reference.cards.length);
    geometry.cards.forEach((card, i) => compare(card, reference.cards[i]));
    expect(geometry.table).toEqual({ x: 47, y: 0, width: viewport.width - 94, height: viewport.height - 21 });
    expect(geometry.overflow).toEqual({ x: 0, y: 0 });
    expect(errors).toEqual([]);
  });
}
