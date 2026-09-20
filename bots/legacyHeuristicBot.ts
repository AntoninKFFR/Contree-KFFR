import { playableCardsForCurrentPlayer } from "@/engine/game";
import { SUITS } from "@/engine/cards";
import { cardPoints, compareCards, getTrickWinner, playerTeam } from "@/engine/rules";
import type { BidValue, Card, GameState, PlayerId, Suit, Trick } from "@/engine/types";

export type HandEvaluation = {
  trump: Suit;
  totalPoints: number;
  trumpCount: number;
  strongTrumpCount: number;
  aceCount: number;
  tenCount: number;
  shortSuitCount: number;
  score: number;
};

export type BidDecision = {
  action: "pass" | "bid";
  trump?: Suit;
  value?: BidValue;
  confidence: number;
  reason: string;
};

type CardChoiceContext = {
  playerId: PlayerId;
  playableCards: Card[];
  trick: Trick;
  trump: Suit;
};

const STRONG_TRUMP_RANKS = new Set<Card["rank"]>(["J", "9", "A"]);
const STRONG_NORMAL_RANKS = new Set<Card["rank"]>(["A", "10"]);

function cardPlayCost(card: Card, trump: Suit): number {
  const points = cardPoints(card, trump);

  if (card.suit !== trump) {
    return points;
  }

  // Un atout utile vaut plus que ses points bruts: on evite donc de le jeter
  // tant qu'il n'aide pas vraiment a gagner le pli.
  const preserveBonus = STRONG_TRUMP_RANKS.has(card.rank) ? 18 : 8;
  return points + preserveBonus;
}

function compareByLowestCost(first: Card, second: Card, trump: Suit): number {
  const costDiff = cardPlayCost(first, trump) - cardPlayCost(second, trump);
  if (costDiff !== 0) return costDiff;
  return cardPoints(first, trump) - cardPoints(second, trump);
}

function compareByHighestLeadValue(first: Card, second: Card, trump: Suit): number {
  const firstValue = leadValue(first, trump);
  const secondValue = leadValue(second, trump);
  return secondValue - firstValue;
}

function leadValue(card: Card, trump: Suit): number {
  const points = cardPoints(card, trump);

  if (card.suit === trump) {
    if (card.rank === "J") return 45;
    if (card.rank === "9") return 35;
    return points + 10;
  }

  if (card.rank === "A") return 30;
  if (card.rank === "10") return 18;
  return points;
}

function groupBySuit(hand: Card[]): Record<Suit, Card[]> {
  return {
    clubs: hand.filter((card) => card.suit === "clubs"),
    diamonds: hand.filter((card) => card.suit === "diamonds"),
    hearts: hand.filter((card) => card.suit === "hearts"),
    spades: hand.filter((card) => card.suit === "spades"),
  };
}

function currentWinnerOfTrick(trick: Trick, trump: Suit) {
  if (trick.cards.length === 0) {
    return undefined;
  }

  const winnerId = getTrickWinner(trick, trump);
  return trick.cards.find((played) => played.playerId === winnerId);
}

function wouldWinTrick(card: Card, trick: Trick, trump: Suit): boolean {
  const currentWinner = currentWinnerOfTrick(trick, trump);

  if (!currentWinner || trick.cards.length === 0) {
    return true;
  }

  const leadSuit = trick.cards[0].card.suit;
  return compareCards(card, currentWinner.card, leadSuit, trump) > 0;
}

function chooseLowestCost(cards: Card[], trump: Suit): Card {
  return [...cards].sort((first, second) => compareByLowestCost(first, second, trump))[0];
}

function chooseBestLead(cards: Card[], trump: Suit): Card {
  const nonTrumpControls = cards
    .filter((card) => card.suit !== trump && STRONG_NORMAL_RANKS.has(card.rank))
    .sort((first, second) => compareByHighestLeadValue(first, second, trump));

  if (nonTrumpControls.length > 0) {
    return nonTrumpControls[0];
  }

  const lowNonTrumps = cards.filter((card) => card.suit !== trump);
  if (lowNonTrumps.length > 0) {
    return chooseLowestCost(lowNonTrumps, trump);
  }

  return chooseLowestCost(cards, trump);
}

function chooseCardWhenFollowing({ playerId, playableCards, trick, trump }: CardChoiceContext): Card {
  const currentWinner = currentWinnerOfTrick(trick, trump);
  const winningCards = playableCards.filter((card) => wouldWinTrick(card, trick, trump));

  if (!currentWinner) {
    return chooseBestLead(playableCards, trump);
  }

  const partnerIsWinning = playerTeam(currentWinner.playerId) === playerTeam(playerId);

  if (partnerIsWinning) {
    return chooseLowestCost(playableCards, trump);
  }

  if (winningCards.length > 0) {
    return chooseLowestCost(winningCards, trump);
  }

  return chooseLowestCost(playableCards, trump);
}

export function evaluateHand(hand: Card[], trump: Suit): HandEvaluation {
  const suits = groupBySuit(hand);
  const totalPoints = hand.reduce((total, card) => total + cardPoints(card, trump), 0);
  const trumpCards = suits[trump];
  const strongTrumpCount = trumpCards.filter((card) => STRONG_TRUMP_RANKS.has(card.rank)).length;
  const aceCount = hand.filter((card) => card.rank === "A").length;
  const tenCount = hand.filter((card) => card.rank === "10").length;
  const shortSuitCount = SUITS.filter((suit) => suit !== trump && suits[suit].length <= 1).length;

  // Le score melange points reels et potentiel strategique.
  // Exemple: beaucoup d'atouts forts augmente le score meme avant de jouer.
  const score =
    totalPoints +
    trumpCards.length * 5 +
    strongTrumpCount * 12 +
    aceCount * 5 +
    tenCount * 2 +
    shortSuitCount * 3;

  return {
    trump,
    totalPoints,
    trumpCount: trumpCards.length,
    strongTrumpCount,
    aceCount,
    tenCount,
    shortSuitCount,
    score,
  };
}

export function chooseSimpleBid(hand: Card[]): BidDecision {
  const evaluations = SUITS.map((suit) => evaluateHand(hand, suit)).sort(
    (first, second) => second.score - first.score,
  );
  const best = evaluations[0];

  if (best.score < 54) {
    return {
      action: "pass",
      confidence: Math.min(1, Math.max(0, best.score / 80)),
      reason: "Main trop faible pour proposer une enchere simple.",
    };
  }

  const value = best.score >= 86 ? 100 : best.score >= 70 ? 90 : 80;

  return {
    action: "bid",
    trump: best.trump,
    value,
    confidence: Math.min(1, best.score / 110),
    reason: `Meilleur potentiel trouve a ${best.trump}.`,
  };
}

export function chooseCardToPlay(state: GameState): Card {
  if (state.phase !== "playing" || !state.trump) {
    throw new Error("Bot can only choose a card after trump is known.");
  }

  const playableCards = playableCardsForCurrentPlayer(state);

  if (playableCards.length === 0) {
    throw new Error("Bot has no playable card.");
  }

  if (state.currentTrick.cards.length === 0) {
    return chooseBestLead(playableCards, state.trump);
  }

  return chooseCardWhenFollowing({
    playerId: state.currentPlayerId,
    playableCards,
    trick: state.currentTrick,
    trump: state.trump,
  });
}
