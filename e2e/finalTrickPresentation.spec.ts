import { test, expect } from "@playwright/test";
import { captureFinalTrick } from "../apps/mobile/tests/final-trick/capture";
import { installMobileNavigationFixture } from "./helpers/mobileNavigationFixture";
for (const width of [568, 844, 932]) for (const mode of ["solo", "multiplayer"] as const) for (const kind of ["round", "game"] as const) test(`web final ${mode} ${kind} ${width}: third, fourth, complete, collection, result`, async ({ page }) => {
  await installMobileNavigationFixture(page, { notifications: false });
  await captureFinalTrick(expect, page, false, mode, kind, width);
});
