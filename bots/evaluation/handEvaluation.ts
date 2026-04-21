import { SUITS } from "@/engine/cards";
import { cardPoints } from "@/engine/rules";
import type { Card, Suit } from "@/engine/types";

export type HandEvaluation = {
  trump: Suit;
  totalPoints: number;
  trumpCount: number;
  strongTrumpCount: number;
  hasJackTrump: boolean;
  hasNineTrump: boolean;
  trumpSupportCount: number;
  aceCount: number;
  tenCount: number;
  sideMasterTrickCount: number;
  strongSecondarySuitCount: number;
  shortSuitCount: number;
  voidSuitCount: number;
  offensivePotential: number;
  safety: number;
  cutPotential: number;
  structuralBonus: number;
  capotPotential: number;
  score: number;
};

const STRONG_TRUMP_RANKS = new Set<Card["rank"]>(["J", "9", "A"]);

function groupBySuit(hand: Card[]): Record<Suit, Card[]> {
  return {
    clubs: hand.filter((card) => card.suit === "clubs"),
    diamonds: hand.filter((card) => card.suit === "diamonds"),
    hearts: hand.filter((card) => card.suit === "hearts"),
    spades: hand.filter((card) => card.suit === "spades"),
  };
}

function sideSuitMasterTricks(cards: Card[]): number {
  const hasAce = cards.some((card) => card.rank === "A");
  const hasTen = cards.some((card) => card.rank === "10");

  if (hasAce && hasTen) return 2;
  if (hasAce) return 1;
  return 0;
}

function isStrongSecondarySuit(cards: Card[]): boolean {
  if (cards.length < 3) return false;

  const honorCount = cards.filter((card) => card.rank === "A" || card.rank === "10" || card.rank === "K").length;
  return honorCount >= 2 || cards.some((card) => card.rank === "A");
}

export function evaluateHandForTrump(hand: Card[], trump: Suit): HandEvaluation {
  const suits = groupBySuit(hand);
  const trumpCards = suits[trump];
  const nonTrumpCards = hand.filter((card) => card.suit !== trump);
  const hasJackTrump = trumpCards.some((card) => card.rank === "J");
  const hasNineTrump = trumpCards.some((card) => card.rank === "9");
  const totalPoints = hand.reduce((total, card) => total + cardPoints(card, trump), 0);
  const strongTrumpCount = trumpCards.filter((card) => STRONG_TRUMP_RANKS.has(card.rank)).length;
  const trumpSupportCount =
    trumpCards.length - (hasJackTrump ? 1 : 0) - (hasNineTrump ? 1 : 0);
  const aceCount = nonTrumpCards.filter((card) => card.rank === "A").length;
  const tenCount = nonTrumpCards.filter((card) => card.rank === "10").length;
  const sideMasterTrickCount = SUITS.filter((suit) => suit !== trump).reduce(
    (total, suit) => total + sideSuitMasterTricks(suits[suit]),
    0,
  );
  const strongSecondarySuitCount = SUITS.filter(
    (suit) => suit !== trump && isStrongSecondarySuit(suits[suit]),
  ).length;
  const shortSuitCount = SUITS.filter((suit) => suit !== trump && suits[suit].length === 1).length;
  const voidSuitCount = SUITS.filter((suit) => suit !== trump && suits[suit].length === 0).length;

  // Potentiel offensif: capacite a faire des plis et a prendre la main.
  const offensivePotential =
    trumpCards.length * 6 +
    strongTrumpCount * 13 +
    aceCount * 7 +
    tenCount * 3 +
    sideMasterTrickCount * 5;

  // Securite: cartes qui rendent le contrat moins fragile.
  const safety =
    strongTrumpCount * 9 +
    Math.max(0, trumpCards.length - 2) * 4 +
    aceCount * 5 +
    trumpSupportCount * 2;

  // Possibilite de coupe: une couleur courte ou vide aide souvent apres le debut de manche.
  const cutPotential = shortSuitCount * 4 + voidSuitCount * 8;

  let structuralBonus = 0;

  // Convention simple:
  // 80 = petit jeu avec J ou 9, sans l'autre, et du soutien a l'atout.
  if ((hasJackTrump || hasNineTrump) && !(hasJackTrump && hasNineTrump) && trumpSupportCount >= 2) {
    structuralBonus += 18;
  }

  // 90+ = J + 9 et deja une base d'atout correcte.
  if (hasJackTrump && hasNineTrump) {
    structuralBonus += 26;

    if (trumpCards.length >= 3) structuralBonus += 8;
    if (trumpCards.length >= 4) structuralBonus += 8;
    if (sideMasterTrickCount >= 1) structuralBonus += 8;
    if (aceCount >= 1) structuralBonus += 8;
    if (aceCount >= 2) structuralBonus += 10;
  }

  // 120 = main forte bicolore autour d'une meilleure couleur d'atout.
  if (hasJackTrump && hasNineTrump && strongSecondarySuitCount >= 1 && trumpCards.length >= 4) {
    structuralBonus += 14;
  }

  let capotPotential = 0;

  // 130+ = main tres proche du capot, avec peu de plis incertains.
  if (
    hasJackTrump &&
    hasNineTrump &&
    trumpCards.length >= 5 &&
    aceCount >= 2 &&
    sideMasterTrickCount >= 3
  ) {
    capotPotential += 24;
  }

  const score =
    totalPoints + offensivePotential + safety + cutPotential + structuralBonus + capotPotential;

  return {
    trump,
    totalPoints,
    trumpCount: trumpCards.length,
    strongTrumpCount,
    hasJackTrump,
    hasNineTrump,
    trumpSupportCount,
    aceCount,
    tenCount,
    sideMasterTrickCount,
    strongSecondarySuitCount,
    shortSuitCount,
    voidSuitCount,
    offensivePotential,
    safety,
    cutPotential,
    structuralBonus,
    capotPotential,
    score,
  };
}

export function evaluateHand(hand: Card[], trump: Suit): HandEvaluation {
  return evaluateHandForTrump(hand, trump);
}

export function evaluateBestTrump(hand: Card[]): HandEvaluation {
  return SUITS.map((suit) => evaluateHandForTrump(hand, suit)).sort(
    (first, second) => second.score - first.score,
  )[0];
}
