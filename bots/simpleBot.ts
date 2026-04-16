import { chooseCardToPlay, chooseSimpleBid } from "@/bots/heuristicBot";
import { getCurrentContract } from "@/engine/game";
import type { Card, GameState } from "@/engine/types";

export function chooseBotCard(state: GameState): Card {
  return chooseCardToPlay(state);
}

export function chooseBotBid(state: GameState) {
  const decision = chooseSimpleBid(state.hands[state.currentPlayerId]);
  const currentContract = getCurrentContract(state);

  if (decision.action === "pass" || !decision.value || !decision.trump) {
    return { action: "pass" } as const;
  }

  if (currentContract && decision.value <= currentContract.value) {
    return { action: "pass" } as const;
  }

  return {
    action: "bid",
    value: decision.value,
    trump: decision.trump,
  } as const;
}

export function isBotPlayer(playerId: GameState["currentPlayerId"]): boolean {
  return playerId !== 0;
}
