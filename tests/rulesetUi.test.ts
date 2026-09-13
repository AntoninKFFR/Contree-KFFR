import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { RulesetConfigurator } from "@/components/rules/RulesetConfigurator";
import { RulesetSummary } from "@/components/rules/RulesetSummary";
import { BiddingPanel } from "@/components/BiddingPanel";
import { ScoreBoard } from "@/components/ScoreBoard";
import { inactivePlayerMessage } from "@/components/GameTable";
import { buildCustomRuleset, mergeRulesetDraft } from "@/engine/rulesets/custom";
import { createInitialGame } from "@/engine/game";
import { scoreRound } from "@/engine/scoring";
import { createTestRuleset } from "@/tests/helpers/rulesets";
import type { Contract } from "@/engine/types";

const noop = vi.fn();
describe("ruleset configuration UI", () => {
  it("shows business labels and offers Générale configuration", () => { const markup = renderToStaticMarkup(React.createElement(RulesetConfigurator, { value: { presetId: "contree-kffr" }, onChange: noop })); expect(markup).toContain("Obligation de fournir"); expect(markup).toContain("Réussite du contrat"); expect(markup).toContain("Générale"); });
  it("explains and disables dependent controls", () => { const markup = renderToStaticMarkup(React.createElement(RulesetConfigurator, { value: { presetId: "contree-kffr", overrides: { bidding: { allowCoinche: false } } }, onChange: noop })); expect(markup).toContain("Activez d&#x27;abord la Coinche"); expect(markup).toContain("disabled"); });
  it("summarizes custom rules", () => { const rules = buildCustomRuleset({ presetId: "contree-kffr", overrides: { game: { targetScore: 1500 }, bidding: { allowNoTrump: true, allowAllTrump: true } } }); const markup = renderToStaticMarkup(React.createElement(RulesetSummary, { ruleset: rules })); expect(markup).toContain("Variante personnalisée"); expect(markup).toContain("1500 points"); expect(markup).toContain("SA · TA"); });
  it("summarizes contree-kffr by name", () => expect(renderToStaticMarkup(React.createElement(RulesetSummary, { ruleset: buildCustomRuleset({ presetId: "contree-kffr" }) }))).toContain("Contrée KFFR"));
  it("offers SA and TA only when enabled", () => { const rules = buildCustomRuleset({ presetId: "contree-kffr", overrides: { bidding: { allowNoTrump: true, allowAllTrump: true } } }); const markup = renderToStaticMarkup(React.createElement(BiddingPanel, { canBid: true, currentContract: null, biddingRules: rules.bidding, onBid: noop, onCapot: noop, onGenerale: noop, onCoinche: noop, onPass: noop, onSurcoinche: noop, canCoinche: false, canSurcoinche: false })); expect(markup).toContain("Sans Atout"); expect(markup).toContain("Tout Atout"); });
  it("maps the Générale switch to allowGenerale", () => expect(buildCustomRuleset(mergeRulesetDraft({ presetId: "contree-kffr" }, { bidding: { allowGenerale: true } })).bidding.allowGenerale).toBe(true));
  it("shows Générale in the summary only when enabled", () => { const off = renderToStaticMarkup(React.createElement(RulesetSummary, { ruleset: buildCustomRuleset({ presetId: "contree-kffr" }) })); const on = renderToStaticMarkup(React.createElement(RulesetSummary, { ruleset: buildCustomRuleset({ presetId: "contree-kffr", overrides: { bidding: { allowGenerale: true } } }) })); expect(off).not.toContain("Générale"); expect(on).toContain("Générale"); });
  it("shows the Générale bid only when enabled", () => { const render = (allowGenerale: boolean) => renderToStaticMarkup(React.createElement(BiddingPanel, { canBid: true, currentContract: null, biddingRules: buildCustomRuleset({ presetId: "contree-kffr", overrides: { bidding: { allowGenerale } } }).bidding, onBid: noop, onCapot: noop, onGenerale: noop, onCoinche: noop, onPass: noop, onSurcoinche: noop, canCoinche: false, canSurcoinche: false })); expect(render(false)).not.toContain(">Générale<"); expect(render(true)).toContain(">Générale<"); });
  it.each([[8, "Contrat reussi"], [7, "Contrat chute"]] as const)("shows the final Générale result for %s personal tricks", (won, label) => { const rules = createTestRuleset({ bidding: { allowGenerale: true } }); const contract: Contract = { kind: "generale", value: 500, playerId: 0, teamId: 0, trump: "hearts", status: "normal" }; const result = scoreRound({ contract, settings: { scoringMode: "ffb", targetScore: 1000, ruleset: rules }, trickPointsByTeam: { 0: 100, 1: 62 }, tricksWonByTeam: { 0: won, 1: 8 - won }, tricksWonByPlayer: { 0: won, 1: 8 - won, 2: 0, 3: 0 } }); const state = { ...createInitialGame(() => 0, { ruleset: rules }), phase: "finished" as const, contract, result }; const markup = renderToStaticMarkup(React.createElement(ScoreBoard, { state, showActions: false })); expect(markup).toContain("Générale"); expect(markup).toContain(label); });
  it("identifies the inactive Générale partner on the table", () => { const rules = createTestRuleset({ bidding: { allowGenerale: true } }); const contract: Contract = { kind: "generale", value: 500, playerId: 0, teamId: 0, trump: "hearts", status: "normal" }; const state = { ...createInitialGame(() => 0, { ruleset: rules }), phase: "playing" as const, contract }; expect(inactivePlayerMessage(state)).toContain("ne joue pas cette donne"); });
});
