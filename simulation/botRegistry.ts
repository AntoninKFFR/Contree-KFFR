import { BOT_PROFILES, getBotProfile, type BotProfileId } from "@/bots/profiles";
import { chooseProfileBid, chooseProfileBidFromHand } from "@/bots/strategy/biddingStrategy";
import { chooseMonteCarloBid } from "@/bots/strategy/monteCarloBiddingStrategy";
import { chooseProfileCardToPlay } from "@/bots/strategy/cardStrategy";
import { chooseMonteCarloCardToPlay, chooseMonteCarloV2CardToPlay } from "@/bots/strategy/monteCarloCardStrategy";
import { chooseMonteCarloV3Decision, V3_1_OPTIONS, type BotDecisionTraceV3, type MonteCarloV3Options } from "@/bots/strategy/monteCarloV3CardStrategy";
import { chooseCardToPlay as chooseLegacyCard, chooseSimpleBid as chooseLegacyBid } from "@/bots/heuristicBot 2";
import type { BidValue, Card, GameState, Suit } from "@/engine/types";

export type StrategyBid = {
  action: "pass" | "bid" | "coinche" | "surcoinche";
  value?: BidValue;
  trump?: Suit;
};

type BiddingEngine =
  | { kind: "heuristic"; profile: BotProfileId }
  | { kind: "monte-carlo"; profile: BotProfileId }
  | { kind: "legacy-balanced-simple" }
  | { kind: "legacy" };

type CardEngine =
  | { kind: "heuristic"; profile: BotProfileId }
  | { kind: "monte-carlo-v1" }
  | { kind: "monte-carlo-v2" }
  | { kind: "monte-carlo-v3"; options?: MonteCarloV3Options }
  | { kind: "legacy" };

export type BotStrategyDefinition = {
  id: string;
  label: string;
  status: "active" | "experimental" | "legacy" | "diagnostic";
  bidding: BiddingEngine;
  card: CardEngine;
};

function activeDefinition(profileId: BotProfileId): BotStrategyDefinition {
  const profile = getBotProfile(profileId);
  if (profileId === "main_montecarlo") {
    return { id: profileId, label: profile.label, status: "active", bidding: { kind: "heuristic", profile: "main" }, card: { kind: "monte-carlo-v1" } };
  }
  if (profileId === "main_montecarlo_v2") {
    return { id: profileId, label: profile.label, status: "active", bidding: { kind: "heuristic", profile: "main" }, card: { kind: "monte-carlo-v2" } };
  }
  if (profileId === "main_montecarlo_v3") {
    return { id: profileId, label: profile.label, status: "experimental", bidding: { kind: "heuristic", profile: "main" }, card: { kind: "monte-carlo-v3" } };
  }
  if (profileId === "main_montecarlo_v3_1") {
    return { id: profileId, label: profile.label, status: "experimental", bidding: { kind: "heuristic", profile: "main" }, card: { kind: "monte-carlo-v3", options: V3_1_OPTIONS } };
  }
  if (profileId === "main_montecarlo_bidding") {
    return { id: profileId, label: profile.label, status: "experimental", bidding: { kind: "monte-carlo", profile: "main" }, card: { kind: "monte-carlo-v2" } };
  }
  return { id: profileId, label: profile.label, status: "active", bidding: { kind: "heuristic", profile: profileId }, card: { kind: "heuristic", profile: profileId } };
}

export const ACTIVE_BOT_STRATEGIES: BotStrategyDefinition[] = (Object.keys(BOT_PROFILES) as BotProfileId[]).map(activeDefinition);

export const LEGACY_BOT_STRATEGIES: BotStrategyDefinition[] = [
  {
    id: "legacy_heuristic_v0",
    label: "Legacy heuristic standalone",
    status: "legacy",
    bidding: { kind: "legacy" },
    card: { kind: "legacy" },
  },
  {
    id: "legacy_balanced_no_double",
    label: "Legacy simple (balanced, no coinche)",
    status: "legacy",
    bidding: { kind: "legacy-balanced-simple" },
    card: { kind: "heuristic", profile: "balanced" },
  },
];

export const ALL_BOT_STRATEGIES = [...ACTIVE_BOT_STRATEGIES, ...LEGACY_BOT_STRATEGIES];

export function findBotStrategy(id: string): BotStrategyDefinition {
  const strategy = ALL_BOT_STRATEGIES.find((candidate) => candidate.id === id);
  if (!strategy) throw new Error(`Stratégie bot inconnue: ${id}`);
  return strategy;
}

export function createV3Variant(id: string, label: string, options: MonteCarloV3Options): BotStrategyDefinition {
  return {
    id,
    label,
    status: "diagnostic",
    bidding: { kind: "heuristic", profile: "main" },
    card: { kind: "monte-carlo-v3", options },
  };
}

export function composeStrategy(
  id: string,
  label: string,
  biddingFrom: BotStrategyDefinition,
  cardFrom: BotStrategyDefinition,
): BotStrategyDefinition {
  return { id, label, status: "diagnostic", bidding: biddingFrom.bidding, card: cardFrom.card };
}

export function chooseStrategyBid(state: GameState, strategy: BotStrategyDefinition): StrategyBid {
  if (strategy.bidding.kind === "legacy") return chooseLegacyBid(state.hands[state.currentPlayerId]);
  if (strategy.bidding.kind === "legacy-balanced-simple") {
    return chooseProfileBidFromHand(state.hands[state.currentPlayerId], getBotProfile("balanced"), null);
  }
  const profile = getBotProfile(strategy.bidding.profile);
  return strategy.bidding.kind === "monte-carlo"
    ? chooseMonteCarloBid(state, { profile })
    : chooseProfileBid(state, profile);
}

export function chooseStrategyCard(state: GameState, strategy: BotStrategyDefinition): Card {
  return chooseStrategyCardWithTrace(state, strategy).card;
}

export function chooseStrategyCardWithTrace(
  state: GameState,
  strategy: BotStrategyDefinition,
): { card: Card; trace?: BotDecisionTraceV3 } {
  switch (strategy.card.kind) {
    case "legacy": return { card: chooseLegacyCard(state) };
    case "monte-carlo-v1": return { card: chooseMonteCarloCardToPlay(state) };
    case "monte-carlo-v2": return { card: chooseMonteCarloV2CardToPlay(state) };
    case "monte-carlo-v3": {
      const trace = chooseMonteCarloV3Decision(state, strategy.card.options);
      return { card: trace.card, trace };
    }
    case "heuristic": return { card: chooseProfileCardToPlay(state, getBotProfile(strategy.card.profile)) };
  }
}
