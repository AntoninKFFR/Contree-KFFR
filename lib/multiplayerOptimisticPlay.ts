import { sameCard } from "@/engine/cards";
import type { Card } from "@/engine/types";

export type PendingLocalPlay = { card: Card; version: number };

// A pending gesture is displayed only while the authoritative hand and room
// version still describe the position from which the player clicked.
export function visiblePendingCard(
  pending: PendingLocalPlay | null,
  version: number | null,
  hand: Card[] | null,
): Card | null {
  return pending && version === pending.version && hand?.some((card) => sameCard(card, pending.card))
    ? pending.card : null;
}

export function handWithoutPendingCard(hand: Card[], pendingCard: Card | null): Card[] {
  return pendingCard ? hand.filter((card) => !sameCard(card, pendingCard)) : hand;
}
