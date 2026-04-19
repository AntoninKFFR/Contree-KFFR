import { createDeck, sameCard } from "@/engine/cards";
import { playableCardsForCurrentPlayer, playCard } from "@/engine/game";
import { cardPoints, compareCards, getTrickWinner, playerTeam } from "@/engine/rules";
import type { Card, GameState, PlayerId, Suit, TeamId } from "@/engine/types";
import { getBotProfile } from "@/bots/profiles";
import { chooseProfileCardToPlay } from "@/bots/strategy/cardStrategy";

const PLAYERS: PlayerId[] = [0, 1, 2, 3];
const MONTE_CARLO_TOTAL_BUDGET = 80;
const MONTE_CARLO_V2_TOTAL_BUDGET = 96;
const MAX_CANDIDATES = 4;
const MAX_V2_CANDIDATES = 5;

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

function emptyVoidSuits(): Record<PlayerId, Set<Suit>> {
  return {
    0: new Set<Suit>(),
    1: new Set<Suit>(),
    2: new Set<Suit>(),
    3: new Set<Suit>(),
  };
}

function addVoidSuitsFromTrick(
  voidSuits: Record<PlayerId, Set<Suit>>,
  trick: GameState["currentTrick"],
): void {
  if (trick.cards.length < 2) return;

  const leadSuit = trick.cards[0].card.suit;

  for (const played of trick.cards.slice(1)) {
    if (played.card.suit !== leadSuit) {
      voidSuits[played.playerId].add(leadSuit);
    }
  }
}

function inferVoidSuits(state: GameState): Record<PlayerId, Set<Suit>> {
  const voidSuits = emptyVoidSuits();

  for (const trick of state.completedTricks) {
    addVoidSuitsFromTrick(voidSuits, trick);
  }

  addVoidSuitsFromTrick(voidSuits, state.currentTrick);

  return voidSuits;
}

function playerWeightForCard(state: GameState, playerId: PlayerId, card: Card): number {
  if (!state.contract || !state.trump) return 1;

  const isContractTeam = playerTeam(playerId) === state.contract.teamId;
  const isTaker = playerId === state.contract.playerId;
  let weight = 1;

  if (card.suit === state.trump) {
    if (isContractTeam) weight += 0.45;
    if (isTaker) weight += 0.25;
    if (!isContractTeam && state.contract.status !== "normal") weight += 0.15;
  }

  if (card.suit !== state.trump && (card.rank === "A" || card.rank === "10")) {
    weight += isContractTeam ? 0.2 : 0.1;
  }

  return weight;
}

function chooseWeightedPlayer(
  state: GameState,
  card: Card,
  players: PlayerId[],
  random: () => number,
): PlayerId {
  const weightedPlayers = players.map((playerId) => ({
    playerId,
    weight: playerWeightForCard(state, playerId, card),
  }));
  const totalWeight = weightedPlayers.reduce((total, player) => total + player.weight, 0);
  let cursor = random() * totalWeight;

  for (const player of weightedPlayers) {
    cursor -= player.weight;
    if (cursor <= 0) return player.playerId;
  }

  return weightedPlayers[weightedPlayers.length - 1].playerId;
}

function possiblePlayersForCard(
  state: GameState,
  card: Card,
  quotas: Record<PlayerId, number>,
  voidSuits: Record<PlayerId, Set<Suit>>,
): PlayerId[] {
  return PLAYERS.filter(
    (playerId) =>
      playerId !== state.currentPlayerId &&
      quotas[playerId] > 0 &&
      !voidSuits[playerId].has(card.suit),
  );
}

function dealPlausibleHandsV2(
  state: GameState,
  unknownCards: Card[],
  random: () => number,
): GameState["hands"] | null {
  const voidSuits = inferVoidSuits(state);
  const quotas: Record<PlayerId, number> = {
    0: state.currentPlayerId === 0 ? 0 : state.hands[0].length,
    1: state.currentPlayerId === 1 ? 0 : state.hands[1].length,
    2: state.currentPlayerId === 2 ? 0 : state.hands[2].length,
    3: state.currentPlayerId === 3 ? 0 : state.hands[3].length,
  };
  const hands: GameState["hands"] = {
    0: state.currentPlayerId === 0 ? [...state.hands[0]] : [],
    1: state.currentPlayerId === 1 ? [...state.hands[1]] : [],
    2: state.currentPlayerId === 2 ? [...state.hands[2]] : [],
    3: state.currentPlayerId === 3 ? [...state.hands[3]] : [],
  };
  const constrainedCards = shuffleCards(unknownCards, random).sort((first, second) => {
    const firstOptions = possiblePlayersForCard(state, first, quotas, voidSuits).length;
    const secondOptions = possiblePlayersForCard(state, second, quotas, voidSuits).length;
    return firstOptions - secondOptions;
  });

  for (const card of constrainedCards) {
    const eligiblePlayers = possiblePlayersForCard(state, card, quotas, voidSuits);
    const fallbackPlayers = PLAYERS.filter(
      (playerId) => playerId !== state.currentPlayerId && quotas[playerId] > 0,
    );
    const players = eligiblePlayers.length > 0 ? eligiblePlayers : fallbackPlayers;

    if (players.length === 0) return null;

    const playerId = chooseWeightedPlayer(state, card, players, random);
    hands[playerId].push(card);
    quotas[playerId] -= 1;
  }

  return PLAYERS.every((playerId) => quotas[playerId] === 0) ? hands : null;
}

function createPlausibleStateV2(state: GameState, random: () => number): GameState | null {
  const knownCards = knownCardsForCurrentPlayer(state);
  const unknownCards = createDeck().filter((card) => !containsCard(knownCards, card));

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const hands = dealPlausibleHandsV2(state, unknownCards, random);

    if (hands) {
      return {
        ...state,
        hands,
      };
    }
  }

  return createPlausibleState(state, random);
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

function monteCarloV2Candidates(state: GameState, heuristicCard: Card): Card[] {
  if (!state.trump) return [heuristicCard];

  const playableCards = playableCardsForCurrentPlayer(state);
  const winningCards = playableCards.filter((card) => wouldWinCurrentTrick(card, state));
  const losingCards = playableCards.filter((card) => !wouldWinCurrentTrick(card, state));
  const pointCards = playableCards.filter((card) => cardPoints(card, state.trump as Suit) >= 10);

  const candidates = uniqueCards([
    heuristicCard,
    lowestPointCard(playableCards, state.trump),
    highestPointCard(playableCards, state.trump),
    ...(winningCards.length > 0 ? [lowestPointCard(winningCards, state.trump)] : []),
    ...(winningCards.length > 0 ? [highestPointCard(winningCards, state.trump)] : []),
    ...(losingCards.length > 0 ? [lowestPointCard(losingCards, state.trump)] : []),
    ...(pointCards.length > 0 ? [lowestPointCard(pointCards, state.trump)] : []),
  ]);

  return candidates.slice(0, MAX_V2_CANDIDATES);
}

function currentTrickPoints(state: GameState): number {
  if (!state.trump) return 0;

  return state.currentTrick.cards.reduce(
    (total, played) => total + cardPoints(played.card, state.trump as Suit),
    0,
  );
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

function hasContractPressure(state: GameState): boolean {
  if (!state.contract) return false;
  if (state.contract.status !== "normal") return true;

  const contractTeamPoints = state.trickPoints[state.contract.teamId];
  const remainingTricks = 8 - state.completedTricks.length;

  return (
    state.completedTricks.length >= 4 ||
    contractTeamPoints >= state.contract.value - 35 ||
    remainingTricks <= 3
  );
}

function shouldUseMonteCarloV2(state: GameState, playableCards: Card[]): boolean {
  if (playableCards.length <= 1) return false;
  if (state.completedTricks.length >= 7) return false;
  if (!state.trump) return false;

  const partnerAlreadyWinning =
    state.currentTrick.cards.length > 0 &&
    playerTeam(getTrickWinner(state.currentTrick, state.trump)) === playerTeam(state.currentPlayerId);

  if (partnerAlreadyWinning && playableCards.every((card) => cardPoints(card, state.trump as Suit) < 10)) {
    return false;
  }

  const winningCards = playableCards.filter((card) => wouldWinCurrentTrick(card, state));
  const losingCards = playableCards.filter((card) => !wouldWinCurrentTrick(card, state));
  const pointSpread =
    cardPoints(highestPointCard(playableCards, state.trump), state.trump) -
    cardPoints(lowestPointCard(playableCards, state.trump), state.trump);

  return (
    currentTrickPoints(state) >= 10 ||
    (winningCards.length > 0 && losingCards.length > 0) ||
    hasContractPressure(state) ||
    pointSpread >= 10 ||
    playableCards.length >= 4
  );
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

function teamScoreV2(state: GameState, teamId: TeamId): number {
  const opponentTeam = teamId === 0 ? 1 : 0;
  const trickDiff = state.trickPoints[teamId] - state.trickPoints[opponentTeam];

  if (state.result?.kind === "played") {
    const contractTeam = state.result.contract.teamId;
    const contractWeight = state.result.contract.value * state.result.multiplier;
    const roundDiff =
      state.result.roundScore[teamId] - state.result.roundScore[opponentTeam];

    if (contractTeam === teamId) {
      return state.result.contractSucceeded
        ? roundDiff + contractWeight * 1.5 + trickDiff * 0.2
        : roundDiff - contractWeight * 1.8 + trickDiff * 0.2;
    }

    return state.result.contractSucceeded
      ? roundDiff - contractWeight * 1.5 + trickDiff * 0.2
      : roundDiff + contractWeight * 1.8 + trickDiff * 0.2;
  }

  return trickDiff;
}

function immediateCandidateAdjustment(state: GameState, candidate: Card, teamId: TeamId): number {
  if (!state.trump) return 0;

  const points = cardPoints(candidate, state.trump);
  const wins = wouldWinCurrentTrick(candidate, state);
  const trickValue = currentTrickPoints(state) + points;

  if (state.currentTrick.cards.length === 0) {
    return points >= 10 && state.contract?.teamId !== teamId ? -points * 0.25 : 0;
  }

  const currentWinnerId = getTrickWinner(state.currentTrick, state.trump);
  const partnerIsWinning = playerTeam(currentWinnerId) === teamId;

  if (!wins && !partnerIsWinning && points >= 10) {
    return -points * 0.9;
  }

  if (wins && trickValue >= 10) {
    return trickValue * 0.35;
  }

  if (partnerIsWinning && points >= 10) {
    return points * 0.25;
  }

  return 0;
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

function scoreCandidateV2(
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
    const plausibleState = createPlausibleStateV2(state, random);

    if (!plausibleState) continue;

    const afterCandidate = playCard(plausibleState, plausibleState.currentPlayerId, candidate);
    const finalState = rolloutRound(afterCandidate);

    totalScore +=
      teamScoreV2(finalState, teamId) +
      immediateCandidateAdjustment(state, candidate, teamId);
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

export function chooseMonteCarloV2CardToPlay(
  state: GameState,
  options: MonteCarloOptions = {},
): Card {
  const heuristicCard = chooseProfileCardToPlay(state, getBotProfile("main"));
  const playableCards = playableCardsForCurrentPlayer(state);

  if (!shouldUseMonteCarloV2(state, playableCards)) {
    return heuristicCard;
  }

  const candidates = monteCarloV2Candidates(state, heuristicCard);
  const samplesPerCandidate = Math.max(
    1,
    Math.floor((options.totalBudget ?? MONTE_CARLO_V2_TOTAL_BUDGET) / candidates.length),
  );
  const baseSeed = hashVisibleState(state) ^ 0x9e3779b9;

  return candidates
    .map((candidate) => ({
      card: candidate,
      score: scoreCandidateV2(state, candidate, samplesPerCandidate, baseSeed),
    }))
    .sort((first, second) => second.score - first.score)[0].card;
}
