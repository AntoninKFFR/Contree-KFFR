import type { Card, GameState, PlayerId } from "@/engine/types";
import type { PlayerGameView } from "@/engine/views";
/** Knowledge questions need public tricks and the viewer's hand, never opponents' hands. */
export type KnowledgeState = GameState | PlayerGameView;
export function knowledgeHand(state: KnowledgeState, viewerId: PlayerId): Card[] {
  if ("hands" in state) return state.hands[viewerId];
  if (state.viewerPlayerId !== viewerId) throw Error("The public projection belongs to another viewer.");
  return state.hand;
}
