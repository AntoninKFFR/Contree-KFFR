import { describe, expect, it } from "vitest";
import { buildCustomRuleset } from "@/engine/rulesets/custom";
import { createSoloGame, loadSoloRules, saveSoloRules, SOLO_RULES_STORAGE_KEY } from "@/app/solo/soloGameInitialization";

function memory(initial?: string) { let value = initial ?? null; return { getItem: () => value, setItem: (_key: string, next: string) => { value = next; }, value: () => value }; }

describe("solo rules persistence", () => {
  it("defaults to contree-kffr", () => expect(buildCustomRuleset(loadSoloRules(null)).id).toBe("contree-kffr"));
  it("loads a valid local preference", () => { const store = memory(JSON.stringify({ presetId: "contree-kffr", overrides: { game: { targetScore: 1500 } } })); expect(buildCustomRuleset(loadSoloRules(store)).game.targetScore).toBe(1500); });
  it("falls back when local JSON is corrupt", () => expect(buildCustomRuleset(loadSoloRules(memory("{"))).id).toBe("contree-kffr"));
  it("saves only the safe DTO", () => { const store = memory(); saveSoloRules(store, { presetId: "contree-kffr", overrides: { bidding: { allowNoTrump: true } } }); expect(store.value()).toContain("allowNoTrump"); expect(SOLO_RULES_STORAGE_KEY).toBe("coinche:solo-rules:v1"); });
  it("creates the initial game with injected randomness", () => expect(createSoloGame(() => 0).startingPlayerId).not.toBe(createSoloGame(() => 0.9).startingPlayerId));
  it("creates a game with the selected immutable snapshot", () => { const rules = buildCustomRuleset({ presetId: "contree-kffr", overrides: { game: { targetScore: 500 }, bidding: { allowAllTrump: true } } }); const state = createSoloGame(() => 0.1, rules); expect([state.settings.ruleset?.game.targetScore, state.settings.ruleset?.bidding.allowAllTrump]).toEqual([500, true]); });
  it("does not mutate an existing game when a later draft changes", () => { const state = createSoloGame(() => 0.1, buildCustomRuleset({ presetId: "contree-kffr" })); buildCustomRuleset({ presetId: "contree-kffr", overrides: { bidding: { allowNoTrump: true } } }); expect(state.settings.ruleset?.bidding.allowNoTrump).toBe(false); });
  it("rejects malicious local properties and falls back", () => { const store = memory(JSON.stringify({ presetId: "contree-kffr", secretEngineFlag: true })); expect(buildCustomRuleset(loadSoloRules(store)).id).toBe("contree-kffr"); });
});
