import { describe, expect, it } from "vitest";
import { OFFICIAL_BOT_PROFILE_ID } from "@/bots/profiles";
import { BOT_RATING_FALLBACK, resolveBotRating } from "@/lib/server/botRatings";
import {
  effectiveRatingDelta, eloDelta, expectedScore, kFactor, ratingRank, redistributeForfeit,
  reliabilityFactor, roundHalfAwayFromZero, teamStrength,
} from "@/lib/rating/formulaV1";

describe("Elo V1", () => {
  it("freezes K from the number of applied games before start", () => {
    expect([0, 9, 10, 29, 30, 100].map(kFactor)).toEqual([40, 40, 36, 36, 32, 32]);
    expect(() => kFactor(-1)).toThrow();
    expect(() => kFactor(1.5)).toThrow();
  });

  it("uses the five start compositions for reliability", () => {
    expect(reliabilityFactor(["human", "human", "human", "human"])).toBe(1);
    expect(reliabilityFactor(["human", "human", "human", "bot"])).toBe(0.95);
    expect(reliabilityFactor(["human", "human", "bot", "bot"])).toBe(0.85);
    expect(reliabilityFactor(["human", "bot", "human", "bot"])).toBe(0.6);
    expect(reliabilityFactor(["human", "bot", "bot", "bot"])).toBe(0.2);
    expect(() => reliabilityFactor(["bot", "bot", "bot", "bot"])).toThrow();
    expect(() => reliabilityFactor(["human"])).toThrow();
  });

  it("predicts from team strength before reliability", () => {
    expect(teamStrength(1000, 1000)).toBe(1000);
    expect(expectedScore(1000, 1000)).toBe(0.5);
    expect(teamStrength(1500, 1000)).toBe(1250);
    expect(teamStrength(1500, 1500)).toBe(1500);
    expect(expectedScore(1250, 1500)).toBeCloseTo(0.191682, 6);
    expect(expectedScore(1250, 1500) + expectedScore(1500, 1250)).toBeCloseTo(1, 12);
  });

  it.each([
    [1, 16], [0.95, 15], [0.85, 14], [0.6, 10], [0.2, 3],
  ] as const)("gives ±%s reliability at K32 in an even match", (reliability, magnitude) => {
    expect(eloDelta({ k: 32, reliability, result: 1, expected: 0.5 })).toBe(magnitude);
    expect(eloDelta({ k: 32, reliability, result: 0, expected: 0.5 })).toBe(-magnitude);
  });

  it("gives the documented outsider small loss and large win", () => {
    const expected = expectedScore(teamStrength(1500, 1000), teamStrength(1500, 1500));
    expect(eloDelta({ k: 32, reliability: 0.95, result: 0, expected })).toBe(-6);
    expect(eloDelta({ k: 32, reliability: 0.95, result: 1, expected })).toBe(25);
  });

  it("rounds halves away from zero and allows zero deltas", () => {
    expect([9.5, -9.5, 0.49, -0.49, 0.5, -0.5].map(roundHalfAwayFromZero))
      .toEqual([10, -10, 0, 0, 1, -1]);
    expect(eloDelta({ k: 32, reliability: 0.2, result: 1, expected: 0.99 })).toBe(0);
  });

  it("redistributes only a human partner's normal loss", () => {
    expect(redistributeForfeit(-16, { kind: "human", normalDelta: -16 }))
      .toEqual({ forfeiterDelta: -24, partnerDelta: -8 });
    expect(redistributeForfeit(-16, { kind: "bot" }))
      .toEqual({ forfeiterDelta: -16, partnerDelta: null });
    expect(redistributeForfeit(-1, { kind: "human", normalDelta: -1 }))
      .toEqual({ forfeiterDelta: -2, partnerDelta: 0 });
  });

  it("floors the applied rating at zero without changing the theoretical formula", () => {
    expect(effectiveRatingDelta(5, -16)).toBe(-5);
    expect(effectiveRatingDelta(0, -14)).toBe(0);
    expect(effectiveRatingDelta(1215, 12)).toBe(12);
    const forfeited = redistributeForfeit(-16, { kind: "human", normalDelta: -16 });
    expect(effectiveRatingDelta(5, forfeited.forfeiterDelta)).toBe(-5);
    expect(effectiveRatingDelta(5, forfeited.partnerDelta!)).toBe(-5);
  });
});

describe("rank thresholds", () => {
  it.each([
    [0, "Débutant V"], [849, "Débutant V"],
    [850, "Débutant IV"], [899, "Débutant IV"],
    [900, "Débutant III"], [949, "Débutant III"],
    [950, "Débutant II"], [999, "Débutant II"],
    [1000, "Débutant I"], [1049, "Débutant I"],
    [1050, "Pas mauvais V"], [1099, "Pas mauvais V"],
    [1100, "Pas mauvais IV"], [1149, "Pas mauvais IV"],
    [1150, "Pas mauvais III"], [1199, "Pas mauvais III"],
    [1200, "Pas mauvais II"], [1249, "Pas mauvais II"],
    [1250, "Pas mauvais I"], [1299, "Pas mauvais I"],
    [1300, "Sait jouer V"], [1349, "Sait jouer V"],
    [1350, "Sait jouer IV"], [1399, "Sait jouer IV"],
    [1400, "Sait jouer III"], [1449, "Sait jouer III"],
    [1450, "Sait jouer II"], [1499, "Sait jouer II"],
    [1500, "Sait jouer I"], [1549, "Sait jouer I"],
    [1550, "Capot de Capi V"], [1599, "Capot de Capi V"],
    [1600, "Capot de Capi IV"], [1649, "Capot de Capi IV"],
    [1650, "Capot de Capi III"], [1699, "Capot de Capi III"],
    [1700, "Capot de Capi II"], [1749, "Capot de Capi II"],
    [1750, "Capot de Capi I"], [2000, "Capot de Capi I"],
  ] as const)("maps %i Elo to %s", (rating, rank) => {
    expect(ratingRank(rating)).toBe(rank);
  });
});

describe("bot rating registry", () => {
  it("resolves the official V4 bot and versioned 1000 fallback", () => {
    expect(OFFICIAL_BOT_PROFILE_ID).toBe("advanced_rules_v4");
    expect(resolveBotRating()).toEqual({
      botProfileId: "advanced_rules_v4", botVersion: "advanced_rules_v4-calibration-v1", botRating: 1000,
    });
    expect(resolveBotRating("unrated_future_bot")).toEqual({
      botProfileId: "unrated_future_bot", botVersion: BOT_RATING_FALLBACK.version, botRating: 1000,
    });
  });
});
