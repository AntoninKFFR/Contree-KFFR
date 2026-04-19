import { getBotProfile, OFFICIAL_BOT_PROFILE_ID } from "@/bots/profiles";
import { chooseMonteCarloV2CardToPlay } from "@/bots/strategy/monteCarloCardStrategy";
import { chooseProfileBid } from "@/bots/strategy/biddingStrategy";
import { canCoinche, canSurcoinche } from "@/engine/bidding";
import { getCurrentContract } from "@/engine/game";
import type { Card, GameState } from "@/engine/types";

const OFFICIAL_BOT_PROFILE = getBotProfile(OFFICIAL_BOT_PROFILE_ID);

export function chooseBotCard(state: GameState): Card {
  return chooseMonteCarloV2CardToPlay(state);
}

export function chooseBotBid(state: GameState) {
  const currentContract = getCurrentContract(state);
  const decision = chooseProfileBid(state, OFFICIAL_BOT_PROFILE);

  if (
    currentContract &&
    canSurcoinche(state.currentPlayerId, currentContract) &&
    decision.action === "surcoinche"
  ) {
    return { action: "surcoinche" } as const;
  }

  if (
    currentContract &&
    canCoinche(state.currentPlayerId, currentContract) &&
    decision.action === "coinche"
  ) {
    return { action: "coinche" } as const;
  }

  if (decision.action === "pass" || !decision.value || !decision.trump) {
    return { action: "pass" } as const;
  }

  if (currentContract?.status === "coinched") {
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
