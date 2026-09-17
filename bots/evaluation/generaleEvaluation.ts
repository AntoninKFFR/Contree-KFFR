import { SUITS } from "@/engine/cards";
import type { Card, ContractMode, Suit } from "@/engine/types";
import { evaluateCapotHand } from "@/bots/evaluation/advancedRulesEvaluation";

export type GeneraleEvaluation = {
  contractMode: ContractMode;
  confidence: number;
  reason: string;
};

function suitCandidate(hand: Card[], suit: Suit): GeneraleEvaluation | null {
  const trumps = hand.filter((card) => card.suit === suit);
  if (trumps.length < 5 || !evaluateCapotHand(hand, { kind: "suit", suit })) return null;
  return {
    contractMode: { kind: "suit", suit },
    confidence: Math.min(0.99, 0.9 + (trumps.length - 5) * 0.03),
    reason: "Contrôle absolu d'au moins cinq atouts et uniquement des As maîtres hors-atout.",
  };
}

/** Deliberately conservative: a merely strong capot hand must not become a Générale. */
export function evaluateGenerale(hand: Card[], enabledSpecialModes: ContractMode[] = []): GeneraleEvaluation | null {
  const special = enabledSpecialModes.map((mode): GeneraleEvaluation | null => {
    const capot = evaluateCapotHand(hand, mode);
    return capot ? {
      contractMode: mode,
      confidence: 0.98,
      reason: "Huit cartes personnellement maîtresses dans le mode autorisé ; le partenaire reste inactif.",
    } : null;
  });
  return [...SUITS.map((suit) => suitCandidate(hand, suit)), ...special]
    .filter((candidate): candidate is GeneraleEvaluation => candidate !== null)
    .sort((first, second) => second.confidence - first.confidence)[0] ?? null;
}
