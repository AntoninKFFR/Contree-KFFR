import { CONTREE_KFFR_RULESET } from "./presets";
import type { GameRulesetSnapshot } from "./types";

type Difference = { kind: "added" | "removed" | "changed"; label: string };

export function rulesetDifferences(ruleset: GameRulesetSnapshot): Difference[] {
  const base = CONTREE_KFFR_RULESET;
  const entries: Array<[boolean, boolean, string]> = [
    [base.bidding.allowNoTrump, ruleset.bidding.allowNoTrump, "Sans Atout"],
    [base.bidding.allowAllTrump, ruleset.bidding.allowAllTrump, "Tout Atout"],
    [base.bidding.allowCapot, ruleset.bidding.allowCapot, "Capot"],
    [base.bidding.allowGenerale, ruleset.bidding.allowGenerale, "Générale"],
    [base.bidding.generaleAllowNoTrump, ruleset.bidding.generaleAllowNoTrump, "Générale Sans Atout"],
    [base.bidding.generaleAllowAllTrump, ruleset.bidding.generaleAllowAllTrump, "Générale Tout Atout"],
    [base.bidding.allowCoinche, ruleset.bidding.allowCoinche, "Coinche"],
    [base.bidding.allowSurcoinche, ruleset.bidding.allowSurcoinche, "Surcoinche"],
    [base.announcements.enabled, ruleset.announcements.enabled, "Annonces"],
    [base.announcements.tierce, ruleset.announcements.tierce, "Tierce"],
    [base.announcements.fifty, ruleset.announcements.fifty, "Cinquante"],
    [base.announcements.hundred, ruleset.announcements.hundred, "Cent"],
    [base.announcements.squares, ruleset.announcements.squares, "Carrés"],
    [base.belote.enabled, ruleset.belote.enabled, "Belote / Rebelote"],
    [base.belote.countsForContractSuccess, ruleset.belote.countsForContractSuccess, "Belote dans la réussite"],
    [base.belote.countsForContractFailure, ruleset.belote.countsForContractFailure, "Belote dans la chute"],
    [base.belote.allowInAllTrump, ruleset.belote.allowInAllTrump, "Belote en Tout Atout"],
    [base.cardPlay.mustFollowSuit, ruleset.cardPlay.mustFollowSuit, "Obligation de fournir"],
    [base.cardPlay.mustTrumpWhenVoid, ruleset.cardPlay.mustTrumpWhenVoid, "Coupe obligatoire"],
    [base.cardPlay.mustOvertrump, ruleset.cardPlay.mustOvertrump, "Surcoupe obligatoire"],
    [base.cardPlay.mustRaiseAtTrump, ruleset.cardPlay.mustRaiseAtTrump, "Montée à l'atout"],
    [base.cardPlay.allowDiscardWhenPartnerWinning, ruleset.cardPlay.allowDiscardWhenPartnerWinning, "Défausse derrière le partenaire maître"],
    [base.cardPlay.allowDiscardWhenCannotOvertrump, ruleset.cardPlay.allowDiscardWhenCannotOvertrump, "Défausse sans surcoupe possible"],
    [base.contractSuccess.mustReachBid, ruleset.contractSuccess.mustReachBid, "Atteindre le contrat"],
    [base.contractSuccess.mustBeatDefense, ruleset.contractSuccess.mustBeatDefense, "Battre la défense"],
    [base.contractSuccess.announcementsCount, ruleset.contractSuccess.announcementsCount, "Annonces dans la réussite"],
    [base.scoring.roundToTen, ruleset.scoring.roundToTen, "Arrondi à la dizaine"],
    [base.scoring.doubleAllPointsOnCoinche, ruleset.scoring.doubleAllPointsOnCoinche, "Tous les points doublés sur Coinche"],
    [base.scoring.announcementsLostOnFailure, ruleset.scoring.announcementsLostOnFailure, "Transfert des annonces en cas de chute"],
    [base.scoring.announcementsLostOnCapot, ruleset.scoring.announcementsLostOnCapot, "Transfert des annonces sur Capot"],
  ];
  const differences = entries.flatMap(([before, after, label]): Difference[] => before === after ? [] : [{ kind: after ? "added" : "removed", label }]);
  if (ruleset.game.targetScore !== base.game.targetScore) differences.unshift({ kind: "changed", label: `Score cible : ${ruleset.game.targetScore}` });
  if (ruleset.scoring.mode !== base.scoring.mode) differences.push({ kind: "changed", label: `Score : ${ruleset.scoring.mode}` });
  if (ruleset.belote.points !== base.belote.points) differences.push({ kind: "changed", label: `Belote : ${ruleset.belote.points} points` });
  if (ruleset.scoring.generaleBasePoints !== base.scoring.generaleBasePoints) differences.push({ kind: "changed", label: `Générale : ${ruleset.scoring.generaleBasePoints} points` });
  if (ruleset.scoring.coincheMultiplier !== base.scoring.coincheMultiplier) differences.push({ kind: "changed", label: `Multiplicateur Coinche : ×${ruleset.scoring.coincheMultiplier}` });
  if (ruleset.scoring.surcoincheMultiplier !== base.scoring.surcoincheMultiplier) differences.push({ kind: "changed", label: `Multiplicateur Surcoinche : ×${ruleset.scoring.surcoincheMultiplier}` });
  return differences;
}
