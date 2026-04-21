import { createDeck, SUITS } from "@/engine/cards";
import { playerTeam } from "@/engine/rules";
import type { Card, GameState, PlayerId, Suit } from "@/engine/types";

const NORMAL_MASTER_ORDER: Card["rank"][] = ["A", "10", "K", "Q", "J", "9", "8", "7"];
const TRUMP_MASTER_ORDER: Card["rank"][] = ["J", "9", "A", "10", "K", "Q", "8", "7"];
const PLAYERS: PlayerId[] = [0, 1, 2, 3];

export type CutRiskLevel = "none" | "low" | "medium" | "high";

export type CutRiskInfo = {
  suit: Suit;
  level: CutRiskLevel;
  knownVoidOpponents: PlayerId[];
  knownVoidPartner: boolean;
  remainingTrumpCount: number;
};

export type TrickKnowledge = {
  voidSuitsByPlayer: Record<PlayerId, Suit[]>;
  playedTrumps: Card[];
  remainingTrumps: Card[];
  masterCardsBySuit: Record<Suit, Card | null>;
  cutRiskBySuit: Record<Suit, CutRiskInfo>;
  deadSuits: Suit[];
  weakenedSuits: Suit[];
};

function cardKey(card: Card): string {
  return `${card.rank}-${card.suit}`;
}

function sortCardsByMasterOrder(cards: Card[], suit: Suit, trump: Suit | null): Card[] {
  const order = suit === trump ? TRUMP_MASTER_ORDER : NORMAL_MASTER_ORDER;
  return [...cards].sort((first, second) => order.indexOf(first.rank) - order.indexOf(second.rank));
}

export function getVisibleCards(state: GameState): Card[] {
  return [
    ...state.hands[state.currentPlayerId],
    ...state.currentTrick.cards.map((played) => played.card),
    ...state.completedTricks.flatMap((trick) => trick.cards.map((played) => played.card)),
  ];
}

export function getPlayedCards(state: GameState): Card[] {
  return [
    ...state.currentTrick.cards.map((played) => played.card),
    ...state.completedTricks.flatMap((trick) => trick.cards.map((played) => played.card)),
  ];
}

export function inferVoidSuitsByPlayer(state: GameState): Record<PlayerId, Suit[]> {
  const voidSuits: Record<PlayerId, Set<Suit>> = {
    0: new Set<Suit>(),
    1: new Set<Suit>(),
    2: new Set<Suit>(),
    3: new Set<Suit>(),
  };

  const markVoidSuits = (cards: GameState["currentTrick"]["cards"]) => {
    if (cards.length < 2) return;

    const leadSuit = cards[0].card.suit;
    for (const played of cards.slice(1)) {
      if (played.card.suit !== leadSuit) {
        voidSuits[played.playerId].add(leadSuit);
      }
    }
  };

  for (const trick of state.completedTricks) {
    markVoidSuits(trick.cards);
  }

  markVoidSuits(state.currentTrick.cards);

  return {
    0: SUITS.filter((suit) => voidSuits[0].has(suit)),
    1: SUITS.filter((suit) => voidSuits[1].has(suit)),
    2: SUITS.filter((suit) => voidSuits[2].has(suit)),
    3: SUITS.filter((suit) => voidSuits[3].has(suit)),
  };
}

export function getPlayedTrumps(state: GameState): Card[] {
  if (!state.trump) return [];

  return getPlayedCards(state).filter((card) => card.suit === state.trump);
}

export function getRemainingTrumps(state: GameState): Card[] {
  if (!state.trump) return [];

  const playedTrumpKeys = new Set(getPlayedTrumps(state).map(cardKey));
  return sortCardsByMasterOrder(
    createDeck().filter((card) => card.suit === state.trump && !playedTrumpKeys.has(cardKey(card))),
    state.trump,
    state.trump,
  );
}

export function getMasterCardsStillOutBySuit(state: GameState): Record<Suit, Card | null> {
  const playedCardKeys = new Set(getPlayedCards(state).map(cardKey));

  return {
    clubs:
      sortCardsByMasterOrder(
        createDeck().filter((card) => card.suit === "clubs" && !playedCardKeys.has(cardKey(card))),
        "clubs",
        state.trump,
      )[0] ?? null,
    diamonds:
      sortCardsByMasterOrder(
        createDeck().filter((card) => card.suit === "diamonds" && !playedCardKeys.has(cardKey(card))),
        "diamonds",
        state.trump,
      )[0] ?? null,
    hearts:
      sortCardsByMasterOrder(
        createDeck().filter((card) => card.suit === "hearts" && !playedCardKeys.has(cardKey(card))),
        "hearts",
        state.trump,
      )[0] ?? null,
    spades:
      sortCardsByMasterOrder(
        createDeck().filter((card) => card.suit === "spades" && !playedCardKeys.has(cardKey(card))),
        "spades",
        state.trump,
      )[0] ?? null,
  };
}

export function getRemainingCardsBySuit(state: GameState): Record<Suit, Card[]> {
  const playedCardKeys = new Set(getPlayedCards(state).map(cardKey));

  return {
    clubs: sortCardsByMasterOrder(
      createDeck().filter((card) => card.suit === "clubs" && !playedCardKeys.has(cardKey(card))),
      "clubs",
      state.trump,
    ),
    diamonds: sortCardsByMasterOrder(
      createDeck().filter((card) => card.suit === "diamonds" && !playedCardKeys.has(cardKey(card))),
      "diamonds",
      state.trump,
    ),
    hearts: sortCardsByMasterOrder(
      createDeck().filter((card) => card.suit === "hearts" && !playedCardKeys.has(cardKey(card))),
      "hearts",
      state.trump,
    ),
    spades: sortCardsByMasterOrder(
      createDeck().filter((card) => card.suit === "spades" && !playedCardKeys.has(cardKey(card))),
      "spades",
      state.trump,
    ),
  };
}

export function getCutRiskBySuit(state: GameState): Record<Suit, CutRiskInfo> {
  const voidSuitsByPlayer = inferVoidSuitsByPlayer(state);
  const remainingTrumps = getRemainingTrumps(state);
  const remainingCardsBySuit = getRemainingCardsBySuit(state);
  const currentTeam = playerTeam(state.currentPlayerId);
  const partnerId = ((state.currentPlayerId + 2) % 4) as PlayerId;

  const buildRisk = (suit: Suit): CutRiskInfo => {
    if (!state.trump || suit === state.trump || remainingTrumps.length === 0) {
      return {
        suit,
        level: "none",
        knownVoidOpponents: [],
        knownVoidPartner: false,
        remainingTrumpCount: remainingTrumps.length,
      };
    }

    const knownVoidOpponents = PLAYERS.filter(
      (playerId) =>
        playerId !== state.currentPlayerId &&
        playerTeam(playerId) !== currentTeam &&
        voidSuitsByPlayer[playerId].includes(suit),
    );
    const knownVoidPartner = voidSuitsByPlayer[partnerId].includes(suit);
    const remainingCount = remainingCardsBySuit[suit].length;

    let level: CutRiskLevel = "low";
    if (knownVoidOpponents.length >= 2) {
      level = "high";
    } else if (knownVoidOpponents.length === 1) {
      level = "medium";
    } else if (remainingCount <= 2) {
      level = "medium";
    }

    if (knownVoidPartner && level === "low") {
      level = "medium";
    }

    return {
      suit,
      level,
      knownVoidOpponents,
      knownVoidPartner,
      remainingTrumpCount: remainingTrumps.length,
    };
  };

  return {
    clubs: buildRisk("clubs"),
    diamonds: buildRisk("diamonds"),
    hearts: buildRisk("hearts"),
    spades: buildRisk("spades"),
  };
}

export function getDeadSuits(state: GameState): Suit[] {
  const remainingCardsBySuit = getRemainingCardsBySuit(state);
  return SUITS.filter((suit) => remainingCardsBySuit[suit].length === 0);
}

export function getWeakenedSuits(state: GameState): Suit[] {
  const remainingCardsBySuit = getRemainingCardsBySuit(state);
  return SUITS.filter((suit) => remainingCardsBySuit[suit].length <= 2);
}

export function buildTrickKnowledge(state: GameState): TrickKnowledge {
  return {
    voidSuitsByPlayer: inferVoidSuitsByPlayer(state),
    playedTrumps: getPlayedTrumps(state),
    remainingTrumps: getRemainingTrumps(state),
    masterCardsBySuit: getMasterCardsStillOutBySuit(state),
    cutRiskBySuit: getCutRiskBySuit(state),
    deadSuits: getDeadSuits(state),
    weakenedSuits: getWeakenedSuits(state),
  };
}
