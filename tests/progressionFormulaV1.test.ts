import { describe, expect, it } from "vitest";
import { getProgression } from "@/lib/progression/formulaV1";

describe("permanent XP formula V1", () => {
  it.each([[0, 1], [99, 1], [100, 2], [550, 5], [1800, 10], [6175, 20]])(
    "%i XP gives level %i", (xp, level) => {
      expect(getProgression(xp).level).toBe(level);
    },
  );

  it("projects the full initial state and a partially completed level", () => {
    expect(getProgression(0)).toEqual({ level: 1, totalXp: 0, levelStartXp: 0,
      xpIntoLevel: 0, xpForNextLevel: 100, xpRemaining: 100, progressPercent: 0 });
    expect(getProgression(700)).toEqual({ level: 5, totalXp: 700, levelStartXp: 550,
      xpIntoLevel: 150, xpForNextLevel: 200, xpRemaining: 50, progressPercent: 75 });
  });

  it.each([2, 5, 10, 20, 1000, 10_000_000, 26_843_542])(
    "is exact before, on and after the level %i threshold", (level) => {
      const k = BigInt(level - 1);
      const start = Number(BigInt(25) * k * (k + BigInt(7)) / BigInt(2));
      const previousCost = 100 + 25 * (level - 2);
      const nextCost = 100 + 25 * (level - 1);
      expect(getProgression(start - 1)).toEqual({ level: level - 1, totalXp: start - 1,
        levelStartXp: start - previousCost, xpIntoLevel: previousCost - 1,
        xpForNextLevel: previousCost, xpRemaining: 1,
        progressPercent: 100 * (previousCost - 1) / previousCost });
      expect(getProgression(start)).toEqual({ level, totalXp: start, levelStartXp: start,
        xpIntoLevel: 0, xpForNextLevel: nextCost, xpRemaining: nextCost, progressPercent: 0 });
      expect(getProgression(start + 1)).toMatchObject({ level, xpIntoLevel: 1,
        xpRemaining: nextCost - 1, progressPercent: 100 / nextCost });
    },
  );

  it("matches an independent iterative oracle for the first 500 levels", () => {
    let start = 0;
    for (let level = 1; level <= 500; level += 1) {
      const cost = 100 + 25 * (level - 1);
      for (const offset of [0, 1, Math.floor(cost / 2), cost - 1]) {
        const result = getProgression(start + offset);
        expect(result.level).toBe(level);
        expect(result.levelStartXp).toBe(start);
        expect(result.xpIntoLevel + result.xpRemaining).toBe(cost);
        expect(result.progressPercent).toBeGreaterThanOrEqual(0);
        expect(result.progressPercent).toBeLessThan(100);
      }
      start += cost;
    }
  });

  it.each([1_000_000_000, 1_000_000_000_000, Number.MAX_SAFE_INTEGER])(
    "keeps exact integer bounds at %i XP", (xp) => {
      const result = getProgression(xp);
      const k = BigInt(result.level - 1);
      const start = BigInt(25) * k * (k + BigInt(7)) / BigInt(2);
      const next = BigInt(25) * (k + BigInt(1)) * (k + BigInt(8)) / BigInt(2);
      expect(start <= BigInt(xp) && BigInt(xp) < next).toBe(true);
      expect(BigInt(result.levelStartXp)).toBe(start);
      expect(result.xpRemaining).toBe(Number(next - BigInt(xp)));
      expect(result.progressPercent).toBeGreaterThanOrEqual(0);
      expect(result.progressPercent).toBeLessThan(100);
    },
  );

  it.each([-1, 0.5, NaN, Infinity, -Infinity, Number.MAX_SAFE_INTEGER + 1])(
    "rejects invalid XP %s", (xp) => expect(() => getProgression(xp)).toThrow(RangeError),
  );
});
