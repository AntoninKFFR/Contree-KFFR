import { RANKS, sameCard } from "./cards";
import { CONTREE_KFFR_RULESET } from "./rulesets/presets";
import type { GameRulesetSnapshot } from "./rulesets/types";
import type { Card, PlayedCard, PlayerId, Suit, TeamId, Trick } from "./types";
import { isTrumpSuit, normalizeContractMode, usesTrumpRanking } from "./contractMode";
import type { ContractModeInput } from "./contractMode";

const NORMAL_POINTS: Record<Card["rank"], number> = {
  "7": 0,
  "8": 0,
  "9": 0,
  J: 2,
  Q: 3,
  K: 4,
  "10": 10,
  A: 11,
};

const TRUMP_POINTS: Record<Card["rank"], number> = {
  "7": 0,
  "8": 0,
  Q: 3,
  K: 4,
  "10": 10,
  A: 11,
  "9": 14,
  J: 20,
};

const NORMAL_STRENGTH: Record<Card["rank"], number> = {
  "7": 0,
  "8": 1,
  "9": 2,
  J: 3,
  Q: 4,
  K: 5,
  "10": 6,
  A: 7,
};

const TRUMP_STRENGTH: Record<Card["rank"], number> = {
  "7": 0,
  "8": 1,
  Q: 2,
  K: 3,
  "10": 4,
  A: 5,
  "9": 6,
  J: 7,
};

export function playerTeam(playerId: PlayerId): TeamId {
  return playerId === 0 || playerId === 2 ? 0 : 1;
}

export function nextPlayer(playerId: PlayerId): PlayerId {
  return ((playerId + 1) % 4) as PlayerId;
}

export function cardStrength(card: Card, mode: ContractModeInput): number {
  return (usesTrumpRanking(card.suit, mode) ? TRUMP_STRENGTH : NORMAL_STRENGTH)[card.rank];
}

export function cardPoints(card: Card, mode: ContractModeInput): number {
  return (usesTrumpRanking(card.suit, mode) ? TRUMP_POINTS : NORMAL_POINTS)[card.rank];
}

export function trickPoints(
  cards: PlayedCard[],
  mode: ContractModeInput,
  isLastTrick: boolean,
  isCapot = false,
  rules: GameRulesetSnapshot["trickScoring"] = CONTREE_KFFR_RULESET.trickScoring,
): number {
  const cardsPoints = cards.reduce((total, played) => total + cardPoints(played.card, mode), 0);
  return isLastTrick
    ? cardsPoints + (isCapot ? rules.capotLastTrickBonus : rules.lastTrickBonus)
    : cardsPoints;
}

export function getRoundCardPointTotal(
  mode: ContractModeInput,
  rules: GameRulesetSnapshot["trickScoring"] = CONTREE_KFFR_RULESET.trickScoring,
  isCapot = false,
): number {
  const cards = (["clubs", "diamonds", "hearts", "spades"] as Suit[]).flatMap((suit) =>
    RANKS.map((rank) => ({ suit, rank } as Card)));
  return cards.reduce((total, card) => total + cardPoints(card, mode), 0)
    + (isCapot ? rules.capotLastTrickBonus : rules.lastTrickBonus);
}

function highestTrumpInTrick(trick: Trick, trump: Suit): Card | null {
  const trumpCards = trick.cards
    .map((played) => played.card)
    .filter((card) => card.suit === trump)
    .sort((first, second) => TRUMP_STRENGTH[second.rank] - TRUMP_STRENGTH[first.rank]);

  return trumpCards[0] ?? null;
}

function strongerTrumps(hand: Card[], trump: Suit, currentBestTrump: Card | null): Card[] {
  const trumpCards = hand.filter((card) => card.suit === trump);

  if (!currentBestTrump) {
    return trumpCards;
  }

  return trumpCards.filter(
    (card) => TRUMP_STRENGTH[card.rank] > TRUMP_STRENGTH[currentBestTrump.rank],
  );
}

type CardPlayRules = GameRulesetSnapshot["cardPlay"];

function legalWhenFollowingSuit(
  hand: Card[],
  matchingSuit: Card[],
  trick: Trick,
  trump: Suit,
  rules: CardPlayRules,
): Card[] {
  if (!rules.mustFollowSuit) return hand;
  const requestedSuit = trick.cards[0].card.suit;
  if (requestedSuit !== trump || !rules.mustRaiseAtTrump) return matchingSuit;
  const higherTrumps = strongerTrumps(hand, trump, highestTrumpInTrick(trick, trump));
  return higherTrumps.length > 0 ? higherTrumps : matchingSuit;
}

function legalWhenVoid(
  hand: Card[],
  trick: Trick,
  playerId: PlayerId,
  trump: Suit,
  rules: CardPlayRules,
): Card[] {
  const trumpCards = hand.filter((card) => card.suit === trump);
  if (trumpCards.length === 0) return hand;

  const currentWinnerId = getTrickWinner(trick, trump);
  const partnerIsWinning = playerTeam(currentWinnerId) === playerTeam(playerId);
  if (partnerIsWinning) {
    return rules.mustTrumpWhenVoid && !rules.allowDiscardWhenPartnerWinning ? trumpCards : hand;
  }

  const currentBestTrump = highestTrumpInTrick(trick, trump);
  const higherTrumps = strongerTrumps(hand, trump, currentBestTrump);
  if (rules.mustOvertrump && currentBestTrump && higherTrumps.length > 0) {
    if (rules.mustTrumpWhenVoid) return higherTrumps;
    return [
      ...hand.filter((card) => card.suit !== trump),
      ...higherTrumps,
    ];
  }

  if (!rules.mustTrumpWhenVoid) return hand;
  if (
    rules.mustOvertrump
    && currentBestTrump
    && higherTrumps.length === 0
    && rules.allowDiscardWhenCannotOvertrump
  ) {
    return hand;
  }
  return trumpCards;
}

export function getLegalCards(
  hand: Card[],
  trick: Trick,
  playerId: PlayerId,
  modeInput: ContractModeInput,
  rules: CardPlayRules = CONTREE_KFFR_RULESET.cardPlay,
): Card[] {
  if (trick.cards.length === 0) {
    return hand;
  }

  const requestedSuit = trick.cards[0].card.suit;
  const matchingSuit = hand.filter((card) => card.suit === requestedSuit);
  const mode = normalizeContractMode(modeInput);

  if (matchingSuit.length > 0) {
    if (!rules.mustFollowSuit) return hand;
    if (mode.kind === "all-trump") {
      if (!rules.mustRaiseAtTrump) return matchingSuit;
      const currentBest = trick.cards
        .map((played) => played.card)
        .filter((card) => card.suit === requestedSuit)
        .sort((a, b) => cardStrength(b, mode) - cardStrength(a, mode))[0] ?? null;
      const higher = matchingSuit.filter((card) =>
        !currentBest || cardStrength(card, mode) > cardStrength(currentBest, mode));
      return higher.length > 0 ? higher : matchingSuit;
    }
    if (mode.kind === "no-trump") return matchingSuit;
    return legalWhenFollowingSuit(hand, matchingSuit, trick, mode.suit, rules);
  }
  if (mode.kind !== "suit") return hand;
  return legalWhenVoid(hand, trick, playerId, mode.suit, rules);
}

export function isLegalCard(
  hand: Card[],
  trick: Trick,
  card: Card,
  playerId: PlayerId,
  mode: ContractModeInput,
  rules: CardPlayRules = CONTREE_KFFR_RULESET.cardPlay,
): boolean {
  return getLegalCards(hand, trick, playerId, mode, rules).some((legalCard) => sameCard(legalCard, card));
}

export function compareCards(
  candidate: Card,
  currentWinner: Card,
  leadSuit: Suit,
  mode: ContractModeInput,
): number {
  const candidateIsTrump = isTrumpSuit(candidate.suit, mode);
  const winnerIsTrump = isTrumpSuit(currentWinner.suit, mode);

  if (candidateIsTrump && !winnerIsTrump) return 1;
  if (!candidateIsTrump && winnerIsTrump) return -1;

  if (candidate.suit !== currentWinner.suit) {
    if (candidate.suit === leadSuit && currentWinner.suit !== leadSuit) return 1;
    return -1;
  }

  const strengths = usesTrumpRanking(candidate.suit, mode) ? TRUMP_STRENGTH : NORMAL_STRENGTH;
  return strengths[candidate.rank] - strengths[currentWinner.rank];
}

export function getTrickWinner(trick: Trick, mode: ContractModeInput): PlayerId {
  if (trick.cards.length === 0) {
    throw new Error("Cannot choose a winner for an empty trick.");
  }

  const leadSuit = trick.cards[0].card.suit;
  let winner = trick.cards[0];

  for (const played of trick.cards.slice(1)) {
    if (compareCards(played.card, winner.card, leadSuit, mode) > 0) {
      winner = played;
    }
  }

  return winner.playerId;
}

export function rankIndex(rank: Card["rank"]): number {
  return RANKS.indexOf(rank);
}
