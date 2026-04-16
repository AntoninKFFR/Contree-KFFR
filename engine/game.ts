import { createDeck, formatCard, sameCard, shuffleDeck, sortHand } from "./cards";
import { playerName } from "./players";
import {
  getLegalCards,
  getTrickWinner,
  isLegalCard,
  nextPlayer,
  playerTeam,
  trickPoints,
} from "./rules";
import type { Bid, BidValue, Card, Contract, GameState, PlayerId, Suit, TeamId } from "./types";

function dealHands(deck: Card[]): GameState["hands"] {
  return {
    0: deck.slice(0, 8),
    1: deck.slice(8, 16),
    2: deck.slice(16, 24),
    3: deck.slice(24, 32),
  };
}

export function createInitialGame(random = Math.random): GameState {
  const deck = shuffleDeck(createDeck(), random);

  return {
    phase: "bidding",
    trump: null,
    hands: dealHands(deck),
    currentPlayerId: 0,
    currentTrick: {
      leaderId: 0,
      cards: [],
    },
    completedTricks: [],
    bids: [],
    contract: null,
    result: null,
    trickPoints: {
      0: 0,
      1: 0,
    },
    roundScore: {
      0: 0,
      1: 0,
    },
    message: "Phase d'annonces: Anto commence.",
  };
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
  const bid = bids
    .filter((item): item is Extract<Bid, { action: "bid" }> => item.action === "bid")
    .sort((first, second) => second.value - first.value)[0];

  if (!bid) {
    return null;
  }

  return {
    playerId: bid.playerId,
    teamId: playerTeam(bid.playerId),
    value: bid.value,
    trump: bid.trump,
  };
}

function isHigherBid(value: BidValue, currentContract: Contract | null): boolean {
  return !currentContract || value > currentContract.value;
}

function scoreFinishedRound(
  contract: Contract,
  trickPointsByTeam: Record<TeamId, number>,
): GameState["result"] {
  const takerTeam = contract.teamId;
  const defenderTeam = takerTeam === 0 ? 1 : 0;
  const takerPoints = trickPointsByTeam[takerTeam];
  const defenderPoints = trickPointsByTeam[defenderTeam];
  const contractSucceeded = takerPoints >= contract.value;
  const roundScore: Record<TeamId, number> = contractSucceeded
    ? {
        ...trickPointsByTeam,
        [takerTeam]: takerPoints + contract.value,
      }
    : {
        0: 0,
        1: 0,
        [defenderTeam]: 162 + contract.value,
      };

  return {
    kind: "played",
    contract,
    takerPoints,
    defenderPoints,
    contractSucceeded,
    roundScore,
  };
}

function finishBidding(state: GameState, bids: Bid[]): GameState {
  const contract = currentHighestBid(bids);

  if (!contract) {
    const roundScore = { 0: 0, 1: 0 } as Record<TeamId, number>;
    return {
      ...state,
      phase: "finished",
      bids,
      result: {
        kind: "all-pass",
        roundScore,
      },
      roundScore,
      message: "Tout le monde passe. Relance une nouvelle partie.",
    };
  }

  return {
    ...state,
    phase: "playing",
    bids,
    contract,
    trump: contract.trump,
    hands: sortHandsForTrump(state.hands, contract.trump),
    currentPlayerId: 0,
    currentTrick: {
      leaderId: 0,
      cards: [],
    },
    message: `${playerName(contract.playerId)} prend a ${contract.value}. Anto commence.`,
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

  const nextBids: Bid[] = [...state.bids, { playerId, ...bid }];

  if (nextBids.length === 4) {
    return finishBidding(state, nextBids);
  }

  const next = nextPlayer(playerId);
  return {
    ...state,
    bids: nextBids,
    currentPlayerId: next,
    message:
      bid.action === "pass"
        ? `${playerName(playerId)} passe. A ${playerName(next)} de parler.`
        : `${playerName(playerId)} annonce ${bid.value}. A ${playerName(next)} de parler.`,
  };
}

export function getCurrentContract(state: GameState): Contract | null {
  return currentHighestBid(state.bids);
}

export function playableCardsForCurrentPlayer(state: GameState): Card[] {
  if (state.phase !== "playing") {
    return [];
  }

  return getLegalCards(state.hands[state.currentPlayerId], state.currentTrick);
}

export function playCard(state: GameState, playerId: PlayerId, card: Card): GameState {
  if (state.phase === "finished") {
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

  if (!isLegalCard(hand, state.currentTrick, card)) {
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
  const phase = isLastTrick ? "finished" : "playing";
  const result = phase === "finished" ? scoreFinishedRound(state.contract, trickPointsByTeam) : null;

  return {
    ...state,
    phase,
    hands: nextHands,
    currentPlayerId: winnerId,
    currentTrick: {
      leaderId: winnerId,
      cards: [],
    },
    completedTricks,
    trickPoints: trickPointsByTeam,
    result,
    roundScore: result?.kind === "played" ? result.roundScore : state.roundScore,
    message:
      phase === "finished"
        ? result?.kind === "played" && result.contractSucceeded
          ? `Contrat reussi. ${playerName(winnerId)} gagne le dernier pli.`
          : `Contrat chute. ${playerName(winnerId)} gagne le dernier pli.`
        : `${playerName(winnerId)} remporte le pli et rejoue.`,
  };
}

export function resetGame(random = Math.random): GameState {
  return createInitialGame(random);
}
