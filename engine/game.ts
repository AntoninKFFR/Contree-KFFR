import { createDeck, formatCard, sameCard, shuffleDeck, sortHand } from "./cards";
import {
  getLegalCards,
  getTrickWinner,
  isLegalCard,
  nextPlayer,
  playerTeam,
  trickPoints,
} from "./rules";
import type { Card, GameState, PlayerId, Suit } from "./types";

function dealHands(deck: Card[], trump: Suit): GameState["hands"] {
  return {
    0: sortHand(deck.slice(0, 8), trump),
    1: sortHand(deck.slice(8, 16), trump),
    2: sortHand(deck.slice(16, 24), trump),
    3: sortHand(deck.slice(24, 32), trump),
  };
}

export function createInitialGame(random = Math.random): GameState {
  const trump: Suit = "hearts";
  const deck = shuffleDeck(createDeck(), random);

  return {
    phase: "playing",
    trump,
    hands: dealHands(deck, trump),
    currentPlayerId: 0,
    currentTrick: {
      leaderId: 0,
      cards: [],
    },
    completedTricks: [],
    trickPoints: {
      0: 0,
      1: 0,
    },
    roundScore: {
      0: 0,
      1: 0,
    },
    message: "A toi de jouer.",
  };
}

export function playableCardsForCurrentPlayer(state: GameState): Card[] {
  return getLegalCards(state.hands[state.currentPlayerId], state.currentTrick);
}

export function playCard(state: GameState, playerId: PlayerId, card: Card): GameState {
  if (state.phase === "finished") {
    return state;
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
      message: `Joueur ${playerId + 1} a joue ${formatCard(card)}.`,
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
    roundScore: phase === "finished" ? trickPointsByTeam : state.roundScore,
    message:
      phase === "finished"
        ? `Partie terminee. Le joueur ${winnerId + 1} gagne le dernier pli.`
        : `Le joueur ${winnerId + 1} remporte le pli et rejoue.`,
  };
}

export function resetGame(random = Math.random): GameState {
  return createInitialGame(random);
}
