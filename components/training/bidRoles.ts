import { SUIT_SYMBOLS } from "@/engine/cards";
import type { Bid, PlayerId } from "@/engine/types";

/** Seat orientation for a seat-0 viewer, shared by both auction exercises. */
export const TRAINING_BID_ROLES: Record<PlayerId, string> = {
  0: "Toi", 1: "Adversaire droite", 2: "Partenaire", 3: "Adversaire gauche",
};

export function formatPublicBidLabel(bid: Bid): string {
  if (bid.action === "pass") return "Passe";
  if (bid.action === "coinche") return "Coinche";
  if (bid.action === "surcoinche") return "Surcoinche";
  const suit = bid.contractMode?.kind === "suit" ? bid.contractMode.suit : bid.trump;
  if (bid.action === "capot") return `Capot ${suit ? SUIT_SYMBOLS[suit] : ""}`.trim();
  if (bid.action === "generale") return `Générale ${suit ? SUIT_SYMBOLS[suit] : ""}`.trim();
  return `${bid.value} ${suit ? SUIT_SYMBOLS[suit] : ""}`.trim();
}
