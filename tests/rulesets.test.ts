import { describe, expect, it, vi } from "vitest";
import { getAvailableBidValues } from "@/engine/bidding";
import { createInitialGame, startNextRound } from "@/engine/game";
import { getLegalCards } from "@/engine/rules";
import { CONTREE_KFFR_RULESET, cloneRulesetSnapshot } from "@/engine/rulesets/presets";
import { createGameSettings, normalizeGameSettings, resolveGameRules } from "@/engine/rulesets/resolve";
import type { GameRulesetSnapshot } from "@/engine/rulesets/types";
import { validateRuleset } from "@/engine/rulesets/validation";
import { scoreRound } from "@/engine/scoring";
import type { Card, Trick } from "@/engine/types";
import { toPlayerGameView } from "@/engine/views";
import { parseServerGameState } from "@/lib/server/gameStateValidation";

vi.mock("server-only", () => ({}));

function customRuleset(overrides: Partial<GameRulesetSnapshot> = {}): GameRulesetSnapshot {
  return {
    ...cloneRulesetSnapshot(CONTREE_KFFR_RULESET),
    id: "custom",
    version: 7,
    ...overrides,
  };
}

describe("configurable game rulesets", () => {
  it("defines the current production behavior as contree-kffr", () => {
    expect(CONTREE_KFFR_RULESET).toMatchObject({
      id: "contree-kffr",
      version: 1,
      game: { targetScore: 1000 },
      bidding: {
        minBid: 80, maxBid: 160, bidStep: 10,
        allowCapot: true, allowCoinche: true, allowSurcoinche: true,
        allowNoTrump: false, allowAllTrump: false, allowGenerale: false,
      },
      announcements: { enabled: false, tierce: false, fifty: false, hundred: false, squares: false },
      belote: { enabled: true, points: 20, countsForContractSuccess: true, countsForContractFailure: true },
      contractSuccess: { mustReachBid: true, mustBeatDefense: true, announcementsCount: false },
      scoring: { mode: "ffb", roundToTen: true, coincheMultiplier: 2, surcoincheMultiplier: 4 },
    });
  });

  it("stores an immutable ruleset snapshot in every new game", () => {
    const state = createInitialGame(() => 0.1);

    expect(state.settings.ruleset).toEqual(CONTREE_KFFR_RULESET);
    expect(state.settings.ruleset).not.toBe(CONTREE_KFFR_RULESET);
    expect(Object.isFrozen(state.settings.ruleset)).toBe(true);
    expect(Object.isFrozen(state.settings.ruleset?.cardPlay)).toBe(true);
    expect(() => {
      (state.settings.ruleset!.game as { targetScore: number }).targetScore = 200;
    }).toThrow();
    expect(CONTREE_KFFR_RULESET.game.targetScore).toBe(1000);
  });

  it("snapshots custom input instead of retaining a mutable preset reference", () => {
    const input = customRuleset({ game: { targetScore: 750 } });
    const settings = createGameSettings({ ruleset: input });
    (input.game as { targetScore: number }).targetScore = 900;

    expect(settings.ruleset.game.targetScore).toBe(750);
    expect(settings.targetScore).toBe(750);
  });

  it("normalizes legacy settings while keeping historical scoring readable", () => {
    expect(normalizeGameSettings({ scoringMode: "ffb", targetScore: 1200 })).toMatchObject({
      scoringMode: "ffb", targetScore: 1200, ruleset: { id: "contree-kffr", game: { targetScore: 1200 } },
    });
    expect(normalizeGameSettings({ scoringMode: "made-points", targetScore: 600 })).toMatchObject({
      scoringMode: "made-points", ruleset: { id: "legacy-made-points", scoring: { mode: "points-only" } },
    });
    expect(normalizeGameSettings({ scoringMode: "announced-points" })).toMatchObject({
      scoringMode: "announced-points", targetScore: 500,
      ruleset: { id: "legacy-announced-points", scoring: { mode: "contract-only" } },
    });
  });

  it("normalizes a stored legacy GameState at the server boundary", () => {
    const legacy = JSON.parse(JSON.stringify(createInitialGame(() => 0.1))) as Record<string, unknown>;
    delete (legacy.settings as Record<string, unknown>).ruleset;

    const parsed = parseServerGameState(legacy);

    expect(parsed.settings.ruleset?.id).toBe("contree-kffr");
    expect(parsed.settings.ruleset?.game.targetScore).toBe(1000);
  });

  it("fills Phase 2 scoring defaults in a stored Phase 1 ruleset snapshot", () => {
    const phaseOne = JSON.parse(JSON.stringify(createInitialGame(() => 0.1))) as Record<string, unknown>;
    const scoring = ((phaseOne.settings as Record<string, unknown>).ruleset as Record<string, unknown>)
      .scoring as Record<string, unknown>;
    delete scoring.announcementsLostOnFailure;
    delete scoring.announcementsLostOnCapot;
    delete scoring.doubleAllPointsOnCoinche;

    expect(parseServerGameState(phaseOne).settings.ruleset?.scoring).toMatchObject({
      announcementsLostOnFailure: true,
      announcementsLostOnCapot: true,
      doubleAllPointsOnCoinche: false,
    });
  });

  it("rejects incoherent or not-yet-implemented rulesets before game creation", () => {
    const invalidRange = customRuleset({
      bidding: { ...CONTREE_KFFR_RULESET.bidding, minBid: 170, maxBid: 160 },
    });
    const invalidSurcoinche = customRuleset({
      bidding: { ...CONTREE_KFFR_RULESET.bidding, allowCoinche: false, allowSurcoinche: true },
    });
    const invalidBidStep = customRuleset({
      bidding: { ...CONTREE_KFFR_RULESET.bidding, bidStep: 0 },
    });
    const invalidTarget = customRuleset({ game: { targetScore: 0 } });
    const incoherentAnnouncementFlags = customRuleset({
      announcements: { ...CONTREE_KFFR_RULESET.announcements, tierce: true },
    });
    const announcementsCountWhileDisabled = customRuleset({
      contractSuccess: { ...CONTREE_KFFR_RULESET.contractSuccess, announcementsCount: true },
    });
    const prematureNoTrump = customRuleset({
      bidding: { ...CONTREE_KFFR_RULESET.bidding, allowNoTrump: true },
    });
    const invalidCoincheMultiplier = customRuleset({
      scoring: { ...CONTREE_KFFR_RULESET.scoring, coincheMultiplier: 0 },
    });
    const invalidSurcoincheMultiplier = customRuleset({
      scoring: { ...CONTREE_KFFR_RULESET.scoring, coincheMultiplier: 3, surcoincheMultiplier: 2 },
    });

    expect(() => validateRuleset(invalidRange)).toThrow("minBid");
    expect(() => createInitialGame(() => 0.1, { ruleset: invalidBidStep })).toThrow("bidStep");
    expect(() => createInitialGame(() => 0.1, { ruleset: invalidTarget })).toThrow("targetScore");
    expect(() => createInitialGame(() => 0.1, { ruleset: invalidSurcoinche })).toThrow("requires coinche");
    expect(() => createInitialGame(() => 0.1, { ruleset: incoherentAnnouncementFlags })).toThrow("disabled announcements");
    expect(() => createInitialGame(() => 0.1, { ruleset: announcementsCountWhileDisabled })).toThrow("disabled");
    expect(() => createInitialGame(() => 0.1, { ruleset: prematureNoTrump })).toThrow("not implemented");
    expect(() => createInitialGame(() => 0.1, { ruleset: invalidCoincheMultiplier })).toThrow("positive");
    expect(() => createInitialGame(() => 0.1, { ruleset: invalidSurcoincheMultiplier })).toThrow("lower");
  });

  it("keeps bidding, card legality and scoring parity through explicit rules", () => {
    const hand: Card[] = [{ rank: "A", suit: "hearts" }, { rank: "7", suit: "diamonds" }];
    const trick: Trick = {
      leaderId: 1,
      cards: [{ playerId: 1, card: { rank: "K", suit: "clubs" } }],
    };
    const scoringInput = {
      contract: { playerId: 0 as const, teamId: 0 as const, value: 90 as const, trump: "hearts" as const, status: "coinched" as const },
      settings: { scoringMode: "ffb" as const, targetScore: 1000 },
      trickPointsByTeam: { 0: 92, 1: 70 },
    };

    expect(getAvailableBidValues(null, CONTREE_KFFR_RULESET.bidding)).toEqual([80, 90, 100, 110, 120, 130, 140, 150, 160]);
    expect(getLegalCards(hand, trick, 0, "hearts", CONTREE_KFFR_RULESET.cardPlay)).toEqual([
      { rank: "A", suit: "hearts" },
    ]);
    expect(scoreRound({ ...scoringInput, rules: CONTREE_KFFR_RULESET })).toEqual(scoreRound(scoringInput));
  });

  it("preserves the snapshot and starting-player rotation between rounds", () => {
    const initial = createInitialGame(() => 0.1);
    const finished = { ...initial, phase: "finished" as const };
    const next = startNextRound(finished, () => 0.5);

    expect(next.settings.ruleset).toBe(initial.settings.ruleset);
    expect(next.startingPlayerId).toBe(1);
  });

  it("exposes the snapshot to bots and multiplayer views without leaking hands", () => {
    const state = createInitialGame(() => 0.1);
    const view = toPlayerGameView(state, 0);

    expect(resolveGameRules(state.settings).id).toBe("contree-kffr");
    expect(view.settings.ruleset).toEqual(state.settings.ruleset);
    expect(view.settings.ruleset).not.toBe(state.settings.ruleset);
    expect("hands" in view).toBe(false);
    expect(view.hand).toEqual(state.hands[0]);
  });
});
