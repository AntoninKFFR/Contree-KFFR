import { chooseCardToPlay, chooseSimpleBid } from "@/bots/heuristicBot";
import { canCoinche, canSurcoinche } from "@/engine/bidding";
import { getCurrentContract } from "@/engine/game";
import type { Card, GameState } from "@/engine/types";

export function chooseBotCard(state: GameState): Card {
  return chooseCardToPlay(state);
}

export function chooseBotBid(state: GameState) {
  const currentContract = getCurrentContract(state);
  const hand = state.hands[state.currentPlayerId];
  const decision = chooseSimpleBid(hand);

  if (
    currentContract &&
    canSurcoinche(state.currentPlayerId, currentContract) &&
    decision.action === "bid" &&
    decision.value &&
    decision.value >= currentContract.value + 20
  ) {
    return { action: "surcoinche" } as const;
  }

  if (
    currentContract &&
    canCoinche(state.currentPlayerId, currentContract) &&
    decision.action === "bid" &&
    decision.trump === currentContract.trump &&
    decision.value &&
    decision.value >= currentContract.value + 20
  ) {
    return { action: "coinche" } as const;
  }

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
