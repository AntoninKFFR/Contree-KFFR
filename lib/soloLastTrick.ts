import { activePlayersForRound } from "@/engine/activePlayers";
import { soloHumanHand, soloLegalHumanCards, type SoloDisplayState } from "./solo/publicState";
import type { Card, PlayerId } from "@/engine/types";

/** A played card counts as that player's sole card for the current final trick. */
export function isForcedLastTrick(state: SoloDisplayState): boolean {
  if (state.phase !== "playing" || state.completedTricks.length !== 7) return false;
  return activePlayersForRound(state).every((playerId) =>
    ("hands" in state ? state.hands[playerId].length : state.handCounts[playerId]) + Number(state.currentTrick.cards.some((played) => played.playerId === playerId)) === 1);
}

export function forcedHumanLastCard(state: SoloDisplayState, humanPlayerId: PlayerId): Card | null {
  if (!isForcedLastTrick(state) || state.currentPlayerId !== humanPlayerId || soloHumanHand(state, humanPlayerId).length !== 1) return null;
  const legal = soloLegalHumanCards(state);
  return legal.length === 1 ? legal[0] : null;
}

export function queueForcedHumanLastCard(
  state: SoloDisplayState,
  humanPlayerId: PlayerId,
  delayMs: number,
  commit: (expectedState: SoloDisplayState, card: Card) => void,
): () => void {
  const card = forcedHumanLastCard(state, humanPlayerId);
  if (!card) return () => undefined;
  const timer = setTimeout(() => commit(state, card), delayMs);
  return () => clearTimeout(timer);
}
