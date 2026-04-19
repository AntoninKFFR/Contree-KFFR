import { createDeck, sameCard } from "@/engine/cards";
import { playableCardsForCurrentPlayer, playCard } from "@/engine/game";
import { cardPoints, compareCards, getTrickWinner, playerTeam } from "@/engine/rules";
import type { Card, GameState, PlayerId, Suit, TeamId } from "@/engine/types";
import { getBotProfile } from "@/bots/profiles";
import { chooseProfileCardToPlay } from "@/bots/strategy/cardStrategy";

const PLAYERS: PlayerId[] = [0, 1, 2, 3];
const MONTE_CARLO_TOTAL_BUDGET = 80;
const MAX_CANDIDATES = 4;

type MonteCarloOptions = {
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

function hashVisibleState(state: GameState): number {
  const currentPlayerHand = state.hands[state.currentPlayerId].map(cardKey).sort().join("|");
  const currentTrick = state.currentTrick.cards
    .map((played) => `${played.playerId}:${cardKey(played.card)}`)
    .join("|");
  const completedTricks = state.completedTricks
    .flatMap((trick) => trick.cards.map((played) => `${played.playerId}:${cardKey(played.card)}`))
    .join("|");
  const text = [
    state.currentPlayerId,
    state.trump,
    state.completedTricks.length,
    currentPlayerHand,
    currentTrick,
    completedTricks,
    state.trickPoints[0],
    state.trickPoints[1],
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

function knownCardsForCurrentPlayer(state: GameState): Card[] {
  return [
    ...state.hands[state.currentPlayerId],
    ...state.currentTrick.cards.map((played) => played.card),
    ...state.completedTricks.flatMap((trick) => trick.cards.map((played) => played.card)),
  ];
}

function createPlausibleState(state: GameState, random: () => number): GameState | null {
  const knownCards = knownCardsForCurrentPlayer(state);
  const unknownCards = createDeck().filter((card) => !containsCard(knownCards, card));
  const shuffledUnknownCards = shuffleCards(unknownCards, random);
  let cursor = 0;

  const hands: GameState["hands"] = {
    0: [...state.hands[0]],
    1: [...state.hands[1]],
    2: [...state.hands[2]],
    3: [...state.hands[3]],
  };

  for (const playerId of PLAYERS) {
    if (playerId === state.currentPlayerId) {
      hands[playerId] = [...state.hands[playerId]];
      continue;
    }

    const cardCount = state.hands[playerId].length;
    hands[playerId] = shuffledUnknownCards.slice(cursor, cursor + cardCount);
    cursor += cardCount;
  }

  if (cursor !== shuffledUnknownCards.length) {
    return null;
  }

  return {
    ...state,
    hands,
  };
}

function currentWinnerCard(state: GameState): Card | null {
  if (!state.trump || state.currentTrick.cards.length === 0) return null;

  const winnerId = getTrickWinner(state.currentTrick, state.trump);
  return state.currentTrick.cards.find((played) => played.playerId === winnerId)?.card ?? null;
}

function wouldWinCurrentTrick(card: Card, state: GameState): boolean {
  if (!state.trump || state.currentTrick.cards.length === 0) return true;

  const currentWinner = currentWinnerCard(state);
  if (!currentWinner) return true;

  return compareCards(card, currentWinner, state.currentTrick.cards[0].card.suit, state.trump) > 0;
}

function lowestPointCard(cards: Card[], trump: Suit): Card {
  return [...cards].sort((first, second) => cardPoints(first, trump) - cardPoints(second, trump))[0];
}

function highestPointCard(cards: Card[], trump: Suit): Card {
  return [...cards].sort((first, second) => cardPoints(second, trump) - cardPoints(first, trump))[0];
}

function uniqueCards(cards: Card[]): Card[] {
  const seen = new Set<string>();
  const unique: Card[] = [];

  for (const card of cards) {
    const key = cardKey(card);
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(card);
    }
  }

  return unique;
}

function monteCarloCandidates(state: GameState, heuristicCard: Card): Card[] {
  if (!state.trump) return [heuristicCard];

  const playableCards = playableCardsForCurrentPlayer(state);
  const winningCards = playableCards.filter((card) => wouldWinCurrentTrick(card, state));
  const losingCards = playableCards.filter((card) => !wouldWinCurrentTrick(card, state));

  const candidates = uniqueCards([
    heuristicCard,
    lowestPointCard(playableCards, state.trump),
    highestPointCard(playableCards, state.trump),
    ...(winningCards.length > 0 ? [lowestPointCard(winningCards, state.trump)] : []),
    ...(losingCards.length > 0 ? [lowestPointCard(losingCards, state.trump)] : []),
  ]);

  return candidates.slice(0, MAX_CANDIDATES);
}

function shouldUseMonteCarlo(state: GameState, playableCards: Card[]): boolean {
  if (playableCards.length <= 1) return false;
  if (state.completedTricks.length >= 7) return false;

  const partnerAlreadyWinning =
    state.trump &&
    state.currentTrick.cards.length > 0 &&
    playerTeam(getTrickWinner(state.currentTrick, state.trump)) === playerTeam(state.currentPlayerId);

  if (partnerAlreadyWinning && playableCards.every((card) => cardPoints(card, state.trump as Suit) < 10)) {
    return false;
  }

  return playableCards.length >= 3 || state.currentTrick.cards.length >= 2;
}

function rolloutRound(state: GameState): GameState {
  let nextState = state;
  const rolloutProfile = getBotProfile("main");
  let guard = 0;

  while (nextState.phase === "playing" && guard < 40) {
    const card = chooseProfileCardToPlay(nextState, rolloutProfile);
    nextState = playCard(nextState, nextState.currentPlayerId, card);
    guard += 1;
  }

  return nextState;
}

function teamScore(state: GameState, teamId: TeamId): number {
  const opponentTeam = teamId === 0 ? 1 : 0;

  if (state.result?.kind === "played") {
    return state.result.roundScore[teamId] - state.result.roundScore[opponentTeam];
  }

  return state.trickPoints[teamId] - state.trickPoints[opponentTeam];
}

function scoreCandidate(
  state: GameState,
  candidate: Card,
  samples: number,
  baseSeed: number,
): number {
  const teamId = playerTeam(state.currentPlayerId);
  let totalScore = 0;
  let completedSamples = 0;

  for (let sampleIndex = 0; sampleIndex < samples; sampleIndex += 1) {
    const random = createSeededRandom(baseSeed + sampleIndex);
    const plausibleState = createPlausibleState(state, random);

    if (!plausibleState) continue;

    const afterCandidate = playCard(plausibleState, plausibleState.currentPlayerId, candidate);
    const finalState = rolloutRound(afterCandidate);

    totalScore += teamScore(finalState, teamId);
    completedSamples += 1;
  }

  return completedSamples === 0 ? Number.NEGATIVE_INFINITY : totalScore / completedSamples;
}

export function chooseMonteCarloCardToPlay(
  state: GameState,
  options: MonteCarloOptions = {},
): Card {
  const heuristicCard = chooseProfileCardToPlay(state, getBotProfile("main"));
  const playableCards = playableCardsForCurrentPlayer(state);

  if (!shouldUseMonteCarlo(state, playableCards)) {
    return heuristicCard;
  }

  const candidates = monteCarloCandidates(state, heuristicCard);
  const samplesPerCandidate = Math.max(
    1,
    Math.floor((options.totalBudget ?? MONTE_CARLO_TOTAL_BUDGET) / candidates.length),
  );
  const baseSeed = hashVisibleState(state);

  return candidates
    .map((candidate) => ({
      card: candidate,
      score: scoreCandidate(state, candidate, samplesPerCandidate, baseSeed),
    }))
    .sort((first, second) => second.score - first.score)[0].card;
}
