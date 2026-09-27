import type { AdvancedRulesBidTrace } from "@/bots/strategy/advancedRulesBidding";

/** Human-facing explanation. Numeric bot thresholds and raw trace keys stay private. */
export function explainBiddingTrace(trace: AdvancedRulesBidTrace): string {
  switch (trace.reasonCode) {
    case "weak-trump-foundation":
      return "La longueur seule ne suffit pas : sans Valet ni 9, cette couleur reste fragile.";
    case "weak-long-trump-show-80":
      return "Tu as au moins quatre atouts sans Valet ni 9. Les contrôles extérieurs permettent de montrer la couleur, mais 80 reste le plafond.";
    case "single-major-probe":
      return trace.communicationIntent === "probe-for-jack"
        ? "Tu as le 9 mais pas le Valet : 80 montre la couleur et recherche cette carte chez le partenaire."
        : "Tu as le Valet mais pas le 9 : 80 montre la couleur sans promettre une main autonome.";
    case "autonomous-opening":
      return "La fondation d’atout et les contrôles de la main permettent une ouverture autonome.";
    case "partner-fit":
      return "Ta main apporte une majeure manquante ou un soutien utile à la couleur du partenaire.";
    case "strong-partner-fit":
      return "Ton soutien est fort : la couleur annoncée par le partenaire gagne en contrôle.";
    case "rebid-after-support":
      return "Le soutien public du partenaire permet de poursuivre la conversation dans votre couleur.";
    case "competitive-overcall":
      return "Après l’annonce adverse, la doctrine utilise le plus petit palier légal que la main peut soutenir.";
    case "partner-suit-respected":
      return "Sans soutien suffisant ni alternative exceptionnelle, on ne quitte pas la couleur du partenaire.";
    case "partner-suit-override":
      return "Une autre couleur possède ici une fondation assez autonome pour remplacer exceptionnellement celle du partenaire.";
    case "coinche-strong-trump-control":
      return "Le contrat est déjà élevé : la maîtrise de l’atout et plusieurs contrôles défensifs justifient la Coinche.";
    case "coinche-obvious-overbid":
      return trace.overbidEvidence === "trump-lock"
        ? "Ta main possède une séquence maîtresse dans l’atout adverse : le contrat paraît excessif."
        : trace.overbidEvidence === "combined"
          ? "La séquence maîtresse d’atout et les contrôles extérieurs rendent le contrat adverse excessif."
          : "Plusieurs contrôles extérieurs indépendants rendent le contrat adverse très ambitieux.";
    case "coinche-special-control":
      return "Des contrôles défensifs suffisants justifient la Coinche sur ce contrat.";
    case "surcoinche-large-margin":
      return "La Surcoinche demande une marge exceptionnelle, au-delà d’une simplement bonne main.";
    case "capot-full-control":
      return "La main possède un contrôle personnel presque complet de la donne, sans trou décisif.";
    case "capot-partner-supported":
      return "La main contrôle presque toute la donne ; l’annonce publique du partenaire complète ce contrôle.";
    case "pass-ceiling-too-low":
      return "Le prochain palier dépasse ce que ta main peut annoncer selon la doctrine.";
    case "pass-contract-blocked":
      return "Ce contrat est déjà contré : aucune enchère ordinaire supplémentaire n’est légale ici.";
    default:
      return "Cette décision suit les conventions de l’application pour la main et les enchères visibles.";
  }
}
