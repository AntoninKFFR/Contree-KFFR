import { SUITS } from "@/engine/cards";
import type { Card } from "@/engine/types";

export function evaluateNoTrumpHand(hand: Card[]): number {
  let score = 0;
  for (const card of hand) {
    score += card.rank === "A" ? 20 : card.rank === "10" ? 11 : card.rank === "K" ? 5 : card.rank === "Q" ? 3 : card.rank === "J" ? 2 : 0;
  }
  for (const suit of SUITS) {
    const cards = hand.filter((card) => card.suit === suit);
    if (cards.some((card) => card.rank === "10") && cards.some((card) => card.rank === "A" || card.rank === "K")) score += 7;
    if (cards.length >= 4) score += 4;
  }
  return score;
}

export function evaluateAllTrumpHand(hand: Card[]): number {
  return hand.reduce((score, card) => score + (
    card.rank === "J" ? 18
      : card.rank === "9" ? 13
        : card.rank === "A" ? 10
          : card.rank === "10" ? 8
            : card.rank === "K" ? 3
              : card.rank === "Q" ? 2
                : 0
  ), 0);
}
