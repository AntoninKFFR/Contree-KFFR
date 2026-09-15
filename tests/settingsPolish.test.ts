import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { bidConfirmationMessage, restoreBidConfirmationFocus, shouldConfirmBidAction } from "@/components/BiddingPanel";
import { RulesetConfigurator } from "@/components/rules/RulesetConfigurator";
import { RulesetSummary } from "@/components/rules/RulesetSummary";
import { PlayerPreferencesProvider } from "@/components/settings/PlayerPreferencesProvider";
import { formatPreferenceDuration, PlayerSettingsDialog, PlayerSettingsPanel } from "@/components/settings/PlayerSettingsPanel";
import { buildCustomRuleset } from "@/engine/rulesets/custom";
import { rulesetDifferences } from "@/engine/rulesets/rulesetDiff";
import { clonePlayerPreferences, normalizePlayerPreferences, withCustomTiming } from "@/lib/preferences/playerPreferences";

const noop = () => undefined;

describe("premium settings navigation", () => {
  it("exposes compact mobile and sidebar desktop navigation", () => {
    vi.stubGlobal("React", React);
    const markup = renderToStaticMarkup(React.createElement(PlayerPreferencesProvider, null, React.createElement(PlayerSettingsPanel)));
    expect(markup).toContain('aria-label="Sections des paramètres"');
    expect(markup).toContain("overflow-x-auto");
    expect(markup).toContain("md:grid-cols-[210px_minmax(0,1fr)]");
    expect(markup).toContain("Rechercher un paramètre");
    expect(markup).toContain("coinche-settings-panel");
    expect(markup).toContain("peer-checked:bg-emerald-700");
    expect(markup).toContain("overflow-y-auto");
    expect(markup).toContain("text-stone-900");
    expect(markup.match(/Réinitialiser mes paramètres/g)).toHaveLength(1);
  });

  it("shows precise timing sliders and human durations", () => {
    const markup = renderToStaticMarkup(React.createElement(PlayerPreferencesProvider, null, React.createElement(PlayerSettingsPanel)));
    expect(markup).toContain('aria-label="Temps de réflexion visuel des bots"');
    expect(markup).toContain('max="2000"');
    expect(markup).toContain('max="3000"');
    expect(markup).toContain('max="1500"');
    expect(formatPreferenceDuration(650)).toBe("650 ms");
    expect(formatPreferenceDuration(1200)).toBe("1,2 s");
  });

  it("uses a labelled, stable modal with a compact close action", () => {
    const markup = renderToStaticMarkup(React.createElement(PlayerPreferencesProvider, null, React.createElement(PlayerSettingsDialog, { onClose: noop })));
    expect(markup).toContain('role="dialog"');
    expect(markup).toContain('aria-modal="true"');
    expect(markup).not.toContain("Ces réglages ne changent que ton interface");
    expect(markup).not.toContain("Enregistré automatiquement");
    expect(markup).not.toContain("MES PARAMÈTRES");
    expect(markup).toContain('aria-label="Fermer les paramètres"');
    expect(markup).toContain("sm:h-[min(46rem,calc(100dvh-1.5rem))]");
    expect(markup).toContain("<svg");
    expect(markup).not.toContain("Les règles des parties ne seront pas modifiées");
  });
});

describe("custom presentation preferences", () => {
  it("marks any manually changed timing as custom and clamps each range", () => {
    const first = withCustomTiming(clonePlayerPreferences(), "botDelayMs", 2450);
    expect(first.gameplay).toMatchObject({ gameSpeed: "custom", botDelayMs: 2000 });
    const second = withCustomTiming(first, "biddingDelayMs", -4);
    expect(second.gameplay).toMatchObject({ gameSpeed: "custom", biddingDelayMs: 0 });
  });

  it("never preserves a preset label for mismatched stored delays", () => {
    const input = clonePlayerPreferences();
    input.gameplay.gameSpeed = "fast";
    input.gameplay.botDelayMs = 900;
    expect(normalizePlayerPreferences(input).gameplay.gameSpeed).toBe("custom");
  });

  it("migrates the former fake manual sort value to a real mode", () => {
    const input = clonePlayerPreferences() as unknown as { cards: { sortMode: string } };
    input.cards.sortMode = "manual";
    expect(normalizePlayerPreferences(input).cards.sortMode).toBe("suit-rank");
  });

  it("normalizes card style and table theme locally", () => {
    const input = clonePlayerPreferences();
    input.cards.cardStyle = "modern";
    input.visual.tableTheme = "midnight-blue";
    expect(normalizePlayerPreferences(input)).toMatchObject({ cards: { cardStyle: "modern" }, visual: { tableTheme: "midnight-blue" } });
  });
});

describe("clear bid confirmations", () => {
  const mode = { kind: "suit", suit: "hearts" } as const;
  const contract = { value: 110, playerId: 0, teamId: 0, trump: "hearts", contractMode: mode, status: "normal" } as const;
  it.each(["coinche", "surcoinche", "capot", "generale"] as const)("gates %s with its preference", (action) => {
    const preferences = clonePlayerPreferences();
    expect(shouldConfirmBidAction(action, preferences)).toBe(true);
    preferences.gameplay[action === "coinche" ? "confirmCoinche" : action === "surcoinche" ? "confirmSurcoinche" : action === "capot" ? "confirmCapot" : "confirmGenerale"] = false;
    expect(shouldConfirmBidAction(action, preferences)).toBe(false);
  });
  it("formats the exact contract in confirmation copy", () => {
    expect(bidConfirmationMessage("coinche", contract, mode)).toContain("110");
    expect(bidConfirmationMessage("coinche", contract, mode)).toContain("♥");
    expect(bidConfirmationMessage("generale", contract, mode)).toContain("Générale");
  });
  it("restores focus to the action that opened a dismissed confirmation", () => {
    const focus = vi.fn();
    restoreBidConfirmationFocus({ disabled: false, focus, isConnected: true });
    expect(focus).toHaveBeenCalledOnce();
    restoreBidConfirmationFocus({ disabled: true, focus, isConnected: true });
    expect(focus).toHaveBeenCalledOnce();
  });
});

describe("structured shared rules", () => {
  const custom = buildCustomRuleset({ presetId: "contree-kffr", overrides: { bidding: { allowNoTrump: true, allowAllTrump: true }, contractSuccess: { mustBeatDefense: false } } });
  it("centralizes a readable diff from Contrée KFFR", () => {
    expect(rulesetDifferences(custom)).toEqual(expect.arrayContaining([{ kind: "added", label: "Sans Atout" }, { kind: "added", label: "Tout Atout" }, { kind: "removed", label: "Battre la défense" }]));
  });
  it("renders the diff and reset without mentioning local preference mutation", () => {
    const summary = renderToStaticMarkup(React.createElement(RulesetSummary, { ruleset: custom, showDifferences: true }));
    const editor = renderToStaticMarkup(React.createElement(RulesetConfigurator, { value: { presetId: "contree-kffr", overrides: { bidding: { allowNoTrump: true } } }, onChange: noop }));
    expect(summary).toContain("Différences avec Contrée KFFR");
    expect(editor).toContain("Réinitialiser");
    expect(editor).toContain("Préférences perso inchangées");
  });
  it("renders dependency reasons rather than opacity alone", () => {
    const markup = renderToStaticMarkup(React.createElement(RulesetConfigurator, { value: { presetId: "contree-kffr", overrides: { bidding: { allowCoinche: false } } }, onChange: noop }));
    expect(markup).toContain("Activez d&#x27;abord la Coinche");
    expect(markup).toContain("disabled");
  });
});
