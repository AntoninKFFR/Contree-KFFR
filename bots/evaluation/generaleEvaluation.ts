import { SUITS } from "@/engine/cards";
import type { Card, ContractMode, Suit } from "@/engine/types";

export type GeneraleEvaluation = {
  contractMode: ContractMode;
  confidence: number;
  reason: string;
};

function suitCandidate(hand: Card[], suit: Suit): GeneraleEvaluation | null {
  const trumps = hand.filter((card) => card.suit === suit);
  const sideCards = hand.filter((card) => card.suit !== suit);
  const ranks = new Set(trumps.map((card) => card.rank));
  const absoluteTrumpControl = ranks.has("J") && ranks.has("9") && ranks.has("A");
  const sideCardsAreMasters = sideCards.every((card) => card.rank === "A");
  if (trumps.length < 5 || !absoluteTrumpControl || !sideCardsAreMasters) return null;
  return {
    contractMode: { kind: "suit", suit },
    confidence: Math.min(0.99, 0.9 + (trumps.length - 5) * 0.03),
    reason: "Contrôle absolu d'au moins cinq atouts et uniquement des As maîtres hors-atout.",
  };
}

/** Deliberately conservative: a merely strong capot hand must not become a Générale. */
export function evaluateGenerale(hand: Card[]): GeneraleEvaluation | null {
  return SUITS.map((suit) => suitCandidate(hand, suit))
    .filter((candidate): candidate is GeneraleEvaluation => candidate !== null)
    .sort((first, second) => second.confidence - first.confidence)[0] ?? null;
}
