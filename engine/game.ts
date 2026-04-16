import { createDeck, formatCard, sameCard, shuffleDeck, sortHand } from "./cards";
import { canCoinche, canSurcoinche } from "./bidding";
import { playerName } from "./players";
import {
  getLegalCards,
  getTrickWinner,
  isLegalCard,
  nextPlayer,
  playerTeam,
  trickPoints,
} from "./rules";
import { scoreRound } from "./scoring";
import type {
  Bid,
  BidValue,
  Card,
  Contract,
  GameSettings,
  GameState,
  PlayerId,
  Suit,
  TeamId,
} from "./types";

function defaultTargetScore(scoringMode: GameSettings["scoringMode"]): number {
  return scoringMode === "announced-points" ? 500 : 1000;
}

function resolveSettings(settings: Partial<GameSettings>): GameSettings {
  const scoringMode = settings.scoringMode ?? "made-points";

  return {
    scoringMode,
    targetScore: settings.targetScore ?? defaultTargetScore(scoringMode),
  };
}

function emptyScore(): Record<TeamId, number> {
  return { 0: 0, 1: 0 };
}

function randomPlayer(random: () => number): PlayerId {
  return Math.floor(random() * 4) as PlayerId;
}

function nextStartingPlayer(playerId: PlayerId): PlayerId {
  return nextPlayer(playerId);
}

function dealHands(deck: Card[]): GameState["hands"] {
  return {
    0: sortHand(deck.slice(0, 8)),
    1: sortHand(deck.slice(8, 16)),
    2: sortHand(deck.slice(16, 24)),
    3: sortHand(deck.slice(24, 32)),
  };
}

export function createInitialGame(
  random = Math.random,
  settings: Partial<GameSettings> = {},
): GameState {
  const startingPlayerId = randomPlayer(random);

  return createRoundState({
    random,
    settings: resolveSettings(settings),
    roundHistory: [],
    roundNumber: 1,
    startingPlayerId,
    totalScore: emptyScore(),
    winnerTeam: null,
  });
}

function createRoundState({
  random,
  roundHistory,
  roundNumber,
  settings,
  startingPlayerId,
  totalScore,
  winnerTeam,
}: {
  random: () => number;
  roundHistory: GameState["roundHistory"];
  roundNumber: number;
  settings: GameSettings;
  startingPlayerId: PlayerId;
  totalScore: Record<TeamId, number>;
  winnerTeam: TeamId | null;
}): GameState {
  const deck = shuffleDeck(createDeck(), random);

  return {
    settings,
    phase: "bidding",
    roundNumber,
    startingPlayerId,
    totalScore,
    roundHistory,
    winnerTeam,
    trump: null,
    hands: dealHands(deck),
    currentPlayerId: startingPlayerId,
    currentTrick: {
      leaderId: startingPlayerId,
      cards: [],
    },
    completedTricks: [],
    bids: [],
    contract: null,
    result: null,
    trickPoints: emptyScore(),
    roundScore: emptyScore(),
    message: `Manche ${roundNumber}: phase d'annonces, ${playerName(startingPlayerId)} commence.`,
  };
}

function addScores(
  first: Record<TeamId, number>,
  second: Record<TeamId, number>,
): Record<TeamId, number> {
  return {
    0: first[0] + second[0],
    1: first[1] + second[1],
  };
}

function winningTeam(totalScore: Record<TeamId, number>, targetScore: number): TeamId | null {
  if (totalScore[0] >= targetScore && totalScore[0] >= totalScore[1]) return 0;
  if (totalScore[1] >= targetScore && totalScore[1] >= totalScore[0]) return 1;
  return null;
}

function finishRound(state: GameState, result: GameState["result"], baseMessage: string): GameState {
  if (!result) {
    return state;
  }

  const totalScore = addScores(state.totalScore, result.roundScore);
  const winnerTeam = winningTeam(totalScore, state.settings.targetScore);
  const roundHistory = [
    ...state.roundHistory,
    {
      roundNumber: state.roundNumber,
      result,
      totalScoreAfterRound: totalScore,
    },
  ];

  return {
    ...state,
    phase: winnerTeam === null ? "finished" : "game-over",
    result,
    roundScore: result.roundScore,
    totalScore,
    roundHistory,
    winnerTeam,
    message:
      winnerTeam === null
        ? `${baseMessage} Lance la manche suivante.`
        : `${baseMessage} Partie terminee: ${teamLabel(winnerTeam)} gagne.`,
  };
}

function teamLabel(teamId: TeamId): string {
  return teamId === 0 ? "Anto + Boulais" : "Max + Allan";
}

function sortHandsForTrump(hands: GameState["hands"], trump: Suit): GameState["hands"] {
  return {
    0: sortHand(hands[0], trump),
    1: sortHand(hands[1], trump),
    2: sortHand(hands[2], trump),
    3: sortHand(hands[3], trump),
  };
}

function currentHighestBid(bids: Bid[]): Contract | null {
  let contract: Contract | null = null;

  for (const bid of bids) {
    if (bid.action === "bid") {
      contract = {
        playerId: bid.playerId,
        teamId: playerTeam(bid.playerId),
        value: bid.value,
        trump: bid.trump,
        status: "normal",
      };
    }

    if (bid.action === "coinche" && contract) {
      contract = {
        ...contract,
        status: "coinched",
        coinchedBy: bid.playerId,
        surcoinchedBy: undefined,
      };
    }

    if (bid.action === "surcoinche" && contract) {
      contract = {
        ...contract,
        status: "surcoinched",
        surcoinchedBy: bid.playerId,
      };
    }
  }

  return contract;
}

function isHigherBid(value: BidValue, currentContract: Contract | null): boolean {
  return !currentContract || value > currentContract.value;
}

function isAllPassWithoutContract(bids: Bid[]): boolean {
  return bids.length === 4 && bids.every((bid) => bid.action === "pass");
}

function contractHolderAnsweredCoinche(bids: Bid[], contract: Contract): boolean {
  if (contract.status !== "coinched" || contract.coinchedBy === undefined) {
    return true;
  }

  const lastCoincheIndex = bids.findLastIndex((bid) => bid.action === "coinche");
  return bids.slice(lastCoincheIndex + 1).some((bid) => bid.playerId === contract.playerId);
}

function finishBidding(state: GameState, bids: Bid[]): GameState {
  const contract = currentHighestBid(bids);

  if (!contract) {
    const roundScore = { 0: 0, 1: 0 } as Record<TeamId, number>;
    return finishRound(
      {
        ...state,
        bids,
      },
      {
        kind: "all-pass",
        roundScore,
      },
      "Tout le monde passe.",
    );
  }

  return {
    ...state,
    phase: "playing",
    bids,
    contract,
    trump: contract.trump,
    hands: sortHandsForTrump(state.hands, contract.trump),
    currentPlayerId: contract.playerId,
    currentTrick: {
      leaderId: contract.playerId,
      cards: [],
    },
    message: `${playerName(contract.playerId)} prend a ${contract.value} et commence.`,
  };
}

export function makeBid(
  state: GameState,
  playerId: PlayerId,
  bid:
    | {
        action: "pass";
      }
    | {
        action: "bid";
        value: BidValue;
        trump: Suit;
      }
    | {
        action: "coinche";
      }
    | {
        action: "surcoinche";
      },
): GameState {
  if (state.phase !== "bidding") {
    throw new Error("Bids are only allowed during the bidding phase.");
  }

  if (state.currentPlayerId !== playerId) {
    throw new Error(`It is player ${state.currentPlayerId}'s bid turn, not player ${playerId}.`);
  }

  const currentContract = currentHighestBid(state.bids);

  if (bid.action === "bid" && !isHigherBid(bid.value, currentContract)) {
    throw new Error("A new bid must be higher than the current contract.");
  }

  if (bid.action === "coinche" && !canCoinche(playerId, currentContract)) {
    throw new Error("This player cannot coinche the current contract.");
  }

  if (bid.action === "surcoinche" && !canSurcoinche(playerId, currentContract)) {
    throw new Error("This player cannot surcoinche the current contract.");
  }

  const nextBids: Bid[] = [...state.bids, { playerId, ...bid }];

  const next = nextPlayer(playerId);
  const nextContract = currentHighestBid(nextBids);

  if (
    isAllPassWithoutContract(nextBids) ||
    bid.action === "surcoinche" ||
    (bid.action === "pass" &&
      nextContract?.status === "coinched" &&
      nextContract.playerId === playerId) ||
    (nextContract?.playerId === next && contractHolderAnsweredCoinche(nextBids, nextContract))
  ) {
    return finishBidding(state, nextBids);
  }

  return {
    ...state,
    bids: nextBids,
    currentPlayerId: next,
    message:
      bid.action === "pass"
        ? `${playerName(playerId)} passe. A ${playerName(next)} de parler.`
        : bid.action === "bid"
          ? `${playerName(playerId)} annonce ${bid.value}. A ${playerName(next)} de parler.`
          : bid.action === "coinche"
            ? `${playerName(playerId)} coinche. A ${playerName(next)} de parler.`
            : `${playerName(playerId)} surcoinche. A ${playerName(next)} de parler.`,
  };
}

export function getCurrentContract(state: GameState): Contract | null {
  return currentHighestBid(state.bids);
}

export function playableCardsForCurrentPlayer(state: GameState): Card[] {
  if (state.phase !== "playing") {
    return [];
  }

  if (!state.trump) {
    return [];
  }

  return getLegalCards(
    state.hands[state.currentPlayerId],
    state.currentTrick,
    state.currentPlayerId,
    state.trump,
  );
}

export function playCard(state: GameState, playerId: PlayerId, card: Card): GameState {
  if (state.phase === "finished" || state.phase === "game-over") {
    return state;
  }

  if (state.phase !== "playing" || !state.trump || !state.contract) {
    throw new Error("Cards can only be played after a contract has been chosen.");
  }

  if (state.currentPlayerId !== playerId) {
    throw new Error(`It is player ${state.currentPlayerId}'s turn, not player ${playerId}'s turn.`);
  }

  const hand = state.hands[playerId];
  if (!hand.some((handCard) => sameCard(handCard, card))) {
    throw new Error(`Player ${playerId} does not have ${formatCard(card)}.`);
  }

  if (!isLegalCard(hand, state.currentTrick, card, playerId, state.trump)) {
    throw new Error(`The card ${formatCard(card)} is not legal for this trick.`);
  }

  const nextHand = hand.filter((handCard) => !sameCard(handCard, card));
  const nextHands = {
    ...state.hands,
    [playerId]: nextHand,
  };
  const nextTrick = {
    ...state.currentTrick,
    cards: [...state.currentTrick.cards, { playerId, card }],
  };

  if (nextTrick.cards.length < 4) {
    const next = nextPlayer(playerId);
    return {
      ...state,
      hands: nextHands,
      currentTrick: nextTrick,
      currentPlayerId: next,
      message: `${playerName(playerId)} a joue ${formatCard(card)}.`,
    };
  }

  const winnerId = getTrickWinner(nextTrick, state.trump);
  const winnerTeam = playerTeam(winnerId);
  const isLastTrick = nextHands[0].length === 0;
  const points = trickPoints(nextTrick.cards, state.trump, isLastTrick);
  const trickPointsByTeam = {
    ...state.trickPoints,
    [winnerTeam]: state.trickPoints[winnerTeam] + points,
  };
  const completedTricks = [
    ...state.completedTricks,
    {
      ...nextTrick,
      winnerId,
      points,
    },
  ];
  const result =
    isLastTrick
      ? scoreRound({
          contract: state.contract,
          settings: state.settings,
          trickPointsByTeam,
        })
      : null;

  const nextState: GameState = {
    ...state,
    phase: isLastTrick ? "finished" : "playing",
    hands: nextHands,
    currentPlayerId: winnerId,
    currentTrick: {
      leaderId: winnerId,
      cards: [],
    },
    completedTricks,
    trickPoints: trickPointsByTeam,
    result: result ?? state.result,
    roundScore: result?.kind === "played" ? result.roundScore : state.roundScore,
    message:
      isLastTrick
        ? result?.kind === "played" && result.contractSucceeded
          ? `Contrat reussi. ${playerName(winnerId)} gagne le dernier pli.`
          : `Contrat chute. ${playerName(winnerId)} gagne le dernier pli.`
        : `${playerName(winnerId)} remporte le pli et rejoue.`,
  };

  if (!isLastTrick || !result) {
    return nextState;
  }

  return finishRound(
    nextState,
    result,
    result.contractSucceeded
      ? `Contrat reussi. ${playerName(winnerId)} gagne le dernier pli.`
      : `Contrat chute. ${playerName(winnerId)} gagne le dernier pli.`,
  );
}

export function resetGame(random = Math.random): GameState {
  return createInitialGame(random);
}

export function startNextRound(state: GameState, random = Math.random): GameState {
  if (state.phase !== "finished") {
    return state;
  }

  return createRoundState({
    random,
    settings: state.settings,
    roundHistory: state.roundHistory,
    roundNumber: state.roundNumber + 1,
    startingPlayerId: nextStartingPlayer(state.startingPlayerId),
    totalScore: state.totalScore,
    winnerTeam: null,
  });
}

export function getDefaultTargetScore(scoringMode: GameSettings["scoringMode"]): number {
  return defaultTargetScore(scoringMode);
}
