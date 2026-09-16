import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import RulesPage from "@/app/rules/page";
import { CONTREE_KFFR_RULESET } from "@/engine/rulesets/presets";
import { defaultRules, kffrSections, variantSections } from "@/lib/rules/rulesContent";

vi.stubGlobal("React", React);

describe("rules documentation", () => {
  const markup = renderToStaticMarkup(React.createElement(RulesPage));

  it("documents the single preset and customizable variants without invented presets", () => {
    expect(markup).toContain("Règles de la Contrée");
    expect(markup).toContain("Contrée KFFR");
    expect(markup).toContain("Variantes disponibles");
    expect(markup).toContain("Personnalisée");
    expect(markup).toContain("seul preset fixe");
    expect(markup).not.toMatch(/Version Sans Atout|Version Tout Atout|Version Générale/);
    expect(markup).not.toContain(">ffb<");
  });

  it("covers the default rules and editor-facing option families", () => {
    expect(kffrSections).toHaveLength(12);
    expect(variantSections).toHaveLength(7);
    for (const label of ["Enchères", "Coinche et Surcoinche", "Belote / Rebelote", "Sans Atout", "Tout Atout", "Générale", "Tierce", "Cinquante", "Cent", "Carrés", "Jeu", "Réussite du contrat", "Calcul du score", "Score cible"]) {
      expect(markup).toContain(label);
    }
    for (const score of ["82 – 80", "81 – 81", "80 – 82"]) expect(markup).toContain(score);
  });

  it("derives the visible defaults from the current preset", () => {
    expect(defaultRules.targetScore).toBe(CONTREE_KFFR_RULESET.game.targetScore);
    expect(defaultRules.bids[0]).toBe(CONTREE_KFFR_RULESET.bidding.minBid);
    expect(defaultRules.bids.at(-1)).toBe(CONTREE_KFFR_RULESET.bidding.maxBid);
    expect(defaultRules.bids).toEqual([80, 90, 100, 110, 120, 130, 140, 150, 160]);
    expect(defaultRules.coincheMultiplier).toBe(CONTREE_KFFR_RULESET.scoring.coincheMultiplier);
    expect(defaultRules.surcoincheMultiplier).toBe(CONTREE_KFFR_RULESET.scoring.surcoincheMultiplier);
    expect(markup).toContain("100 à 100 000");
  });
});
