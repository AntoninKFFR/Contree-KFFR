import React from "react";
import { rulesetDifferences } from "@/engine/rulesets/rulesetDiff";
import type { GameRulesetSnapshot } from "@/engine/rulesets/types";

export function rulesetDisplayName(ruleset: GameRulesetSnapshot): string {
  return ruleset.id === "contree-kffr" ? "Contrée KFFR" : "Variante personnalisée";
}

export function RulesetSummary({ ruleset, compact = false, showDifferences = false }: { ruleset: GameRulesetSnapshot; compact?: boolean; showDifferences?: boolean }) {
  const contracts = ["Couleurs", ruleset.bidding.allowNoTrump && "SA", ruleset.bidding.allowAllTrump && "TA", ruleset.bidding.allowCapot && "Capot", ruleset.bidding.allowGenerale && "Générale", ruleset.bidding.allowCoinche && "Coinche", ruleset.bidding.allowSurcoinche && "Surcoinche"].filter(Boolean);
  const announcements = ruleset.announcements.enabled ? [ruleset.announcements.tierce && "Tierce", ruleset.announcements.fifty && "50", ruleset.announcements.hundred && "100", ruleset.announcements.squares && "Carrés"].filter(Boolean) : ["Sans annonces"];
  const play = [ruleset.cardPlay.mustFollowSuit && "Fournir", ruleset.cardPlay.mustTrumpWhenVoid && "Coupe obligatoire", ruleset.cardPlay.mustOvertrump && "Surcoupe obligatoire"].filter(Boolean);
  const differences = showDifferences ? rulesetDifferences(ruleset) : [];
  const scoreLabel = ruleset.scoring.mode === "ffb" ? "FFB" : ruleset.scoring.mode === "points-only" ? "Points réalisés" : ruleset.scoring.mode === "contract-only-160-failure" ? "Contrat / chute 160" : "Contrat uniquement";
  return <section aria-label="Résumé des règles" className={`rounded-xl border border-stone-200 bg-stone-50 ${compact ? "p-3 text-xs" : "p-4 text-sm"}`}>
    <div className="flex flex-wrap items-baseline justify-between gap-2"><p className="font-bold text-stone-950">{rulesetDisplayName(ruleset)}</p><span className="rounded-full bg-white px-2 py-0.5 font-semibold text-stone-700">{ruleset.game.targetScore} points</span></div>
    <dl className="mt-2 grid gap-x-4 gap-y-1 sm:grid-cols-[90px_1fr]"><dt className="font-bold">Contrats</dt><dd>{contracts.join(" · ")}</dd><dt className="font-bold">Annonces</dt><dd>{announcements.join(" · ")}</dd><dt className="font-bold">Carte</dt><dd>{play.length ? play.join(" · ") : "Règles souples"}</dd><dt className="font-bold">Score</dt><dd>{scoreLabel}{ruleset.scoring.roundToTen ? " · arrondi dizaine" : ""}</dd></dl>
    {differences.length ? <details className="mt-3 border-t border-stone-200 pt-2"><summary className="cursor-pointer font-bold">Différences avec Contrée KFFR ({differences.length})</summary><ul className="mt-1 grid gap-1 sm:grid-cols-2">{differences.map((difference) => <li className="rounded bg-white px-2 py-1" key={`${difference.kind}-${difference.label}`}><span aria-hidden="true">{difference.kind === "added" ? "+" : difference.kind === "removed" ? "−" : "↔"}</span> {difference.label}</li>)}</ul></details> : showDifferences ? <p className="mt-2 border-t pt-2 text-stone-600">Aucune différence avec Contrée KFFR.</p> : null}
  </section>;
}
