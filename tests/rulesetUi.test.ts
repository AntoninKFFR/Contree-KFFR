import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { RulesetConfigurator } from "@/components/rules/RulesetConfigurator";
import { RulesetSummary } from "@/components/rules/RulesetSummary";
import { BiddingPanel } from "@/components/BiddingPanel";
import { buildCustomRuleset } from "@/engine/rulesets/custom";

const noop = vi.fn();
describe("ruleset configuration UI", () => {
  it("shows business labels without exposing Générale", () => { const markup = renderToStaticMarkup(React.createElement(RulesetConfigurator, { value: { presetId: "contree-kffr" }, onChange: noop })); expect(markup).toContain("Obligation de fournir"); expect(markup).toContain("Réussite du contrat"); expect(markup).not.toContain("Générale"); });
  it("explains and disables dependent controls", () => { const markup = renderToStaticMarkup(React.createElement(RulesetConfigurator, { value: { presetId: "contree-kffr", overrides: { bidding: { allowCoinche: false } } }, onChange: noop })); expect(markup).toContain("Activez d&#x27;abord la Coinche"); expect(markup).toContain("disabled"); });
  it("summarizes custom rules", () => { const rules = buildCustomRuleset({ presetId: "contree-kffr", overrides: { game: { targetScore: 1500 }, bidding: { allowNoTrump: true, allowAllTrump: true } } }); const markup = renderToStaticMarkup(React.createElement(RulesetSummary, { ruleset: rules })); expect(markup).toContain("Variante personnalisée"); expect(markup).toContain("1500 points"); expect(markup).toContain("SA · TA"); });
  it("summarizes contree-kffr by name", () => expect(renderToStaticMarkup(React.createElement(RulesetSummary, { ruleset: buildCustomRuleset({ presetId: "contree-kffr" }) }))).toContain("Contrée KFFR"));
  it("offers SA and TA only when enabled", () => { const rules = buildCustomRuleset({ presetId: "contree-kffr", overrides: { bidding: { allowNoTrump: true, allowAllTrump: true } } }); const markup = renderToStaticMarkup(React.createElement(BiddingPanel, { canBid: true, currentContract: null, biddingRules: rules.bidding, onBid: noop, onCapot: noop, onCoinche: noop, onPass: noop, onSurcoinche: noop, canCoinche: false, canSurcoinche: false })); expect(markup).toContain("Sans Atout"); expect(markup).toContain("Tout Atout"); });
});
