import React from "react";
import type { GameRulesetSnapshot } from "@/engine/rulesets/types";

export function rulesetDisplayName(ruleset: GameRulesetSnapshot): string {
  return ruleset.id === "contree-kffr" ? "Contrée KFFR" : "Variante personnalisée";
}

export function RulesetSummary({ ruleset, compact = false }: { ruleset: GameRulesetSnapshot; compact?: boolean }) {
  const contracts = ["Couleurs", ruleset.bidding.allowNoTrump && "SA", ruleset.bidding.allowAllTrump && "TA", ruleset.bidding.allowCapot && "Capot", ruleset.bidding.allowCoinche && "Coinche", ruleset.bidding.allowSurcoinche && "Surcoinche"].filter(Boolean);
  const announcements = ruleset.announcements.enabled
    ? [ruleset.announcements.tierce && "Tierce", ruleset.announcements.fifty && "Cinquante", ruleset.announcements.hundred && "Cent", ruleset.announcements.squares && "Carrés"].filter(Boolean)
    : ["Sans annonces"];
  const play = [ruleset.cardPlay.mustTrumpWhenVoid && "Coupe obligatoire", ruleset.cardPlay.mustOvertrump && "Surcoupe obligatoire"].filter(Boolean);
  return <section className={`rounded-lg border border-stone-200 bg-stone-50 ${compact ? "p-3 text-xs" : "p-4 text-sm"}`}>
    <p className="font-bold text-stone-900">{rulesetDisplayName(ruleset)}</p>
    <p className="text-stone-600">{ruleset.game.targetScore} points</p>
    <p><strong>Contrats :</strong> {contracts.join(" · ")}</p>
    <p><strong>Annonces :</strong> {announcements.join(" · ")}</p>
    {play.length ? <p><strong>Jeu :</strong> {play.join(" · ")}</p> : null}
    <p><strong>Score :</strong> {ruleset.scoring.mode === "ffb" ? "FFB" : ruleset.scoring.mode === "points-only" ? "Points réalisés" : "Contrat uniquement"}{ruleset.scoring.roundToTen ? " · arrondi dizaine" : ""}</p>
  </section>;
}
