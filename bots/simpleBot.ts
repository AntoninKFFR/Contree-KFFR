import { getBotProfile, OFFICIAL_BOT_PROFILE_ID } from "@/bots/profiles";
import { chooseMonteCarloCardToPlay, chooseMonteCarloV2CardToPlay } from "@/bots/strategy/monteCarloCardStrategy";
import { chooseMonteCarloV3CardToPlay } from "@/bots/strategy/monteCarloV3CardStrategy";
import { chooseProfileBid } from "@/bots/strategy/biddingStrategy";
import { chooseSimpleBid as chooseLegacyBid } from "@/bots/heuristicBot 2";
import { canCoinche, canSurcoinche } from "@/engine/bidding";
import { getCurrentContract } from "@/engine/game";
import { isBotSeat, SOLO_SEAT_ASSIGNMENTS, type SeatAssignments } from "@/engine/seats";
import type { Card, GameState } from "@/engine/types";

const OFFICIAL_BOT_PROFILE = getBotProfile(OFFICIAL_BOT_PROFILE_ID);

export function chooseBotCard(state: GameState): Card {
  if (OFFICIAL_BOT_PROFILE_ID === "hybrid_legacy_v1") return chooseMonteCarloCardToPlay(state);
  if (OFFICIAL_BOT_PROFILE_ID === "hybrid_legacy_v3") return chooseMonteCarloV3CardToPlay(state);
  return chooseMonteCarloV2CardToPlay(state);
}

export function chooseBotBid(state: GameState) {
  const currentContract = getCurrentContract(state);
  const decision = OFFICIAL_BOT_PROFILE_ID.startsWith("hybrid_legacy_")
    ? chooseLegacyBid(state.hands[state.currentPlayerId])
    : chooseProfileBid(state, OFFICIAL_BOT_PROFILE);

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

export function isBotPlayer(
  playerId: GameState["currentPlayerId"],
  seatAssignments: SeatAssignments = SOLO_SEAT_ASSIGNMENTS,
): boolean {
  return isBotSeat(seatAssignments, playerId);
}
