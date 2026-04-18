import { SUITS } from "@/engine/cards";
import { cardPoints } from "@/engine/rules";
import type { Card, Suit } from "@/engine/types";

export type HandEvaluation = {
  trump: Suit;
  totalPoints: number;
  trumpCount: number;
  strongTrumpCount: number;
  aceCount: number;
  tenCount: number;
  shortSuitCount: number;
  voidSuitCount: number;
  offensivePotential: number;
  safety: number;
  cutPotential: number;
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

export function evaluateHandForTrump(hand: Card[], trump: Suit): HandEvaluation {
  const suits = groupBySuit(hand);
  const trumpCards = suits[trump];
  const nonTrumpCards = hand.filter((card) => card.suit !== trump);
  const totalPoints = hand.reduce((total, card) => total + cardPoints(card, trump), 0);
  const strongTrumpCount = trumpCards.filter((card) => STRONG_TRUMP_RANKS.has(card.rank)).length;
  const aceCount = nonTrumpCards.filter((card) => card.rank === "A").length;
  const tenCount = nonTrumpCards.filter((card) => card.rank === "10").length;
  const shortSuitCount = SUITS.filter((suit) => suit !== trump && suits[suit].length === 1).length;
  const voidSuitCount = SUITS.filter((suit) => suit !== trump && suits[suit].length === 0).length;

  // Potentiel offensif: capacite a faire des plis et a prendre la main.
  const offensivePotential =
    trumpCards.length * 6 + strongTrumpCount * 13 + aceCount * 7 + tenCount * 3;

  // Securite: cartes qui rendent le contrat moins fragile.
  const safety = strongTrumpCount * 9 + Math.max(0, trumpCards.length - 2) * 4 + aceCount * 5;

  // Possibilite de coupe: une couleur courte ou vide aide souvent apres le debut de manche.
  const cutPotential = shortSuitCount * 4 + voidSuitCount * 8;

  const score = totalPoints + offensivePotential + safety + cutPotential;

  return {
    trump,
    totalPoints,
    trumpCount: trumpCards.length,
    strongTrumpCount,
    aceCount,
    tenCount,
    shortSuitCount,
    voidSuitCount,
    offensivePotential,
    safety,
    cutPotential,
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
