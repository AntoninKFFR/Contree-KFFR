import { describe, expect, it } from "vitest";
import { getRatingProgress, ratingRank } from "@/lib/rating/formulaV1";

describe("Elo rank progress", () => {
  it.each([
    [849, "Débutant V", 850],
    [850, "Débutant IV", 900],
    [899, "Débutant IV", 900],
    [900, "Débutant III", 950],
    [999, "Débutant II", 1000],
    [1000, "Débutant I", 1050],
    [1049, "Débutant I", 1050],
    [1050, "Pas mauvais V", 1100],
    [1400, "Sait jouer III", 1450],
    [1412, "Sait jouer III", 1450],
    [1449, "Sait jouer III", 1450],
    [1450, "Sait jouer II", 1500],
    [1749, "Capot de Capi II", 1750],
    [1750, "Capot de Capi I", null],
    [2000, "Capot de Capi I", null],
  ] as const)("uses the official rank at %i Elo", (rating, rank, nextThreshold) => {
    const progress = getRatingProgress(rating);
    expect(progress.currentRank).toBe(rank);
    expect(progress.currentRank).toBe(ratingRank(rating));
    expect(progress.nextThreshold).toBe(nextThreshold);
  });

  it("shows 12 of 50 points toward Sait jouer II at 1412", () => {
    expect(getRatingProgress(1412)).toEqual({
      currentRank: "Sait jouer III", currentThreshold: 1400,
      nextRank: "Sait jouer II", nextThreshold: 1450,
      pointsIntoRank: 12, pointsToNextRank: 50, pointsRemaining: 38, progress: 0.24,
    });
  });

  it("uses 850 as the next real threshold below Débutant IV", () => {
    expect(getRatingProgress(849)).toMatchObject({
      currentRank: "Débutant V", currentThreshold: null,
      nextRank: "Débutant IV", nextThreshold: 850,
      pointsIntoRank: null, pointsToNextRank: null, pointsRemaining: 1, progress: null,
    });
  });

  it("has no invented rank above Capot de Capi I", () => {
    for (const rating of [1750, 2000]) {
      expect(getRatingProgress(rating)).toMatchObject({
        currentRank: "Capot de Capi I", nextRank: null,
        nextThreshold: null, progress: null,
      });
    }
  });

  it("rejects invalid rating input", () => {
    expect(() => getRatingProgress(-1)).toThrow(RangeError);
    expect(() => getRatingProgress(1.5)).toThrow(RangeError);
  });
});
