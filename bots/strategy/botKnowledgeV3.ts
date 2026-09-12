import { createDeck, sameCard, SUITS } from "@/engine/cards";
import { getTrickWinner, playerTeam } from "@/engine/rules";
import type { Card, GameState, PlayerId, Suit } from "@/engine/types";

const PLAYERS: PlayerId[] = [0, 1, 2, 3];
const NORMAL_ORDER: Card["rank"][] = ["A", "10", "K", "Q", "J", "9", "8", "7"];
const TRUMP_ORDER: Card["rank"][] = ["J", "9", "A", "10", "K", "Q", "8", "7"];

export type PositionKnowledge = {
  leaderId: PlayerId;
  trickPosition: 1 | 2 | 3 | 4;
  partnerId: PlayerId;
  partnerPlaysAfter: boolean;
  currentWinnerId: PlayerId | null;
  partnerWinning: boolean;
  opponentWinning: boolean;
};

export type SuitBelief = {
  weight: number;
  reasons: string[];
};

export type BotKnowledgeV3 = {
  viewerId: PlayerId;
  ownHand: Card[];
  playedCards: Card[];
  visibleCards: Card[];
  unknownCards: Card[];
  remainingCardCounts: Record<PlayerId, number>;
  hardVoidSuits: Record<PlayerId, Suit[]>;
  possibleSuits: Record<PlayerId, Suit[]>;
  playedTrumps: Card[];
  possibleRemainingTrumps: Card[];
  currentTrumpMaster: Card | null;
  unknownTrumpCount: number;
  masterCardsBySuit: Record<Suit, Card | null>;
  ownMasterCards: Card[];
  knownCuttingOpponentsBySuit: Record<Suit, PlayerId[]>;
  partnerKnownCuttingBySuit: Record<Suit, boolean>;
  cutRiskBySuit: Record<Suit, number>;
  position: PositionKnowledge;
  suitBeliefs: Record<PlayerId, Record<Suit, SuitBelief>>;
};

export type BotKnowledgeV3Options = {
  hardConstraints?: boolean;
  softBeliefs?: boolean;
};

function key(card: Card): string {
  return `${card.rank}-${card.suit}`;
}

function playedCards(state: GameState): Card[] {
  return [
    ...state.completedTricks.flatMap((trick) => trick.cards.map((played) => played.card)),
    ...state.currentTrick.cards.map((played) => played.card),
  ];
}

function inferHardVoids(state: GameState): Record<PlayerId, Suit[]> {
  const voids = Object.fromEntries(PLAYERS.map((player) => [player, new Set<Suit>()])) as Record<PlayerId, Set<Suit>>;
  const inspect = (cards: GameState["currentTrick"]["cards"]) => {
    const leadSuit = cards[0]?.card.suit;
    if (!leadSuit) return;
    for (let index = 1; index < cards.length; index += 1) {
      const played = cards[index];
      if (played.card.suit !== leadSuit) voids[played.playerId].add(leadSuit);
      if (
        state.trump &&
        played.card.suit !== leadSuit &&
        played.card.suit !== state.trump &&
        playerTeam(getTrickWinner({ leaderId: cards[0].playerId, cards: cards.slice(0, index) }, state.trump)) !== playerTeam(played.playerId)
      ) {
        voids[played.playerId].add(state.trump);
      }
    }
  };
  state.completedTricks.forEach((trick) => inspect(trick.cards));
  inspect(state.currentTrick.cards);
  return Object.fromEntries(
    PLAYERS.map((player) => [player, SUITS.filter((suit) => voids[player].has(suit))]),
  ) as Record<PlayerId, Suit[]>;
}

function remainingCounts(state: GameState): Record<PlayerId, number> {
  const cardsPlayed = Object.fromEntries(PLAYERS.map((player) => [player, 0])) as Record<PlayerId, number>;
  for (const trick of state.completedTricks) {
    for (const played of trick.cards) cardsPlayed[played.playerId] += 1;
  }
  for (const played of state.currentTrick.cards) cardsPlayed[played.playerId] += 1;
  return Object.fromEntries(PLAYERS.map((player) => [player, 8 - cardsPlayed[player]])) as Record<PlayerId, number>;
}

function sortByPower(cards: Card[], suit: Suit, trump: Suit | null): Card[] {
  const order = suit === trump ? TRUMP_ORDER : NORMAL_ORDER;
  return [...cards].sort((first, second) => order.indexOf(first.rank) - order.indexOf(second.rank));
}

function suitBeliefs(state: GameState): BotKnowledgeV3["suitBeliefs"] {
  const beliefs = Object.fromEntries(PLAYERS.map((player) => [
    player,
    Object.fromEntries(SUITS.map((suit) => [suit, { weight: 1, reasons: [] as string[] }])) as unknown as Record<Suit, SuitBelief>,
  ])) as BotKnowledgeV3["suitBeliefs"];
  let lastBid: Extract<GameState["bids"][number], { action: "bid" }> | null = null;
  for (const bid of state.bids) {
    if (bid.action === "bid" && bid.trump) {
      const belief = beliefs[bid.playerId][bid.trump];
      const strength = 0.35 + Math.max(0, bid.value - 80) / 100;
      belief.weight += strength;
      belief.reasons.push(`annonce ${bid.value} à ${bid.trump}`);
      if (lastBid && playerTeam(lastBid.playerId) === playerTeam(bid.playerId) && lastBid.trump === bid.trump) {
        belief.weight += 0.35;
        belief.reasons.push("soutien du partenaire");
      }
      lastBid = bid;
    } else if (bid.action === "coinche" && state.contract?.trump) {
      const belief = beliefs[bid.playerId][state.contract.trump];
      belief.weight += 0.25;
      belief.reasons.push("coinche défensif");
    } else if (bid.action === "surcoinche" && state.contract?.trump) {
      const belief = beliefs[bid.playerId][state.contract.trump];
      belief.weight += 0.3;
      belief.reasons.push("surcoinche");
    }
  }
  if (state.contract?.trump) {
    beliefs[state.contract.playerId][state.contract.trump].weight += 0.25;
    beliefs[state.contract.playerId][state.contract.trump].reasons.push("preneur");
  }
  return beliefs;
}

export function buildBotKnowledgeV3(
  state: GameState,
  options: BotKnowledgeV3Options = {},
): BotKnowledgeV3 {
  const viewerId = state.currentPlayerId;
  const ownHand = state.hands[viewerId].map((card) => ({ ...card }));
  const played = playedCards(state);
  const visible = [...ownHand, ...played];
  const visibleKeys = new Set(visible.map(key));
  const unknownCards = createDeck().filter((card) => !visibleKeys.has(key(card)));
  const hardVoidSuits = options.hardConstraints === false
    ? Object.fromEntries(PLAYERS.map((player) => [player, []])) as unknown as Record<PlayerId, Suit[]>
    : inferHardVoids(state);
  const counts = remainingCounts(state);
  counts[viewerId] = ownHand.length;
  const masterCardsBySuit = Object.fromEntries(SUITS.map((suit) => [
    suit,
    sortByPower(createDeck().filter((card) => card.suit === suit && !played.some((seen) => sameCard(seen, card))), suit, state.trump)[0] ?? null,
  ])) as Record<Suit, Card | null>;
  const playedTrumps = state.trump ? played.filter((card) => card.suit === state.trump) : [];
  const possibleRemainingTrumps = state.trump
    ? unknownCards.filter((card) => card.suit === state.trump)
    : [];
  const partnerId = ((viewerId + 2) % 4) as PlayerId;
  const currentWinnerId = state.trump && state.currentTrick.cards.length > 0
    ? getTrickWinner(state.currentTrick, state.trump)
    : null;
  const knownCuttingOpponentsBySuit = Object.fromEntries(SUITS.map((suit) => [
    suit,
    PLAYERS.filter((player) => playerTeam(player) !== playerTeam(viewerId) && hardVoidSuits[player].includes(suit)),
  ])) as Record<Suit, PlayerId[]>;
  const partnerKnownCuttingBySuit = Object.fromEntries(
    SUITS.map((suit) => [suit, hardVoidSuits[partnerId].includes(suit)]),
  ) as Record<Suit, boolean>;
  const cutRiskBySuit = Object.fromEntries(SUITS.map((suit) => {
    if (!state.trump || suit === state.trump) return [suit, 0];
    const opponentVoids = knownCuttingOpponentsBySuit[suit].length;
    const shortSuitPressure = unknownCards.filter((card) => card.suit === suit).length <= 2 ? 0.25 : 0;
    return [suit, Math.min(1, opponentVoids * 0.45 + shortSuitPressure)];
  })) as Record<Suit, number>;

  return {
    viewerId,
    ownHand,
    playedCards: played,
    visibleCards: visible,
    unknownCards,
    remainingCardCounts: counts,
    hardVoidSuits,
    possibleSuits: Object.fromEntries(
      PLAYERS.map((player) => [player, SUITS.filter((suit) => !hardVoidSuits[player].includes(suit))]),
    ) as Record<PlayerId, Suit[]>,
    playedTrumps,
    possibleRemainingTrumps,
    currentTrumpMaster: state.trump ? masterCardsBySuit[state.trump] : null,
    unknownTrumpCount: possibleRemainingTrumps.length,
    masterCardsBySuit,
    ownMasterCards: ownHand.filter((card) => {
      const master = masterCardsBySuit[card.suit];
      return Boolean(master && sameCard(master, card));
    }),
    knownCuttingOpponentsBySuit,
    partnerKnownCuttingBySuit,
    cutRiskBySuit,
    position: {
      leaderId: state.currentTrick.leaderId,
      trickPosition: (state.currentTrick.cards.length + 1) as 1 | 2 | 3 | 4,
      partnerId,
      partnerPlaysAfter: !state.currentTrick.cards.some((played) => played.playerId === partnerId),
      currentWinnerId,
      partnerWinning: currentWinnerId !== null && playerTeam(currentWinnerId) === playerTeam(viewerId),
      opponentWinning: currentWinnerId !== null && playerTeam(currentWinnerId) !== playerTeam(viewerId),
    },
    suitBeliefs: options.softBeliefs === false
      ? Object.fromEntries(PLAYERS.map((player) => [player, Object.fromEntries(SUITS.map((suit) => [suit, { weight: 1, reasons: [] }]))])) as unknown as BotKnowledgeV3["suitBeliefs"]
      : suitBeliefs(state),
  };
}

export function cardBeliefWeight(
  knowledge: BotKnowledgeV3,
  playerId: PlayerId,
  card: Card,
  trump: Suit | null,
): number {
  const base = knowledge.suitBeliefs[playerId][card.suit].weight;
  const honorBonus = card.suit === trump && (card.rank === "J" || card.rank === "9") ? 0.35 : 0;
  return Math.max(0.05, base + honorBonus);
}
