import { describe, expect, it } from "vitest";
import { emptyBeloteState, playBeloteCard } from "@/engine/belote";
import { createInitialGame, playCard } from "@/engine/game";
import { createGameSettings } from "@/engine/rulesets/resolve";
import { scoreRound } from "@/engine/scoring";
import type { Contract, TeamId } from "@/engine/types";
import {
  createTestRuleset,
  rulesetContractCanLosePointsRace,
  rulesetNoBeloteForContract,
  rulesetNoRounding,
  rulesetWithAnnouncements,
} from "@/tests/helpers/rulesets";

const contract: Contract = {
  playerId: 0,
  teamId: 0,
  value: 80,
  trump: "hearts",
  status: "normal",
};

function result(
  rules = rulesetWithAnnouncements,
  input: {
    contract?: Contract;
    tricks?: Record<TeamId, number>;
    announcements?: Record<TeamId, number>;
    belote?: Record<TeamId, number>;
    won?: Record<TeamId, number>;
  } = {},
) {
  return scoreRound({
    contract: input.contract ?? contract,
    settings: createGameSettings({ ruleset: rules }),
    rules,
    trickPointsByTeam: input.tricks ?? { 0: 82, 1: 80 },
    announcementPointsByTeam: input.announcements,
    belotePointsByTeam: input.belote,
    tricksWonByTeam: input.won,
  });
}

describe("configurable contract qualification", () => {
  it("counts announcements for the bid only when announcementsCount is true", () => {
    const counts = createTestRuleset({
      announcements: { enabled: true, tierce: true },
      contractSuccess: { announcementsCount: true },
    });
    const doesNotCount = createTestRuleset({
      announcements: { enabled: true, tierce: true },
      contractSuccess: { announcementsCount: false },
    });
    const input = {
      contract: { ...contract, value: 90 as const },
      tricks: { 0: 88, 1: 74 } as Record<TeamId, number>,
      announcements: { 0: 20, 1: 0 } as Record<TeamId, number>,
    };
    expect(result(counts, input).contractSucceeded).toBe(true);
    expect(result(doesNotCount, input).contractSucceeded).toBe(false);
  });

  it("disables Belote entirely or awards its configured value", () => {
    const disabled = createTestRuleset({ belote: { enabled: false, points: 42 } });
    expect(result(disabled, { belote: { 0: 42, 1: 0 } }).belotePointsByTeam).toEqual({ 0: 0, 1: 0 });

    const hand = [{ rank: "K" as const, suit: "hearts" as const }, { rank: "Q" as const, suit: "hearts" as const }];
    const declared = playBeloteCard(emptyBeloteState(), hand, 0, hand[0], "hearts", 42);
    const completed = playBeloteCard(declared, [hand[1]], 0, hand[1], "hearts", 42);
    expect(completed.pointsByTeam).toEqual({ 0: 42, 1: 0 });
  });

  it("enforces Belote enablement and value through the GameState ruleset", () => {
    const disabledRules = createTestRuleset({ belote: { enabled: false, points: 42 } });
    const enabledRules = createTestRuleset({ belote: { enabled: true, points: 42 } });
    const king = { rank: "K" as const, suit: "hearts" as const };
    const base = {
      ...createInitialGame(() => 0.1, createGameSettings({ ruleset: disabledRules })),
      phase: "playing" as const,
      trump: "hearts" as const,
      currentPlayerId: 0 as const,
      contract,
      hands: { 0: [king], 1: [], 2: [], 3: [] },
      belote: {
        declaration: { playerId: 0 as const, teamId: 0 as const, firstRank: "Q" as const, completed: false },
        pointsByTeam: { 0: 0, 1: 0 },
      },
    };

    expect(playCard(base, 0, king).belote).toEqual(emptyBeloteState());
    expect(playCard({
      ...base,
      settings: createGameSettings({ ruleset: enabledRules }),
    }, 0, king).belote?.pointsByTeam).toEqual({ 0: 42, 1: 0 });
  });

  it("uses the taker's Belote for contract success only when configured", () => {
    const counts = createTestRuleset({ belote: { countsForContractSuccess: true } });
    const input = {
      contract: { ...contract, value: 90 as const },
      tricks: { 0: 70, 1: 72 } as Record<TeamId, number>,
      belote: { 0: 20, 1: 0 } as Record<TeamId, number>,
    };
    expect(result(counts, input).contractSucceeded).toBe(true);
    expect(result(rulesetNoBeloteForContract, input).contractSucceeded).toBe(false);
  });

  it("uses the defense's Belote in the points race only when configured", () => {
    const counts = createTestRuleset({ belote: { countsForContractFailure: true } });
    const ignores = createTestRuleset({ belote: { countsForContractFailure: false } });
    const input = {
      tricks: { 0: 90, 1: 82 } as Record<TeamId, number>,
      belote: { 0: 0, 1: 20 } as Record<TeamId, number>,
    };
    expect(result(counts, input).contractSucceeded).toBe(false);
    expect(result(ignores, input).contractSucceeded).toBe(true);
  });

  it("enforces mustReachBid independently", () => {
    const strict = createTestRuleset({ contractSuccess: { mustReachBid: true, mustBeatDefense: true } });
    const relaxed = createTestRuleset({ contractSuccess: { mustReachBid: false, mustBeatDefense: true } });
    const input = { tricks: { 0: 70, 1: 60 } as Record<TeamId, number> };
    expect(result(strict, input).contractSucceeded).toBe(false);
    expect(result(relaxed, input).contractSucceeded).toBe(true);
  });

  it("enforces mustBeatDefense independently", () => {
    const strict = createTestRuleset({ contractSuccess: { mustReachBid: true, mustBeatDefense: true } });
    const input = { tricks: { 0: 80, 1: 82 } as Record<TeamId, number> };
    expect(result(strict, input).contractSucceeded).toBe(false);
    expect(result(rulesetContractCanLosePointsRace, input).contractSucceeded).toBe(true);
  });
});

describe("configurable scoring formulas", () => {
  it("preserves canonical FFB scoring", () => {
    const rules = createTestRuleset({ announcements: { enabled: false } });
    expect(result(rules, { tricks: { 0: 92, 1: 70 } }).roundScore).toEqual({ 0: 170, 1: 70 });
  });

  it("scores contract-only success and failure", () => {
    const rules = createTestRuleset({ scoring: { mode: "contract-only", roundToTen: false } });
    expect(result(rules, { tricks: { 0: 92, 1: 70 } }).roundScore).toEqual({ 0: 80, 1: 0 });
    expect(result(rules, { tricks: { 0: 70, 1: 92 } }).roundScore).toEqual({ 0: 0, 1: 80 });
  });

  it("scores contract-only-160-failure with a fixed 160 failure award", () => {
    const rules = createTestRuleset({
      scoring: {
        mode: "contract-only-160-failure",
        roundToTen: false,
        failureBasePoints: 999,
        coincheMultiplier: 3,
        surcoincheMultiplier: 4,
      },
    });
    expect(result(rules, { tricks: { 0: 92, 1: 70 } }).roundScore).toEqual({ 0: 80, 1: 0 });
    expect(result(rules, { tricks: { 0: 70, 1: 92 } }).roundScore).toEqual({ 0: 0, 1: 160 });
    expect(result(rules, {
      contract: { ...contract, status: "coinched" }, tricks: { 0: 70, 1: 92 },
    }).roundScore).toEqual({ 0: 0, 1: 480 });
  });

  it("scores points-only with actual points while preserving legacy made-points behavior", () => {
    const rules = createTestRuleset({ scoring: { mode: "points-only", roundToTen: false } });
    expect(result(rules, { tricks: { 0: 92, 1: 70 } }).roundScore).toEqual({ 0: 172, 1: 70 });
    expect(result(rules, { tricks: { 0: 70, 1: 92 } }).roundScore).toEqual({ 0: 0, 1: 240 });
  });

  it("centralizes optional rounding to ten", () => {
    const rounded = createTestRuleset({ announcements: { enabled: false }, scoring: { roundToTen: true } });
    expect(result(rounded, { tricks: { 0: 92, 1: 70 } }).roundScore).toEqual({ 0: 170, 1: 70 });
    expect(result(rulesetNoRounding, { tricks: { 0: 92, 1: 70 } }).roundScore).toEqual({ 0: 172, 1: 70 });
  });

  it("uses custom Coinche and Surcoinche multipliers", () => {
    const rules = createTestRuleset({
      announcements: { enabled: false },
      scoring: { coincheMultiplier: 3, surcoincheMultiplier: 5 },
    });
    expect(result(rules, {
      contract: { ...contract, status: "coinched" }, tricks: { 0: 92, 1: 70 },
    }).roundScore).toEqual({ 0: 720, 1: 0 });
    expect(result(rules, {
      contract: { ...contract, status: "surcoinched" }, tricks: { 0: 92, 1: 70 },
    }).roundScore).toEqual({ 0: 1200, 1: 0 });
  });

  it("can multiply every score component on Coinche", () => {
    const allPoints = createTestRuleset({
      announcements: { enabled: false },
      scoring: { roundToTen: false, doubleAllPointsOnCoinche: true },
    });
    expect(result(allPoints, {
      contract: { ...contract, status: "coinched" }, tricks: { 0: 92, 1: 70 },
    }).roundScore).toEqual({ 0: 344, 1: 140 });
  });

  it("transfers or preserves announcements when the taker fails", () => {
    const lost = createTestRuleset({
      announcements: { enabled: true, tierce: true },
      scoring: { announcementsLostOnFailure: true },
    });
    const kept = createTestRuleset({
      announcements: { enabled: true, tierce: true },
      scoring: { announcementsLostOnFailure: false },
    });
    const input = {
      tricks: { 0: 70, 1: 92 } as Record<TeamId, number>,
      announcements: { 0: 20, 1: 0 } as Record<TeamId, number>,
    };
    expect(result(lost, input)).toMatchObject({
      announcementPointsByTeam: { 0: 0, 1: 20 }, roundScore: { 0: 0, 1: 260 },
    });
    expect(result(kept, input)).toMatchObject({
      announcementPointsByTeam: { 0: 20, 1: 0 }, roundScore: { 0: 20, 1: 240 },
    });
  });

  it("transfers losing announcements to the team that realizes a capot", () => {
    const rules = createTestRuleset({
      announcements: { enabled: true, tierce: true },
      scoring: { announcementsLostOnCapot: true },
    });
    expect(result(rules, {
      tricks: { 0: 252, 1: 0 },
      announcements: { 0: 0, 1: 20 },
      won: { 0: 8, 1: 0 },
    })).toMatchObject({
      capotTeam: 0,
      announcementPointsByTeam: { 0: 20, 1: 0 },
      roundScore: { 0: 350, 1: 0 },
    });

    const kept = createTestRuleset({
      announcements: { enabled: true, tierce: true },
      scoring: { announcementsLostOnCapot: false },
    });
    expect(result(kept, {
      tricks: { 0: 252, 1: 0 },
      announcements: { 0: 0, 1: 20 },
      won: { 0: 8, 1: 0 },
    })).toMatchObject({
      announcementPointsByTeam: { 0: 0, 1: 20 },
      roundScore: { 0: 330, 1: 20 },
    });
  });
});
