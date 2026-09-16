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
  return <section aria-label="Résumé des règles" className={`coinche-rules-summary rounded-2xl border shadow-inner ${compact ? "p-3 text-xs" : "p-4 text-sm"}`}>
    <div className="flex flex-wrap items-center justify-between gap-2"><p className="font-black text-[color:var(--text-primary)]">{rulesetDisplayName(ruleset)}</p><span className="rounded-full border border-[color:var(--border-strong)] bg-[color:var(--accent-soft)] px-2.5 py-1 font-bold text-[color:var(--ui-kicker)]">{ruleset.game.targetScore} pts</span></div>
    <dl className="mt-3 grid gap-2 sm:grid-cols-2">
      {[["Contrats", contracts.join(" · ")], ["Annonces", announcements.join(" · ")], ["Jeu", play.length ? play.join(" · ") : "Règles souples"], ["Score", `${scoreLabel}${ruleset.scoring.roundToTen ? " · arrondi" : ""}`]].map(([label, content]) => <div className="rounded-xl border border-[color:var(--border)] bg-[color:var(--surface-muted)] px-2.5 py-2" key={label}><dt className="coinche-ui-kicker text-[9px] font-black uppercase tracking-[0.14em]">{label}</dt><dd className="mt-0.5 leading-relaxed text-[color:var(--text-secondary)]">{content}</dd></div>)}
    </dl>
    {differences.length ? <details className="mt-3 border-t border-[color:var(--border)] pt-2"><summary className="coinche-ui-kicker cursor-pointer rounded-lg py-1 font-bold">Différences avec Contrée KFFR ({differences.length})</summary><ul className="mt-1 grid gap-1 sm:grid-cols-2">{differences.map((difference) => <li className="rounded-lg bg-[color:var(--surface-muted)] px-2 py-1 text-[color:var(--text-secondary)]" key={`${difference.kind}-${difference.label}`}><span aria-hidden="true" className="coinche-ui-kicker">{difference.kind === "added" ? "+" : difference.kind === "removed" ? "−" : "↔"}</span> {difference.label}</li>)}</ul></details> : showDifferences ? <p className="mt-2 border-t border-[color:var(--border)] pt-2 text-[color:var(--text-muted)]">Règles standard Contrée KFFR</p> : null}
  </section>;
}
