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
  const scoreLabel = ruleset.scoring.mode === "ffb" ? "Officiel" : ruleset.scoring.mode === "points-only" ? "Points réalisés" : ruleset.scoring.mode === "contract-only-160-failure" ? "Contrat / chute 160" : "Contrat uniquement";
  return <section aria-label="Résumé des règles" className={`rounded-2xl border border-white/10 bg-[#08150f]/90 text-stone-100 shadow-inner ${compact ? "p-3 text-xs" : "p-4 text-sm"}`}>
    <div className="flex flex-wrap items-center justify-between gap-2"><p className="font-black text-[#f4ead0]">{rulesetDisplayName(ruleset)}</p><span className="rounded-full border border-[#ead8a6]/20 bg-[#ead8a6]/10 px-2.5 py-1 font-bold text-[#ead8a6]">{ruleset.game.targetScore} pts</span></div>
    <dl className="mt-3 grid gap-2 sm:grid-cols-2">
      {[["Contrats", contracts.join(" · ")], ["Annonces", announcements.join(" · ")], ["Jeu", play.length ? play.join(" · ") : "Règles souples"], ["Score", `${scoreLabel}${ruleset.scoring.roundToTen ? " · arrondi" : ""}`]].map(([label, content]) => <div className="rounded-xl border border-white/[0.07] bg-white/[0.04] px-2.5 py-2" key={label}><dt className="text-[9px] font-black uppercase tracking-[0.14em] text-emerald-300/55">{label}</dt><dd className="mt-0.5 leading-relaxed text-white/72">{content}</dd></div>)}
    </dl>
    {differences.length ? <details className="mt-3 border-t border-white/10 pt-2"><summary className="cursor-pointer rounded-lg py-1 font-bold text-[#ead8a6]">Différences avec Contrée KFFR ({differences.length})</summary><ul className="mt-1 grid gap-1 sm:grid-cols-2">{differences.map((difference) => <li className="rounded-lg bg-white/[0.06] px-2 py-1 text-white/70" key={`${difference.kind}-${difference.label}`}><span aria-hidden="true" className="text-emerald-300">{difference.kind === "added" ? "+" : difference.kind === "removed" ? "−" : "↔"}</span> {difference.label}</li>)}</ul></details> : showDifferences ? <p className="mt-2 border-t border-white/10 pt-2 text-white/42">Règles standard Contrée KFFR</p> : null}
  </section>;
}
