import { createDeck, sameCard } from "@/engine/cards";
import { getCurrentContract, makeBid, playCard } from "@/engine/game";
import { playerTeam } from "@/engine/rules";
import type { Card, GameState, PlayerId, TeamId } from "@/engine/types";
import { getBotProfile } from "@/bots/profiles";
import type { BotProfile } from "@/bots/profiles";
import {
  chooseProfileBid,
  getPlausibleBidCandidates,
  type BidDecision,
} from "@/bots/strategy/biddingStrategy";
import { chooseProfileCardToPlay } from "@/bots/strategy/cardStrategy";

const PLAYERS: PlayerId[] = [0, 1, 2, 3];
const MONTE_CARLO_BIDDING_TOTAL_BUDGET = 36;
const MAX_ROLLOUT_STEPS = 80;

type MonteCarloBiddingOptions = {
  profile?: BotProfile;
  totalBudget?: number;
};

function cardKey(card: Card): string {
  return `${card.rank}-${card.suit}`;
}

function containsCard(cards: Card[], card: Card): boolean {
  return cards.some((knownCard) => sameCard(knownCard, card));
}

function createSeededRandom(seed: number): () => number {
  let value = seed;

  return () => {
    value += 0x6d2b79f5;
    let next = value;
    next = Math.imul(next ^ (next >>> 15), next | 1);
    next ^= next + Math.imul(next ^ (next >>> 7), next | 61);
    return ((next ^ (next >>> 14)) >>> 0) / 4294967296;
  };
}

function hashVisibleBiddingState(state: GameState): number {
  const visibleHand = state.hands[state.currentPlayerId].map(cardKey).sort().join("|");
  const bids = state.bids
    .map((bid) =>
      bid.action === "bid"
        ? `${bid.playerId}:bid:${bid.value}:${bid.trump}`
        : `${bid.playerId}:${bid.action}`,
    )
    .join("|");
  const text = [
    state.currentPlayerId,
    state.startingPlayerId,
    visibleHand,
    bids,
    state.totalScore[0],
    state.totalScore[1],
  ].join("::");

  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
}

function shuffleCards(cards: Card[], random: () => number): Card[] {
  const shuffled = [...cards];

  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }

  return shuffled;
}

function createPlausibleBiddingState(state: GameState, random: () => number): GameState {
  const knownHand = state.hands[state.currentPlayerId];
  const unknownCards = shuffleCards(
    createDeck().filter((card) => !containsCard(knownHand, card)),
    random,
  );
  let cursor = 0;
  const hands: GameState["hands"] = {
    0: [],
    1: [],
    2: [],
    3: [],
  };

  for (const playerId of PLAYERS) {
    if (playerId === state.currentPlayerId) {
      hands[playerId] = [...knownHand];
      continue;
    }

    const cardCount = state.hands[playerId].length;
    hands[playerId] = unknownCards.slice(cursor, cursor + cardCount);
    cursor += cardCount;
  }

  return {
    ...state,
    hands,
  };
}

function applyBidDecision(state: GameState, decision: BidDecision): GameState {
  if (decision.action === "bid" && decision.value && decision.trump) {
    return makeBid(state, state.currentPlayerId, {
      action: "bid",
      value: decision.value,
      trump: decision.trump,
    });
  }

  if (decision.action === "coinche") {
    return makeBid(state, state.currentPlayerId, { action: "coinche" });
  }

  if (decision.action === "surcoinche") {
    return makeBid(state, state.currentPlayerId, { action: "surcoinche" });
  }

  return makeBid(state, state.currentPlayerId, { action: "pass" });
}

function rolloutBid(state: GameState): GameState {
  const profile = getBotProfile("main");
  const decision = chooseProfileBid(state, profile);
  return applyBidDecision(state, decision);
}

function rolloutRound(state: GameState): GameState {
  let nextState = state;
  const rolloutProfile = getBotProfile("main");
  let guard = 0;

  while ((nextState.phase === "bidding" || nextState.phase === "playing") && guard < MAX_ROLLOUT_STEPS) {
    if (nextState.phase === "bidding") {
      nextState = rolloutBid(nextState);
    } else {
      const card = chooseProfileCardToPlay(nextState, rolloutProfile);
      nextState = playCard(nextState, nextState.currentPlayerId, card);
    }

    guard += 1;
  }

  return nextState;
}

function teamScore(state: GameState, teamId: TeamId): number {
  const opponentTeam = teamId === 0 ? 1 : 0;

  if (state.result?.kind === "played") {
    const roundDiff = state.result.roundScore[teamId] - state.result.roundScore[opponentTeam];
    const contractWeight = state.result.contract.value * state.result.multiplier;
    const isAttack = state.result.contract.teamId === teamId;

    if (isAttack) {
      return state.result.contractSucceeded
        ? roundDiff + contractWeight * 0.25
        : roundDiff - contractWeight * 0.35;
    }

    return state.result.contractSucceeded
      ? roundDiff - contractWeight * 0.2
      : roundDiff + contractWeight * 0.3;
  }

  return state.result?.roundScore[teamId] ?? 0;
}

function scoreCandidate(
  state: GameState,
  candidate: BidDecision,
  samples: number,
  baseSeed: number,
): number {
  const teamId = playerTeam(state.currentPlayerId);
  let totalScore = 0;
  let completedSamples = 0;

  for (let sampleIndex = 0; sampleIndex < samples; sampleIndex += 1) {
    const random = createSeededRandom(baseSeed + sampleIndex);
    const plausibleState = createPlausibleBiddingState(state, random);

    try {
      const afterCandidate = applyBidDecision(plausibleState, candidate);
      const finalState = rolloutRound(afterCandidate);
      totalScore += teamScore(finalState, teamId);
      completedSamples += 1;
    } catch {
      // A candidate can become illegal if the bidding context is unusual; ignore that rollout.
    }
  }

  return completedSamples === 0 ? Number.NEGATIVE_INFINITY : totalScore / completedSamples;
}

function shouldUseMonteCarloBidding(
  state: GameState,
  baseDecision: BidDecision,
  candidates: BidDecision[],
): boolean {
  if (state.phase !== "bidding") return false;
  if (candidates.length <= 1) return false;
  if (baseDecision.action === "coinche" || baseDecision.action === "surcoinche") return false;

  const currentContract = getCurrentContract(state);
  if (currentContract && currentContract.status !== "normal") return false;
  if (!currentContract && baseDecision.action === "pass" && baseDecision.confidence < 0.35) return false;
  if (!currentContract && baseDecision.action === "bid" && baseDecision.confidence > 0.82) return false;

  return baseDecision.confidence >= 0.25 && baseDecision.confidence <= 0.88;
}

function candidateOrder(decision: BidDecision): number {
  if (decision.action === "pass") return 0;
  if (decision.action === "bid") return decision.value ?? 0;
  return 200;
}

export function chooseMonteCarloBid(
  state: GameState,
  options: MonteCarloBiddingOptions = {},
): BidDecision {
  const profile = options.profile ?? getBotProfile("main_montecarlo_bidding");
  const baseDecision = chooseProfileBid(state, profile);
  const candidates = getPlausibleBidCandidates(state, profile, baseDecision);

  if (!shouldUseMonteCarloBidding(state, baseDecision, candidates)) {
    return baseDecision;
  }

  const samplesPerCandidate = Math.max(
    1,
    Math.floor((options.totalBudget ?? MONTE_CARLO_BIDDING_TOTAL_BUDGET) / candidates.length),
  );
  const baseSeed = hashVisibleBiddingState(state) ^ 0x85ebca6b;

  return candidates
    .map((candidate, index) => ({
      candidate,
      index,
      score: scoreCandidate(state, candidate, samplesPerCandidate, baseSeed + index * 1009),
    }))
    .sort((first, second) => {
      if (second.score !== first.score) return second.score - first.score;
      return candidateOrder(first.candidate) - candidateOrder(second.candidate);
    })[0].candidate;
}
