import { describe, expect, it } from "vitest";
import { buildCustomRuleset, mergeRulesetDraft, rulesetToCustomInput } from "@/engine/rulesets/custom";
import { CONTREE_KFFR_RULESET } from "@/engine/rulesets/presets";

describe("custom ruleset builder", () => {
  it("reproduces the contree-kffr preset exactly", () => expect(buildCustomRuleset({ presetId: "contree-kffr" })).toEqual(CONTREE_KFFR_RULESET));
  it("marks a modified snapshot as custom", () => expect(buildCustomRuleset({ presetId: "contree-kffr", overrides: { game: { targetScore: 1500 } } }).id).toBe("custom"));
  it("never mutates the base preset", () => { buildCustomRuleset({ presetId: "contree-kffr", overrides: { bidding: { allowNoTrump: true } } }); expect(CONTREE_KFFR_RULESET.bidding.allowNoTrump).toBe(false); });
  it("deep-freezes custom snapshots", () => { const value = buildCustomRuleset({ presetId: "contree-kffr", overrides: { game: { targetScore: 500 } } }); expect(Object.isFrozen(value) && Object.isFrozen(value.game) && Object.isFrozen(value.scoring)).toBe(true); });
  it("rejects arbitrary engine properties", () => expect(() => buildCustomRuleset({ presetId: "contree-kffr", overrides: { bidding: { allowGenerale: true } } })).toThrow(/interdite/));
  it("normalizes Coinche and Surcoinche", () => expect(buildCustomRuleset({ presetId: "contree-kffr", overrides: { bidding: { allowCoinche: false, allowSurcoinche: true } } }).bidding.allowSurcoinche).toBe(false));
  it("normalizes disabled announcements", () => { const value = buildCustomRuleset({ presetId: "contree-kffr", overrides: { announcements: { enabled: false, tierce: true }, contractSuccess: { announcementsCount: true } } }); expect([value.announcements.tierce, value.contractSuccess.announcementsCount]).toEqual([false, false]); });
  it("normalizes Belote and Tout Atout dependencies", () => expect(buildCustomRuleset({ presetId: "contree-kffr", overrides: { belote: { enabled: false, allowInAllTrump: true }, bidding: { allowAllTrump: true } } }).belote.allowInAllTrump).toBe(false));
  it("supports a custom target score", () => expect(buildCustomRuleset({ presetId: "contree-kffr", overrides: { game: { targetScore: 2000 } } }).game.targetScore).toBe(2000));
  it("supports a custom scoring mode", () => expect(buildCustomRuleset({ presetId: "contree-kffr", overrides: { scoring: { mode: "points-only" } } }).scoring.mode).toBe("points-only"));
  it("round-trips snapshots into safe input", () => { const snapshot = buildCustomRuleset({ presetId: "contree-kffr", overrides: { bidding: { allowNoTrump: true } } }); expect(buildCustomRuleset(rulesetToCustomInput(snapshot))).toEqual(snapshot); });
  it("merges a draft through the same normalization", () => expect(buildCustomRuleset(mergeRulesetDraft({ presetId: "contree-kffr" }, { game: { targetScore: 500 } })).game.targetScore).toBe(500));
  it("rejects an unknown scoring mode", () => expect(() => buildCustomRuleset({ presetId: "contree-kffr", overrides: { scoring: { mode: "mystery" } } })).toThrow(/unsupported/));
  it("rejects negative multipliers", () => expect(() => buildCustomRuleset({ presetId: "contree-kffr", overrides: { scoring: { coincheMultiplier: -2 } } })).toThrow(/positive/));
  it("bounds the target score", () => expect(() => buildCustomRuleset({ presetId: "contree-kffr", overrides: { game: { targetScore: 99 } } })).toThrow(/100/));
  it("changes only requested values", () => { const value = buildCustomRuleset({ presetId: "contree-kffr", overrides: { game: { targetScore: 500 } } }); expect(value.scoring).toEqual(CONTREE_KFFR_RULESET.scoring); });
  it("allows all-trump Belote only with both parent options", () => expect(buildCustomRuleset({ presetId: "contree-kffr", overrides: { bidding: { allowAllTrump: true }, belote: { allowInAllTrump: true } } }).belote.allowInAllTrump).toBe(true));
});
