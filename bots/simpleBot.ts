import { chooseCardToPlay } from "@/bots/heuristicBot";
import type { Card, GameState } from "@/engine/types";

export function chooseBotCard(state: GameState): Card {
  return chooseCardToPlay(state);
}

export function isBotPlayer(playerId: GameState["currentPlayerId"]): boolean {
  return playerId !== 0;
}
