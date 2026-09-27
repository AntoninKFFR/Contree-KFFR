import { getCurrentContractFromBids } from "@/engine/bidding";
import { playerTeam } from "@/engine/rules";
import type { Bid, PlayerId, Suit, TeamId } from "@/engine/types";

export const BID_READING_DOCTRINE_ID = "advanced_rules_v4" as const;
export const BID_READING_DOCTRINE_REVISION = "4.1" as const;

/** Properties shared by every V4.1 route compatible with the public action. */
export type BidPromiseAssertion =
  | "shows-suit" | "has-jack" | "has-nine" | "has-at-least-one-major" | "has-both-majors"
  | "at-least-two-trumps" | "at-least-three-trumps" | "at-least-four-trumps"
  | "at-least-five-trumps" | "at-least-one-outside-ace" | "at-least-two-outside-aces"
  | "supports-partner-suit" | "strong-partner-fit"
  | "exceptional-suit-override" | "classical-defensive-control" | "defensive-control"
  | "exceptional-surcoinche-margin" | "capot-level-control";

export type BidMeaning =
  | "single-major-probe" | "weak-long-80" | "autonomous-opening"
  | "partner-major-support" | "strong-partner-support" | "rebid-after-support"
  | "competitive-overcall" | "partner-suit-override"
  | "classical-coinche" | "side-controls-coinche" | "trump-lock-coinche" | "combined-coinche"
  | "surcoinche" | "personal-capot" | "partner-supported-capot" | "pass-or-no-higher-bid";

/** No hand, trace, or full GameState is accepted by the inverse interpreter. */
export type PublicBidReadingContext = {
  startingPlayerId: PlayerId;
  totalScore: Record<TeamId, number>;
  bidsBefore: readonly Bid[];
  targetPlayerId: PlayerId;
  rulesetId: "contree-kffr";
  rulesetVersion: 1;
};

export type PublicObservedBid = Bid;

export type AdvancedRulesBidPromise = {
  doctrineId: typeof BID_READING_DOCTRINE_ID;
  doctrineRevision: typeof BID_READING_DOCTRINE_REVISION;
  observedAction: PublicObservedBid["action"];
  targetPlayerId: PlayerId;
  guaranteed: BidPromiseAssertion[];
  possibleMeanings: BidMeaning[];
  explanation: string[];
};

function bidSuit(bid: Bid): Suit | null {
  if (bid.action !== "bid" && bid.action !== "capot") return null;
  return bid.contractMode?.kind === "suit" ? bid.contractMode.suit : bid.trump ?? null;
}

function hasPartnerSignal(bids: readonly Bid[], playerId: PlayerId): boolean {
  return bids.some((bid) => bid.action === "bid" && bid.playerId !== playerId
    && playerTeam(bid.playerId) === playerTeam(playerId));
}

function openingGuarantees(value: number): BidPromiseAssertion[] {
  if (value === 110) return ["has-jack", "has-nine", "has-both-majors", "has-at-least-one-major",
    "at-least-two-trumps", "at-least-three-trumps", "at-least-four-trumps", "at-least-one-outside-ace"];
  // V4.1 caps a four-trump suit without J/9 at 80. Higher first messages
  // therefore contain at least one major, but do not identify which one.
  return value >= 90 && value <= 110 ? ["has-at-least-one-major"] : [];
}

/** Symbolic V4.1 inverse: it intersects compatible pathways rather than inspecting an example hand. */
export function interpretAdvancedRulesBid(
  context: PublicBidReadingContext,
  observedBid: PublicObservedBid,
): AdvancedRulesBidPromise {
  if (context.rulesetId !== "contree-kffr" || context.rulesetVersion !== 1) {
    throw new Error("Bid reading axis v1 requires contree-kffr ruleset version 1.");
  }
  if (context.targetPlayerId !== observedBid.playerId
    || (context.startingPlayerId + context.bidsBefore.length) % 4 !== observedBid.playerId) {
    throw new Error("Observed bid does not match the public speaking order.");
  }
  const before = context.bidsBefore;
  const current = getCurrentContractFromBids(before);
  const player = observedBid.playerId;
  const suit = bidSuit(observedBid);
  const referenceSuit = suit ?? (current?.contractMode?.kind === "suit" ? current.contractMode.suit : null);
  const priorOwn = before.filter((bid) => bid.playerId === player && bid.action === "bid");
  const priorPartner = before.filter((bid) => bid.playerId !== player && playerTeam(bid.playerId) === playerTeam(player)
    && bid.action === "bid");
  const partnerMessage = priorPartner.at(-1);
  const partnerSuit = partnerMessage ? bidSuit(partnerMessage) : null;
  const guaranteed = new Set<BidPromiseAssertion>();
  const possibleMeanings: BidMeaning[] = [];
  const explanation: string[] = [];

  // Earlier public messages from this player remain true after a rebid.
  let earlierContractAction = false;
  for (const prior of before) {
    if (prior.playerId === player && prior.action === "bid" && !earlierContractAction
      && referenceSuit !== null && bidSuit(prior) === referenceSuit) {
      for (const assertion of openingGuarantees(prior.value)) guaranteed.add(assertion);
    }
    if (prior.action !== "pass") earlierContractAction = true;
  }

  if (observedBid.action === "bid" && suit) {
    guaranteed.add("shows-suit");
    if (!current && priorOwn.length === 0 && priorPartner.length === 0) {
      for (const assertion of openingGuarantees(observedBid.value)) guaranteed.add(assertion);
      possibleMeanings.push(...(observedBid.value === 80
        ? ["single-major-probe", "weak-long-80", "autonomous-opening"] as BidMeaning[]
        : ["autonomous-opening"] as BidMeaning[]));
      explanation.push(observedBid.value === 80
        ? "Une ouverture à 80 peut venir de plusieurs structures : aucune carte majeure précise n’est révélée."
        : observedBid.value === 110
          ? "La première annonce à 110 exige Valet et 9, au moins quatre atouts et un As extérieur ; les deux chemins possibles n’ont pas la même longueur exacte."
          : "Cette ouverture dépasse le plafond de la longueur faible sans Valet ni 9, mais ne révèle pas laquelle des majeures est détenue.");
    } else if (partnerSuit && suit !== partnerSuit && priorOwn.length === 0) {
      for (const assertion of ["has-jack", "has-nine", "has-both-majors", "has-at-least-one-major",
        "at-least-two-trumps", "at-least-three-trumps", "at-least-one-outside-ace", "exceptional-suit-override"] as const) {
        guaranteed.add(assertion);
      }
      possibleMeanings.push("partner-suit-override");
      explanation.push("Changer la couleur du partenaire demande ici une autre couleur exceptionnellement autonome : Valet, 9, longueur et As extérieur.");
    } else if (partnerSuit === suit && current?.playerId === partnerMessage?.playerId && priorOwn.length === 0) {
      guaranteed.add("supports-partner-suit");
      if (partnerMessage?.action === "bid" && partnerMessage.value === 80 && observedBid.value === 90) {
        guaranteed.add("has-at-least-one-major");
        possibleMeanings.push("partner-major-support");
        explanation.push("Cette réponse apporte une majeure de la couleur du partenaire ; l’enchère à 80 ne révèle pas laquelle lui manque.");
      } else if (partnerMessage?.action === "bid" && observedBid.value >= partnerMessage.value + 20) {
        guaranteed.add("has-at-least-one-major");
        guaranteed.add("at-least-two-trumps");
        guaranteed.add("strong-partner-fit");
        possibleMeanings.push("strong-partner-support");
        explanation.push("Le soutien fort demande au moins une majeure et un fit utile, sans promettre nécessairement Valet et 9 ensemble.");
      }
    } else if (priorOwn.length > 0 && partnerSuit === suit && current?.teamId === playerTeam(player)) {
      guaranteed.add("has-at-least-one-major");
      possibleMeanings.push("rebid-after-support");
      explanation.push("Le rebid utilise le soutien public du partenaire. Le plafond V4.1 empêche une longueur sans Valet ni 9 de monter au-delà de 80.");
    } else {
      possibleMeanings.push("competitive-overcall");
      if (observedBid.value >= 90 && !hasPartnerSignal(before, player)) guaranteed.add("has-at-least-one-major");
      explanation.push("Le palier est légal et compétitif ; il ne livre pas à lui seul le détail de la main.");
    }
  } else if (observedBid.action === "coinche") {
    guaranteed.add("defensive-control");
    if (current?.kind === "points" && current.contractMode?.kind === "suit" && current.value < 140) {
      for (const assertion of ["has-jack", "has-nine", "has-both-majors", "has-at-least-one-major",
        "at-least-two-trumps", "classical-defensive-control"] as const) guaranteed.add(assertion);
      possibleMeanings.push("classical-coinche");
      explanation.push("À 120 ou 130, V4.1 n’active pas la voie du contrat manifestement excessif : cette Coinche couleur repose sur Valet et 9 et des contrôles défensifs.");
    } else {
      possibleMeanings.push("classical-coinche", "side-controls-coinche", "trump-lock-coinche", "combined-coinche");
      explanation.push("À 140 ou plus, plusieurs voies de défense sont possibles. La Coinche ne garantit pas à elle seule Valet et 9.");
    }
  } else if (observedBid.action === "surcoinche") {
    guaranteed.add("exceptional-surcoinche-margin");
    possibleMeanings.push("surcoinche");
    explanation.push("La doctrine exige une marge exceptionnelle, sans révéler des cartes précises.");
  } else if (observedBid.action === "capot") {
    guaranteed.add("capot-level-control");
    possibleMeanings.push("personal-capot");
    if (suit && before.some((bid) => bid.action === "bid" && bid.playerId !== player
      && playerTeam(bid.playerId) === playerTeam(player) && bid.value >= 110 && bidSuit(bid) === suit)) {
      possibleMeanings.push("partner-supported-capot");
    }
    explanation.push("Le Capot requiert un contrôle presque complet, personnel ou complété par un message public du partenaire.");
  } else {
    possibleMeanings.push("pass-or-no-higher-bid");
    explanation.push("Passer ne révèle aucune carte précise : plusieurs limites ou choix de conversation peuvent y conduire.");
  }

  return {
    doctrineId: BID_READING_DOCTRINE_ID, doctrineRevision: BID_READING_DOCTRINE_REVISION,
    observedAction: observedBid.action, targetPlayerId: player,
    guaranteed: [...guaranteed], possibleMeanings, explanation,
  };
}
