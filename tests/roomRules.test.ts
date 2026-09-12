import { describe, expect, it } from "vitest";
import { buildCustomRuleset } from "@/engine/rulesets/custom";
import { buildRoomRulesFields, resolveRoomRules } from "@/engine/rulesets/room";

describe("stored room rules", () => {
  it("creates default rooms with contree-kffr", () => expect(buildRoomRulesFields(undefined)).toMatchObject({ ruleset_id: "contree-kffr", target_score: 1000 }));
  it("creates custom rooms with a server-built snapshot", () => { const fields = buildRoomRulesFields({ presetId: "contree-kffr", overrides: { bidding: { allowAllTrump: true } } }); expect(fields.ruleset_snapshot).toMatchObject({ id: "custom", bidding: { allowAllTrump: true } }); });
  it("rejects injected room properties", () => expect(() => buildRoomRulesFields({ presetId: "contree-kffr", version: -1 })).toThrow(/interdite/));
  it("normalizes a legacy room", () => expect(resolveRoomRules({ scoring_mode: "ffb", target_score: 1500 })).toMatchObject({ id: "contree-kffr", game: { targetScore: 1500 } }));
  it("uses a stored custom snapshot", () => { const snapshot = buildCustomRuleset({ presetId: "contree-kffr", overrides: { bidding: { allowNoTrump: true }, game: { targetScore: 500 } } }); expect(resolveRoomRules({ scoring_mode: "ffb", target_score: 1000, ruleset_snapshot: snapshot })).toEqual(snapshot); });
  it("ignores legacy columns when a snapshot exists", () => { const snapshot = buildCustomRuleset({ presetId: "contree-kffr", overrides: { scoring: { mode: "points-only" } } }); expect(resolveRoomRules({ scoring_mode: "ffb", target_score: 9999, ruleset_snapshot: snapshot }).scoring.mode).toBe("points-only"); });
});
