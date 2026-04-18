import { playableCardsForCurrentPlayer } from "@/engine/game";
import { cardPoints, compareCards, getTrickWinner, playerTeam } from "@/engine/rules";
import type { Card, GameState, PlayerId, Suit, Trick } from "@/engine/types";
import type { BotProfile } from "@/bots/profiles";

const STRONG_TRUMP_RANKS = new Set<Card["rank"]>(["J", "9", "A"]);
const STRONG_NORMAL_RANKS = new Set<Card["rank"]>(["A", "10"]);

type CardChoiceContext = {
  playerId: PlayerId;
  playableCards: Card[];
  trick: Trick;
  trump: Suit;
  profile: BotProfile;
  contractTeam: ReturnType<typeof playerTeam> | null;
  completedTrickCount: number;
};

const SUITS: Suit[] = ["clubs", "diamonds", "hearts", "spades"];

function cardPlayCost(card: Card, trump: Suit, profile: BotProfile): number {
  const points = cardPoints(card, trump);

  if (card.suit !== trump) {
    return points + (STRONG_NORMAL_RANKS.has(card.rank) ? 4 * profile.preserveStrongCards : 0);
  }

  const preserveBonus = STRONG_TRUMP_RANKS.has(card.rank) ? 18 : 8;
  return points + preserveBonus * profile.preserveStrongCards;
}

function compareByLowestCost(first: Card, second: Card, trump: Suit, profile: BotProfile): number {
  const costDiff = cardPlayCost(first, trump, profile) - cardPlayCost(second, trump, profile);
  if (costDiff !== 0) return costDiff;
  return cardPoints(first, trump) - cardPoints(second, trump);
}

function leadValue(card: Card, trump: Suit, profile: BotProfile, isAttacking: boolean): number {
  const points = cardPoints(card, trump);
  const attackBonus = isAttacking ? 5 * profile.cardRisk : 0;

  if (card.suit === trump) {
    if (card.rank === "J") return 45 + attackBonus;
    if (card.rank === "9") return 35 + attackBonus;
    return points + 10 + attackBonus;
  }

  if (card.rank === "A") return 30 + attackBonus;
  if (card.rank === "10") return 18 + attackBonus;
  return points;
}

function currentWinnerOfTrick(trick: Trick, trump: Suit) {
  if (trick.cards.length === 0) return undefined;

  const winnerId = getTrickWinner(trick, trump);
  return trick.cards.find((played) => played.playerId === winnerId);
}

function wouldWinTrick(card: Card, trick: Trick, trump: Suit): boolean {
  const currentWinner = currentWinnerOfTrick(trick, trump);

  if (!currentWinner || trick.cards.length === 0) return true;

  const leadSuit = trick.cards[0].card.suit;
  return compareCards(card, currentWinner.card, leadSuit, trump) > 0;
}

function chooseLowestCost(cards: Card[], trump: Suit, profile: BotProfile): Card {
  return [...cards].sort((first, second) => compareByLowestCost(first, second, trump, profile))[0];
}

function isMainProfile(profile: BotProfile): boolean {
  return profile.id === "main";
}

function cardsOfSuit(cards: Card[], suit: Suit): Card[] {
  return cards.filter((card) => card.suit === suit);
}

function chooseHighestLead(cards: Card[], trump: Suit, profile: BotProfile, isAttacking: boolean): Card {
  return [...cards].sort(
    (first, second) =>
      leadValue(second, trump, profile, isAttacking) -
      leadValue(first, trump, profile, isAttacking),
  )[0];
}

function hasTrumpControl(cards: Card[], trump: Suit): boolean {
  const trumps = cardsOfSuit(cards, trump);
  const hasTopTrump = trumps.some((card) => card.rank === "J" || card.rank === "9");
  return trumps.length >= 4 && hasTopTrump;
}

function chooseMainLead(
  cards: Card[],
  trump: Suit,
  profile: BotProfile,
  isAttacking: boolean,
  completedTrickCount: number,
): Card | null {
  const trumps = cardsOfSuit(cards, trump);
  const strongTrumps = trumps.filter((card) => STRONG_TRUMP_RANKS.has(card.rank));
  const aces = cards.filter((card) => card.suit !== trump && card.rank === "A");
  const earlyRound = completedTrickCount <= 2;

  // En attaque, si on controle bien l'atout, tirer atout protege les As
  // contre des coupes futures. On ne le fait pas si le controle est trop faible.
  if (isAttacking && hasTrumpControl(cards, trump) && strongTrumps.length > 0) {
    return chooseHighestLead(strongTrumps, trump, profile, true);
  }

  // En debut de manche, un As a plus de chances de passer car les couleurs
  // sont encore souvent reparties chez les autres joueurs.
  if (aces.length > 0 && (earlyRound || !isAttacking)) {
    return chooseHighestLead(aces, trump, profile, isAttacking);
  }

  if (!isAttacking) {
    const shortNonTrumpSuits = SUITS.filter(
      (suit) => suit !== trump && cardsOfSuit(cards, suit).length === 1,
    );
    const shortSuitCards = shortNonTrumpSuits.flatMap((suit) => cardsOfSuit(cards, suit));

    // En defense, jouer une couleur courte peut preparer une coupe plus tard.
    if (shortSuitCards.length > 0) {
      return chooseLowestCost(shortSuitCards, trump, profile);
    }
  }

  return null;
}

function chooseBestLead(
  cards: Card[],
  trump: Suit,
  profile: BotProfile,
  isAttacking: boolean,
  completedTrickCount = 0,
): Card {
  if (isMainProfile(profile)) {
    const mainLead = chooseMainLead(cards, trump, profile, isAttacking, completedTrickCount);
    if (mainLead) return mainLead;
  }

  const strongNonTrumps = cards
    .filter((card) => card.suit !== trump && STRONG_NORMAL_RANKS.has(card.rank))
    .sort(
      (first, second) =>
        leadValue(second, trump, profile, isAttacking) -
        leadValue(first, trump, profile, isAttacking),
    );

  if (strongNonTrumps.length > 0) {
    return strongNonTrumps[0];
  }

  const trumpPressure = cards
    .filter((card) => card.suit === trump && STRONG_TRUMP_RANKS.has(card.rank))
    .sort(
      (first, second) =>
        leadValue(second, trump, profile, isAttacking) -
        leadValue(first, trump, profile, isAttacking),
    );

  if (isAttacking && profile.cardRisk > 1 && trumpPressure.length > 0) {
    return trumpPressure[0];
  }

  const lowNonTrumps = cards.filter((card) => card.suit !== trump);
  if (lowNonTrumps.length > 0) {
    return chooseLowestCost(lowNonTrumps, trump, profile);
  }

  return chooseLowestCost(cards, trump, profile);
}

function chooseCardWhenFollowing({
  contractTeam,
  playerId,
  playableCards,
  profile,
  trick,
  trump,
  completedTrickCount,
}: CardChoiceContext): Card {
  const currentWinner = currentWinnerOfTrick(trick, trump);
  const winningCards = playableCards.filter((card) => wouldWinTrick(card, trick, trump));

  if (!currentWinner) {
    return chooseBestLead(
      playableCards,
      trump,
      profile,
      contractTeam === playerTeam(playerId),
      completedTrickCount,
    );
  }

  const partnerIsWinning = playerTeam(currentWinner.playerId) === playerTeam(playerId);
  if (partnerIsWinning) {
    const pointsInTrick = trick.cards.reduce(
      (total, played) => total + cardPoints(played.card, trump),
      0,
    );
    const pointCards = playableCards.filter((card) => cardPoints(card, trump) >= 10);

    // Si le partenaire tient deja un pli interessant, le bot principal peut
    // donner des points au camp, mais il garde ses gros atouts.
    if (isMainProfile(profile) && pointsInTrick >= 10 && pointCards.length > 0) {
      return chooseLowestCost(pointCards, trump, profile);
    }

    return chooseLowestCost(playableCards, trump, profile);
  }

  const isDefending = contractTeam !== null && contractTeam !== playerTeam(playerId);
  const valuablePointsInTrick = trick.cards.reduce(
    (total, played) => total + cardPoints(played.card, trump),
    0,
  );

  if (
    winningCards.length > 0 &&
    (isDefending || valuablePointsInTrick >= 10 || profile.cardRisk >= 0.9)
  ) {
    return chooseLowestCost(winningCards, trump, profile);
  }

  return chooseLowestCost(playableCards, trump, profile);
}

export function chooseProfileCardToPlay(state: GameState, profile: BotProfile): Card {
  if (state.phase !== "playing" || !state.trump) {
    throw new Error("Bot can only choose a card after trump is known.");
  }

  const playableCards = playableCardsForCurrentPlayer(state);

  if (playableCards.length === 0) {
    throw new Error("Bot has no playable card.");
  }

  const contractTeam = state.contract?.teamId ?? null;

  if (state.currentTrick.cards.length === 0) {
    return chooseBestLead(
      playableCards,
      state.trump,
      profile,
      contractTeam === playerTeam(state.currentPlayerId),
      state.completedTricks.length,
    );
  }

  return chooseCardWhenFollowing({
    contractTeam,
    playerId: state.currentPlayerId,
    playableCards,
    profile,
    trick: state.currentTrick,
    trump: state.trump,
    completedTrickCount: state.completedTricks.length,
  });
}
