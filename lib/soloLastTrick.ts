import { activePlayersForRound } from "@/engine/activePlayers";
import { playableCardsForCurrentPlayer } from "@/engine/game";
import type { Card, GameState, PlayerId } from "@/engine/types";

/** A played card counts as that player's sole card for the current final trick. */
export function isForcedLastTrick(state: GameState): boolean {
  if (state.phase !== "playing" || state.completedTricks.length !== 7) return false;
  return activePlayersForRound(state).every((playerId) =>
    state.hands[playerId].length + Number(state.currentTrick.cards.some((played) => played.playerId === playerId)) === 1);
}

export function forcedHumanLastCard(state: GameState, humanPlayerId: PlayerId): Card | null {
  if (!isForcedLastTrick(state) || state.currentPlayerId !== humanPlayerId || state.hands[humanPlayerId].length !== 1) return null;
  const legal = playableCardsForCurrentPlayer(state);
  return legal.length === 1 ? legal[0] : null;
}

export function queueForcedHumanLastCard(
  state: GameState,
  humanPlayerId: PlayerId,
  delayMs: number,
  commit: (expectedState: GameState, card: Card) => void,
): () => void {
  const card = forcedHumanLastCard(state, humanPlayerId);
  if (!card) return () => undefined;
  const timer = setTimeout(() => commit(state, card), delayMs);
  return () => clearTimeout(timer);
}
