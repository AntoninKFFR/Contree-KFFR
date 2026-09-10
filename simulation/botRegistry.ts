import { BOT_PROFILES, getBotProfile, type BotProfileId } from "@/bots/profiles";
import { chooseProfileBid, chooseProfileBidFromHand } from "@/bots/strategy/biddingStrategy";
import { chooseBiddingV2 } from "@/bots/strategy/biddingStrategyV2";
import { chooseMonteCarloBid } from "@/bots/strategy/monteCarloBiddingStrategy";
import { chooseHumanDoctrineBid, type HumanDoctrineOptions } from "@/bots/strategy/humanDoctrine";
import { chooseHumanDoctrineV2Bid, type HumanDoctrineV2Options } from "@/bots/strategy/humanDoctrineV2";
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

export type BotBiddingStrategyId =
  | "main"
  | "legacy"
  | "bidding_v2"
  | "monte_carlo"
  | "human_doctrine_v1"
  | "human_doctrine_v2_no110"
  | "human_doctrine_v2_110"
  | "prudent"
  | "balanced"
  | "aggressive"
  | "legacy_balanced_simple";

export type BotCardStrategyId =
  | "main"
  | "monte_carlo_v1"
  | "monte_carlo_v2"
  | "monte_carlo_v3"
  | "monte_carlo_v3_1"
  | "legacy"
  | "prudent"
  | "balanced"
  | "aggressive";

export type BiddingEngine =
  | { kind: "heuristic"; profile: BotProfileId }
  | { kind: "monte-carlo"; profile: BotProfileId }
  | { kind: "legacy-balanced-simple" }
  | { kind: "bidding-v2" }
  | { kind: "human-doctrine-v1"; options?: HumanDoctrineOptions }
  | { kind: "human-doctrine-v2"; options: HumanDoctrineV2Options }
  | { kind: "legacy" };

export type CardEngine =
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
  biddingStrategyId?: BotBiddingStrategyId;
  cardStrategyId?: BotCardStrategyId;
};

export const BIDDING_ENGINES: Record<BotBiddingStrategyId, { label: string; engine: BiddingEngine }> = {
  main: { label: "Main heuristic bidding", engine: { kind: "heuristic", profile: "main" } },
  legacy: { label: "Legacy heuristic bidding", engine: { kind: "legacy" } },
  bidding_v2: { label: "Conservative bidding V2", engine: { kind: "bidding-v2" } },
  monte_carlo: { label: "Monte Carlo bidding", engine: { kind: "monte-carlo", profile: "main" } },
  human_doctrine_v1: { label: "Human doctrine V1 bidding (experimental)", engine: { kind: "human-doctrine-v1" } },
  human_doctrine_v2_no110: { label: "Human doctrine V2 bidding, no 110 (experimental)", engine: { kind: "human-doctrine-v2", options: { allow110: false } } },
  human_doctrine_v2_110: { label: "Human doctrine V2 bidding, 110 enabled (experimental)", engine: { kind: "human-doctrine-v2", options: { allow110: true } } },
  prudent: { label: "Prudent bidding", engine: { kind: "heuristic", profile: "prudent" } },
  balanced: { label: "Balanced bidding", engine: { kind: "heuristic", profile: "balanced" } },
  aggressive: { label: "Aggressive bidding", engine: { kind: "heuristic", profile: "aggressive" } },
  legacy_balanced_simple: { label: "Legacy balanced bidding without context", engine: { kind: "legacy-balanced-simple" } },
};

export const CARD_ENGINES: Record<BotCardStrategyId, { label: string; engine: CardEngine }> = {
  main: { label: "Main heuristic cards", engine: { kind: "heuristic", profile: "main" } },
  monte_carlo_v1: { label: "Monte Carlo V1 cards", engine: { kind: "monte-carlo-v1" } },
  monte_carlo_v2: { label: "Monte Carlo V2 cards", engine: { kind: "monte-carlo-v2" } },
  monte_carlo_v3: { label: "Monte Carlo V3 cards", engine: { kind: "monte-carlo-v3" } },
  monte_carlo_v3_1: { label: "Monte Carlo V3.1 cards", engine: { kind: "monte-carlo-v3", options: V3_1_OPTIONS } },
  legacy: { label: "Legacy heuristic cards", engine: { kind: "legacy" } },
  prudent: { label: "Prudent cards", engine: { kind: "heuristic", profile: "prudent" } },
  balanced: { label: "Balanced cards", engine: { kind: "heuristic", profile: "balanced" } },
  aggressive: { label: "Aggressive cards", engine: { kind: "heuristic", profile: "aggressive" } },
};

export const BIDDING_ENGINE_IDS = Object.keys(BIDDING_ENGINES) as BotBiddingStrategyId[];
export const CARD_ENGINE_IDS = Object.keys(CARD_ENGINES) as BotCardStrategyId[];

export function createHybridStrategy(
  biddingStrategyId: BotBiddingStrategyId,
  cardStrategyId: BotCardStrategyId,
  options: { id?: string; label?: string; status?: BotStrategyDefinition["status"] } = {},
): BotStrategyDefinition {
  return {
    id: options.id ?? `hybrid_${biddingStrategyId}__${cardStrategyId}`,
    label: options.label ?? `${BIDDING_ENGINES[biddingStrategyId].label} + ${CARD_ENGINES[cardStrategyId].label}`,
    status: options.status ?? "diagnostic",
    bidding: BIDDING_ENGINES[biddingStrategyId].engine,
    card: CARD_ENGINES[cardStrategyId].engine,
    biddingStrategyId,
    cardStrategyId,
  };
}

function activeDefinition(profileId: BotProfileId): BotStrategyDefinition {
  const profile = getBotProfile(profileId);
  if (profileId === "hybrid_legacy_v1") {
    return { id: profileId, label: profile.label, status: "active", bidding: { kind: "legacy" }, card: { kind: "monte-carlo-v1" }, biddingStrategyId: "legacy", cardStrategyId: "monte_carlo_v1" };
  }
  if (profileId === "hybrid_legacy_v2") {
    return { id: profileId, label: profile.label, status: "experimental", bidding: { kind: "legacy" }, card: { kind: "monte-carlo-v2" }, biddingStrategyId: "legacy", cardStrategyId: "monte_carlo_v2" };
  }
  if (profileId === "hybrid_legacy_v3") {
    return { id: profileId, label: profile.label, status: "experimental", bidding: { kind: "legacy" }, card: { kind: "monte-carlo-v3" }, biddingStrategyId: "legacy", cardStrategyId: "monte_carlo_v3" };
  }
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

export const HUMAN_DOCTRINE_V1_STRATEGY = createHybridStrategy("human_doctrine_v1", "monte_carlo_v1", {
  id: "human_doctrine_v1_mc_v1",
  label: "Human Doctrine V1 + Monte Carlo V1",
  status: "active",
});

export const ACTIVE_BOT_STRATEGIES: BotStrategyDefinition[] = [
  ...(Object.keys(BOT_PROFILES) as BotProfileId[]).map(activeDefinition),
  HUMAN_DOCTRINE_V1_STRATEGY,
];

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
  if (strategy.bidding.kind === "bidding-v2") return chooseBiddingV2(state);
  if (strategy.bidding.kind === "human-doctrine-v1") {
    return chooseHumanDoctrineBid(state, strategy.bidding.options);
  }
  if (strategy.bidding.kind === "human-doctrine-v2") {
    return chooseHumanDoctrineV2Bid(state, strategy.bidding.options);
  }
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
