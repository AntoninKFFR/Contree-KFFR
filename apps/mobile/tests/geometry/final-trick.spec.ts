import { test, expect } from "@playwright/test";
import { captureFinalTrick } from "../final-trick/capture";
test.use({ hasTouch: true });
for (const width of [568, 844, 932]) for (const mode of ["solo", "multiplayer"] as const) for (const kind of ["round", "game"] as const) test(`native final ${mode} ${kind} ${width}: third, fourth, complete, collection, result`, async ({ page }) => {
  await captureFinalTrick(expect, page, true, mode, kind, width);
});
