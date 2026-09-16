import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BiddingPanel } from "@/components/BiddingPanel";
import { CardView } from "@/components/CardView";
import { RoundCompletionCard } from "@/components/RoundCompletionCard";
import { canCoinche, canSurcoinche } from "@/engine/bidding";
import { createInitialGame } from "@/engine/game";
import { buildCustomRuleset } from "@/engine/rulesets/custom";
import { scoreRound } from "@/engine/scoring";
import type { Contract, PlayerId } from "@/engine/types";

const noop = () => undefined;
const ownContract: Contract = { playerId: 0, teamId: 0, value: 90, trump: "hearts", status: "normal" };
beforeEach(() => vi.stubGlobal("React", React));
afterEach(() => vi.unstubAllGlobals());

function renderBidding(contract: Contract | null, playerId: PlayerId, generale = false) {
  const rules = buildCustomRuleset({ presetId: "contree-kffr", overrides: { bidding: { allowGenerale: generale } } });
  return renderToStaticMarkup(React.createElement(BiddingPanel, {
    canBid: true,
    canCoinche: canCoinche(playerId, contract, rules.bidding),
    canSurcoinche: canSurcoinche(playerId, contract, rules.bidding),
    currentContract: contract,
    biddingRules: rules.bidding,
    onBid: noop, onCapot: noop, onGenerale: noop, onCoinche: noop, onPass: noop, onSurcoinche: noop,
    playerId,
  }));
}

describe("gameplay polish", () => {
  it("keeps the raised card interactive without a selection ring", () => {
    const markup = renderToStaticMarkup(React.createElement(CardView, {
      card: { rank: "A", suit: "hearts" }, highlighted: true, onClick: noop,
    }));
    expect(markup).toContain('data-highlighted="true"');
    expect(markup).toContain('aria-label="Jouer A ♥"');
    expect(markup).not.toContain("emerald");
    expect(markup).not.toContain("ring-");
    expect(markup).not.toContain("disabled");
  });

  it("uses the champagne success accent in the round overlay", () => {
    const initial = createInitialGame(() => 0.1);
    const result = scoreRound({ contract: ownContract, settings: initial.settings, trickPointsByTeam: { 0: 120, 1: 42 } });
    const markup = renderToStaticMarkup(React.createElement(RoundCompletionCard, {
      actionLabel: "Manche suivante", onAction: noop,
      state: { ...initial, phase: "finished", result, contract: ownContract, roundScore: result.roundScore },
    }));
    expect(markup).toContain("Contrat réussi ✓");
    expect(markup).toContain("coinche-round-success-label");
    expect(markup).not.toContain("emerald");
  });

  it("places Passer immediately after Annoncer and adapts to Générale", () => {
    for (const generale of [false, true]) {
      const markup = renderBidding(null, 0, generale);
      expect(markup).toMatch(/Annoncer<\/button><button[^>]*>Passer<\/button>/);
      expect(markup).not.toContain(">Contrer</button>");
      expect(markup).not.toContain(">Surcontrer</button>");
      expect(markup.includes(">Générale</button>")).toBe(generale);
      expect(markup).toContain('aria-label="Valeur 80"');
    }
  });

  it.each([
    ["no contract", null, 1, false, false],
    ["own normal contract", ownContract, 0, false, false],
    ["opponent normal contract", ownContract, 1, true, false],
    ["own coinched contract", { ...ownContract, status: "coinched" as const }, 0, false, true],
    ["opponent coinched contract", { ...ownContract, status: "coinched" as const }, 1, false, false],
    ["surcoinched contract", { ...ownContract, status: "surcoinched" as const }, 0, false, false],
  ] as const)("shows only legal counter actions for %s", (_name, contract, playerId, coinche, surcoinche) => {
    const markup = renderBidding(contract, playerId);
    expect(markup.includes(">Contrer</button>")).toBe(coinche);
    expect(markup.includes(">Surcontrer</button>")).toBe(surcoinche);
  });
});
