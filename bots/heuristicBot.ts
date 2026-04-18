import { getBotProfile, type BotProfileId } from "@/bots/profiles";
import { chooseProfileBidFromHand, type BidDecision } from "@/bots/strategy/biddingStrategy";
import { chooseProfileCardToPlay } from "@/bots/strategy/cardStrategy";
import { evaluateHand, type HandEvaluation } from "@/bots/evaluation/handEvaluation";
import type { Card, GameState } from "@/engine/types";

export type { BidDecision, HandEvaluation };
export { evaluateHand };

export function chooseSimpleBid(hand: Card[], profileId: BotProfileId = "balanced"): BidDecision {
  return chooseProfileBidFromHand(hand, getBotProfile(profileId), null);
}

export function chooseCardToPlay(state: GameState, profileId: BotProfileId = "balanced"): Card {
  return chooseProfileCardToPlay(state, getBotProfile(profileId));
}
