import type { Card, Rank, Suit } from "./types";

export const SUITS: Suit[] = ["clubs", "diamonds", "hearts", "spades"];
export const RANKS: Rank[] = ["7", "8", "9", "J", "Q", "K", "10", "A"];

export const SUIT_LABELS: Record<Suit, string> = {
  clubs: "Trefle",
  diamonds: "Carreau",
  hearts: "Coeur",
  spades: "Pique",
};

export const SUIT_SYMBOLS: Record<Suit, string> = {
  clubs: "♣",
  diamonds: "♦",
  hearts: "♥",
  spades: "♠",
};

export function createDeck(): Card[] {
  return SUITS.flatMap((suit) => RANKS.map((rank) => ({ suit, rank })));
}

export function cardId(card: Card): string {
  return `${card.rank}-${card.suit}`;
}

export function sameCard(first: Card, second: Card): boolean {
  return first.rank === second.rank && first.suit === second.suit;
}

export function formatCard(card: Card): string {
  return `${card.rank}${SUIT_SYMBOLS[card.suit]}`;
}

export function shuffleDeck(deck: Card[], random = Math.random): Card[] {
  const shuffled = [...deck];

  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }

  return shuffled;
}

export function sortHand(hand: Card[], trump: Suit): Card[] {
  return [...hand].sort((first, second) => {
    if (first.suit === second.suit) {
      return RANKS.indexOf(first.rank) - RANKS.indexOf(second.rank);
    }

    if (first.suit === trump) return 1;
    if (second.suit === trump) return -1;

    return SUITS.indexOf(first.suit) - SUITS.indexOf(second.suit);
  });
}
