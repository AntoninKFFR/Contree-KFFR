import { getBotProfile, OFFICIAL_BOT_PROFILE_ID } from "@/bots/profiles";
import { chooseMonteCarloCardToPlay, chooseMonteCarloV2CardToPlay } from "@/bots/strategy/monteCarloCardStrategy";
import { chooseMonteCarloV3CardToPlay } from "@/bots/strategy/monteCarloV3CardStrategy";
import { chooseProfileBid } from "@/bots/strategy/biddingStrategy";
import { chooseHumanDoctrineBid } from "@/bots/strategy/humanDoctrine";
import { chooseHumanDoctrineV3Bid, type HumanDoctrineV3Trace } from "@/bots/strategy/humanDoctrineV3";
import { chooseHumanDoctrineV31Bid } from "@/bots/strategy/humanDoctrineV31";
import { chooseSimpleBid as chooseLegacyBid } from "@/bots/heuristicBot 2";
import { canCoinche, canSurcoinche } from "@/engine/bidding";
import { getCurrentContract } from "@/engine/game";
import { isBotSeat, SOLO_SEAT_ASSIGNMENTS, type SeatAssignments } from "@/engine/seats";
import type { BidValue, Card, GameState, Suit } from "@/engine/types";
import type { ContractMode } from "@/engine/types";
import { resolveContractMode } from "@/engine/contractMode";
import { resolveGameRules } from "@/engine/rulesets/resolve";
import { evaluateAllTrumpHand, evaluateNoTrumpHand } from "@/bots/evaluation/contractModeEvaluation";

export function chooseBotCard(state: GameState): Card {
  if (
    OFFICIAL_BOT_PROFILE_ID === "human_doctrine_v3_1_conversation_mc_v1"
    || OFFICIAL_BOT_PROFILE_ID === "human_doctrine_v3_conversation_mc_v1"
    || OFFICIAL_BOT_PROFILE_ID === "human_doctrine_v1_mc_v1"
    || OFFICIAL_BOT_PROFILE_ID === "hybrid_legacy_v1"
  ) return chooseMonteCarloCardToPlay(state);
  if (OFFICIAL_BOT_PROFILE_ID === "hybrid_legacy_v3") return chooseMonteCarloV3CardToPlay(state);
  return chooseMonteCarloV2CardToPlay(state);
}

type OfficialBotBid =
  | { action: "pass" | "coinche" | "surcoinche" }
  | { action: "bid"; value: BidValue; trump?: Suit; contractMode?: ContractMode };

function chooseSpecialContractBid(state: GameState): OfficialBotBid | null {
  const rules = resolveGameRules(state.settings);
  const current = getCurrentContract(state);
  const currentMode = current ? resolveContractMode(current) : null;
  if (currentMode?.kind === "no-trump" || currentMode?.kind === "all-trump") return { action: "pass" };
  if (current?.status && current.status !== "normal") return null;
  const nextValue = (current ? ([80, 90, 100, 110, 120, 130, 140, 150, 160] as BidValue[]).find((value) => value > current.value) : 80);
  if (!nextValue) return null;
  const hand = state.hands[state.currentPlayerId];
  const noTrump = rules.bidding.allowNoTrump ? evaluateNoTrumpHand(hand) : 0;
  const allTrump = rules.bidding.allowAllTrump ? evaluateAllTrumpHand(hand) : 0;
  if (noTrump < 80 && allTrump < 80) return null;
  return noTrump >= allTrump
    ? { action: "bid", value: nextValue, contractMode: { kind: "no-trump" } }
    : { action: "bid", value: nextValue, contractMode: { kind: "all-trump" } };
}

function normalizeBotBid(
  state: GameState,
  decision: { action: string; value?: BidValue; trump?: Suit; contractMode?: ContractMode },
): OfficialBotBid {
  const currentContract = getCurrentContract(state);
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

  if (decision.action === "pass" || !decision.value || (!decision.trump && !decision.contractMode)) {
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
    ...(decision.trump ? { trump: decision.trump } : {}),
    ...(decision.contractMode ? { contractMode: decision.contractMode } : {}),
  } as const;
}

export function chooseBotBidWithTrace(state: GameState): {
  bid: OfficialBotBid;
  biddingTrace?: HumanDoctrineV3Trace;
} {
  const special = chooseSpecialContractBid(state);
  if (special) return { bid: special };
  if (OFFICIAL_BOT_PROFILE_ID === "human_doctrine_v3_1_conversation_mc_v1") {
    const decision = chooseHumanDoctrineV31Bid(state);
    return { bid: normalizeBotBid(state, decision), biddingTrace: decision.trace };
  }
  if (OFFICIAL_BOT_PROFILE_ID === "human_doctrine_v3_conversation_mc_v1") {
    const decision = chooseHumanDoctrineV3Bid(state);
    return { bid: normalizeBotBid(state, decision), biddingTrace: decision.trace };
  }
  const decision = OFFICIAL_BOT_PROFILE_ID === "human_doctrine_v1_mc_v1"
    ? chooseHumanDoctrineBid(state)
    : OFFICIAL_BOT_PROFILE_ID.startsWith("hybrid_legacy_")
      ? chooseLegacyBid(state.hands[state.currentPlayerId])
      : chooseProfileBid(state, getBotProfile(OFFICIAL_BOT_PROFILE_ID));
  return { bid: normalizeBotBid(state, decision) };
}

export function chooseBotBid(state: GameState): OfficialBotBid {
  return chooseBotBidWithTrace(state).bid;
}

export function isBotPlayer(
  playerId: GameState["currentPlayerId"],
  seatAssignments: SeatAssignments = SOLO_SEAT_ASSIGNMENTS,
): boolean {
  return isBotSeat(seatAssignments, playerId);
}
