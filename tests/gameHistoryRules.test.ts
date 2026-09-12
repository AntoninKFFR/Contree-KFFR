import { describe, expect, it } from "vitest";
import { buildSavedGamePayload } from "@/lib/games";
import { createInitialGame } from "@/engine/game";
import { buildCustomRuleset } from "@/engine/rulesets/custom";

function completed(ruleset = buildCustomRuleset({ presetId: "contree-kffr" })) {
  return { ...createInitialGame(() => 0.1, { ruleset }), phase: "game-over" as const, winnerTeam: 0 as const };
}

describe("solo history rules", () => {
  it("saves the complete ruleset", () => expect(buildSavedGamePayload(completed(), "user")).toMatchObject({ ruleset_id: "contree-kffr", ruleset_version: 1, ruleset_snapshot: { game: { targetScore: 1000 } } }));
  it("identifies custom games", () => { const rules = buildCustomRuleset({ presetId: "contree-kffr", overrides: { bidding: { allowNoTrump: true } } }); expect(buildSavedGamePayload(completed(rules), "user")?.ruleset_id).toBe("custom"); });
  it("retains legacy scoring columns", () => expect(buildSavedGamePayload(completed(), "user")).toMatchObject({ scoring_mode: "ffb", target_score: 1000 }));
  it("does not save an unfinished game", () => expect(buildSavedGamePayload(createInitialGame(() => 0.1), "user")).toBeNull());
});
