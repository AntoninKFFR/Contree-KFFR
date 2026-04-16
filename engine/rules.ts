import { RANKS, sameCard } from "./cards";
import type { Card, PlayedCard, PlayerId, Suit, TeamId, Trick } from "./types";

const NORMAL_POINTS: Record<Card["rank"], number> = {
  "7": 0,
  "8": 0,
  "9": 0,
  J: 2,
  Q: 3,
  K: 4,
  "10": 10,
  A: 11,
};

const TRUMP_POINTS: Record<Card["rank"], number> = {
  "7": 0,
  "8": 0,
  Q: 3,
  K: 4,
  "10": 10,
  A: 11,
  "9": 14,
  J: 20,
};

const NORMAL_STRENGTH: Record<Card["rank"], number> = {
  "7": 0,
  "8": 1,
  "9": 2,
  J: 3,
  Q: 4,
  K: 5,
  "10": 6,
  A: 7,
};

const TRUMP_STRENGTH: Record<Card["rank"], number> = {
  "7": 0,
  "8": 1,
  Q: 2,
  K: 3,
  "10": 4,
  A: 5,
  "9": 6,
  J: 7,
};

export function playerTeam(playerId: PlayerId): TeamId {
  return playerId === 0 || playerId === 2 ? 0 : 1;
}

export function nextPlayer(playerId: PlayerId): PlayerId {
  return ((playerId + 1) % 4) as PlayerId;
}

export function cardPoints(card: Card, trump: Suit): number {
  return card.suit === trump ? TRUMP_POINTS[card.rank] : NORMAL_POINTS[card.rank];
}

export function trickPoints(cards: PlayedCard[], trump: Suit, isLastTrick: boolean): number {
  const cardsPoints = cards.reduce((total, played) => total + cardPoints(played.card, trump), 0);
  return isLastTrick ? cardsPoints + 10 : cardsPoints;
}

export function getLegalCards(
  hand: Card[],
  trick: Trick,
  playerId: PlayerId,
  trump: Suit,
): Card[] {
  if (trick.cards.length === 0) {
    return hand;
  }

  const requestedSuit = trick.cards[0].card.suit;
  const matchingSuit = hand.filter((card) => card.suit === requestedSuit);

  if (matchingSuit.length > 0) {
    return matchingSuit;
  }

  const trumpCards = hand.filter((card) => card.suit === trump);

  if (trumpCards.length === 0) {
    return hand;
  }

  const currentWinnerId = getTrickWinner(trick, trump);
  const partnerIsWinning = playerTeam(currentWinnerId) === playerTeam(playerId);

  // Quand le partenaire est maitre du pli, on peut "pisser":
  // le joueur n'est pas oblige de couper.
  if (partnerIsWinning) {
    return hand;
  }

  return trumpCards;
}

export function isLegalCard(
  hand: Card[],
  trick: Trick,
  card: Card,
  playerId: PlayerId,
  trump: Suit,
): boolean {
  return getLegalCards(hand, trick, playerId, trump).some((legalCard) => sameCard(legalCard, card));
}

export function compareCards(
  candidate: Card,
  currentWinner: Card,
  leadSuit: Suit,
  trump: Suit,
): number {
  const candidateIsTrump = candidate.suit === trump;
  const winnerIsTrump = currentWinner.suit === trump;

  if (candidateIsTrump && !winnerIsTrump) return 1;
  if (!candidateIsTrump && winnerIsTrump) return -1;

  if (candidate.suit !== currentWinner.suit) {
    if (candidate.suit === leadSuit && currentWinner.suit !== leadSuit) return 1;
    return -1;
  }

  const strengths = candidateIsTrump ? TRUMP_STRENGTH : NORMAL_STRENGTH;
  return strengths[candidate.rank] - strengths[currentWinner.rank];
}

export function getTrickWinner(trick: Trick, trump: Suit): PlayerId {
  if (trick.cards.length === 0) {
    throw new Error("Cannot choose a winner for an empty trick.");
  }

  const leadSuit = trick.cards[0].card.suit;
  let winner = trick.cards[0];

  for (const played of trick.cards.slice(1)) {
    if (compareCards(played.card, winner.card, leadSuit, trump) > 0) {
      winner = played;
    }
  }

  return winner.playerId;
}

export function rankIndex(rank: Card["rank"]): number {
  return RANKS.indexOf(rank);
}
