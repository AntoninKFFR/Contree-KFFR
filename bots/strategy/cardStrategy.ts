import { playableCardsForCurrentPlayer } from "@/engine/game";
import { cardPoints, compareCards, getTrickWinner, playerTeam } from "@/engine/rules";
import type { Card, GameState, PlayerId, Suit, Trick } from "@/engine/types";
import type { BotProfile } from "@/bots/profiles";
import { buildTrickKnowledge, type TrickKnowledge } from "@/bots/strategy/trickKnowledge";

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
  knowledge: TrickKnowledge;
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

function isMasterCard(card: Card, knowledge: TrickKnowledge): boolean {
  const masterCard = knowledge.masterCardsBySuit[card.suit];
  return Boolean(masterCard && masterCard.rank === card.rank && masterCard.suit === card.suit);
}

function isProtectedPointCard(card: Card, trump: Suit, knowledge: TrickKnowledge): boolean {
  if (card.suit === trump) {
    return STRONG_TRUMP_RANKS.has(card.rank);
  }

  if (!STRONG_NORMAL_RANKS.has(card.rank)) return false;
  if (isMasterCard(card, knowledge) && knowledge.cutRiskBySuit[card.suit].level !== "high") return true;

  return knowledge.cutRiskBySuit[card.suit].level === "low";
}

function preferredDiscardScore(
  card: Card,
  trump: Suit,
  profile: BotProfile,
  knowledge: TrickKnowledge,
): number {
  let score = cardPlayCost(card, trump, profile);

  if (card.suit !== trump && knowledge.deadSuits.includes(card.suit)) {
    score -= 4;
  }

  if (card.suit !== trump && knowledge.weakenedSuits.includes(card.suit)) {
    score -= 2;
  }

  if (card.suit !== trump && knowledge.cutRiskBySuit[card.suit].level === "high") {
    score -= 2;
  }

  if (isMasterCard(card, knowledge)) {
    score += 12;
  }

  if (isProtectedPointCard(card, trump, knowledge)) {
    score += 8;
  }

  return score;
}

function chooseBestDiscard(
  cards: Card[],
  trump: Suit,
  profile: BotProfile,
  knowledge: TrickKnowledge,
): Card {
  return [...cards].sort(
    (first, second) =>
      preferredDiscardScore(first, trump, profile, knowledge) -
      preferredDiscardScore(second, trump, profile, knowledge),
  )[0];
}

function chooseSupportCard(
  cards: Card[],
  trump: Suit,
  profile: BotProfile,
  knowledge: TrickKnowledge,
): Card | null {
  const safePointCards = cards
    .filter((card) => cardPoints(card, trump) >= 10)
    .filter((card) => !isProtectedPointCard(card, trump, knowledge))
    .filter((card) => !isMasterCard(card, knowledge) || knowledge.weakenedSuits.includes(card.suit));

  if (safePointCards.length > 0) {
    return chooseLowestCost(safePointCards, trump, profile);
  }

  return null;
}

function isLateRound(cards: Card[], completedTrickCount: number): boolean {
  return completedTrickCount >= 5 || cards.length <= 3;
}

function chooseLateRoundLead(
  cards: Card[],
  trump: Suit,
  profile: BotProfile,
  knowledge: TrickKnowledge,
): Card | null {
  const nonTrumpMasters = cards
    .filter((card) => card.suit !== trump)
    .filter((card) => isMasterCard(card, knowledge))
    .filter(
      (card) =>
        knowledge.cutRiskBySuit[card.suit].level !== "high" ||
        knowledge.weakenedSuits.includes(card.suit) ||
        knowledge.deadSuits.includes(card.suit),
    );

  if (nonTrumpMasters.length > 0) {
    return chooseHighestLead(nonTrumpMasters, trump, profile, true);
  }

  const cashPointCards = cards
    .filter((card) => cardPoints(card, trump) >= 10)
    .filter((card) => isMasterCard(card, knowledge) || card.suit === trump)
    .filter((card) => card.suit === trump || knowledge.weakenedSuits.includes(card.suit));

  if (cashPointCards.length > 0) {
    return chooseHighestLead(cashPointCards, trump, profile, true);
  }

  const trumpWinners = cards
    .filter((card) => card.suit === trump)
    .filter(
      (card) =>
        knowledge.remainingTrumps.length <= cardsOfSuit(cards, trump).length ||
        STRONG_TRUMP_RANKS.has(card.rank),
    );

  if (trumpWinners.length > 0) {
    return chooseHighestLead(trumpWinners, trump, profile, true);
  }

  return null;
}

function shouldForceWinFromThirdSeat(
  winningCards: Card[],
  trick: Trick,
  trump: Suit,
  isDefending: boolean,
  knowledge: TrickKnowledge,
): boolean {
  if (winningCards.length === 0) return false;

  const trickPointsNow = trick.cards.reduce((total, played) => total + cardPoints(played.card, trump), 0);
  if (isDefending || trickPointsNow >= 10) return true;

  return winningCards.some(
    (card) =>
      !isProtectedPointCard(card, trump, knowledge) ||
      (isMasterCard(card, knowledge) && knowledge.weakenedSuits.includes(card.suit)),
  );
}

function shouldForceWinFromLastSeat(
  winningCards: Card[],
  trick: Trick,
  trump: Suit,
  isDefending: boolean,
  knowledge: TrickKnowledge,
): boolean {
  if (winningCards.length === 0) return false;

  const trickPointsNow = trick.cards.reduce((total, played) => total + cardPoints(played.card, trump), 0);
  if (isDefending || trickPointsNow >= 10) return true;

  const cheapWinningCards = winningCards.filter(
    (card) => !isProtectedPointCard(card, trump, knowledge) || cardPoints(card, trump) <= 4,
  );

  return cheapWinningCards.length > 0;
}

function hasTrumpControl(cards: Card[], trump: Suit): boolean {
  const trumps = cardsOfSuit(cards, trump);
  const hasTopTrump = trumps.some((card) => card.rank === "J" || card.rank === "9");
  return trumps.length >= 4 && hasTopTrump;
}

function shouldDrawTrump(
  cards: Card[],
  trump: Suit,
  playerId: PlayerId,
  isAttacking: boolean,
  knowledge: TrickKnowledge,
): boolean {
  if (!isAttacking) return false;
  const strongTrumps = cardsOfSuit(cards, trump).filter((card) => STRONG_TRUMP_RANKS.has(card.rank));
  const trumpCards = cardsOfSuit(cards, trump);
  if (strongTrumps.length === 0) return false;

  const remainingTrumpCount = knowledge.remainingTrumps.length;
  const solidButNotFullControl =
    trumpCards.length >= 3 && strongTrumps.length >= 2 && remainingTrumpCount >= 4;

  if (!hasTrumpControl(cards, trump) && !solidButNotFullControl) return false;
  if (remainingTrumpCount <= strongTrumps.length) return false;

  const dangerousPointSuits = cards
    .filter(
      (card) =>
        card.suit !== trump &&
        STRONG_NORMAL_RANKS.has(card.rank) &&
        knowledge.cutRiskBySuit[card.suit].level !== "low" &&
        knowledge.cutRiskBySuit[card.suit].level !== "none",
    )
    .map((card) => card.suit);

  const opponentsKnownVoid = SUITS.some(
    (suit) => suit !== trump && knowledge.cutRiskBySuit[suit].knownVoidOpponents.length > 0,
  );

  return dangerousPointSuits.length > 0 || (remainingTrumpCount >= 3 && opponentsKnownVoid);
}

function bestKnowledgeLead(
  cards: Card[],
  trump: Suit,
  profile: BotProfile,
  isAttacking: boolean,
  knowledge: TrickKnowledge,
): Card | null {
  const nonTrumpCards = cards.filter((card) => card.suit !== trump);
  const safeMasterLeads = nonTrumpCards.filter(
    (card) =>
      isMasterCard(card, knowledge) &&
      knowledge.cutRiskBySuit[card.suit].level !== "high" &&
      knowledge.cutRiskBySuit[card.suit].level !== "medium",
  );

  if (safeMasterLeads.length > 0) {
    return chooseHighestLead(safeMasterLeads, trump, profile, isAttacking);
  }

  const weakenedMasterLeads = nonTrumpCards.filter(
    (card) =>
      isMasterCard(card, knowledge) &&
      knowledge.weakenedSuits.includes(card.suit) &&
      knowledge.cutRiskBySuit[card.suit].level !== "high",
  );

  if (weakenedMasterLeads.length > 0) {
    return chooseHighestLead(weakenedMasterLeads, trump, profile, isAttacking);
  }

  const safeLowSuitLeads = nonTrumpCards.filter(
    (card) =>
      !STRONG_NORMAL_RANKS.has(card.rank) &&
      knowledge.cutRiskBySuit[card.suit].level !== "high" &&
      !knowledge.deadSuits.includes(card.suit),
  );

  if (safeLowSuitLeads.length > 0) {
    return chooseLowestCost(safeLowSuitLeads, trump, profile);
  }

  return null;
}

function chooseMainLead(
  cards: Card[],
  trump: Suit,
  playerId: PlayerId,
  profile: BotProfile,
  isAttacking: boolean,
  completedTrickCount: number,
  knowledge: TrickKnowledge,
): Card | null {
  const trumps = cardsOfSuit(cards, trump);
  const strongTrumps = trumps.filter((card) => STRONG_TRUMP_RANKS.has(card.rank));
  const aces = cards.filter((card) => card.suit !== trump && card.rank === "A");
  const earlyRound = completedTrickCount <= 2;

  if (isLateRound(cards, completedTrickCount)) {
    const lateRoundLead = chooseLateRoundLead(cards, trump, profile, knowledge);
    if (lateRoundLead) return lateRoundLead;
  }

  // En attaque, si on controle bien l'atout, tirer atout protege les As
  // contre des coupes futures. On ne le fait pas si le controle est trop faible.
  if (shouldDrawTrump(cards, trump, playerId, isAttacking, knowledge)) {
    return chooseHighestLead(strongTrumps, trump, profile, true);
  }

  const safeAces = aces.filter((card) => {
    const cutRisk = knowledge.cutRiskBySuit[card.suit].level;
    return cutRisk === "none" || cutRisk === "low";
  });

  // En debut de manche, un As a plus de chances de passer car les couleurs
  // sont encore souvent reparties chez les autres joueurs.
  if (safeAces.length > 0 && (earlyRound || !isAttacking)) {
    return chooseHighestLead(safeAces, trump, profile, isAttacking);
  }

  const knowledgeLead = bestKnowledgeLead(cards, trump, profile, isAttacking, knowledge);
  if (knowledgeLead) {
    return knowledgeLead;
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
  playerId: PlayerId,
  profile: BotProfile,
  isAttacking: boolean,
  knowledge: TrickKnowledge,
  completedTrickCount = 0,
): Card {
  if (isMainProfile(profile)) {
    const mainLead = chooseMainLead(
      cards,
      trump,
      playerId,
      profile,
      isAttacking,
      completedTrickCount,
      knowledge,
    );
    if (mainLead) return mainLead;
  }

  const knowledgeLead = bestKnowledgeLead(cards, trump, profile, isAttacking, knowledge);
  if (knowledgeLead) return knowledgeLead;

  const strongNonTrumps = cards
    .filter((card) => card.suit !== trump && STRONG_NORMAL_RANKS.has(card.rank))
    .filter((card) => knowledge.cutRiskBySuit[card.suit].level !== "high")
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

  if (
    trumpPressure.length > 0 &&
    (isAttacking && profile.cardRisk > 1 || shouldDrawTrump(cards, trump, playerId, isAttacking, knowledge))
  ) {
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
  knowledge,
}: CardChoiceContext): Card {
  const currentWinner = currentWinnerOfTrick(trick, trump);
  const winningCards = playableCards.filter((card) => wouldWinTrick(card, trick, trump));
  const trickPosition = trick.cards.length + 1;
  const isThirdPlayer = trickPosition === 3;
  const isLastPlayer = trickPosition === 4;

  if (!currentWinner) {
    return chooseBestLead(
      playableCards,
      trump,
      playerId,
      profile,
      contractTeam === playerTeam(playerId),
      knowledge,
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
      const supportCard = chooseSupportCard(playableCards, trump, profile, knowledge);
      if (supportCard) return supportCard;
    }

    return chooseBestDiscard(playableCards, trump, profile, knowledge);
  }

  const isDefending = contractTeam !== null && contractTeam !== playerTeam(playerId);
  const valuablePointsInTrick = trick.cards.reduce(
    (total, played) => total + cardPoints(played.card, trump),
    0,
  );
  const lateRound = isLateRound(playableCards, completedTrickCount);
  const cheapWinningCards = winningCards.filter(
    (card) => !isProtectedPointCard(card, trump, knowledge) || cardPoints(card, trump) <= 4,
  );
  const masterWinningCards = winningCards.filter(
    (card) => isMasterCard(card, knowledge) || (card.suit === trump && STRONG_TRUMP_RANKS.has(card.rank)),
  );

  if (isLastPlayer && winningCards.length > 0) {
    if (shouldForceWinFromLastSeat(winningCards, trick, trump, isDefending, knowledge)) {
      if (cheapWinningCards.length > 0) {
        return chooseLowestCost(cheapWinningCards, trump, profile);
      }

      return chooseLowestCost(winningCards, trump, profile);
    }

    const safeLosers = playableCards.filter((card) => !isProtectedPointCard(card, trump, knowledge));
    if (safeLosers.length > 0) {
      return chooseBestDiscard(safeLosers, trump, profile, knowledge);
    }
  }

  if (isThirdPlayer && winningCards.length > 0) {
    if (shouldForceWinFromThirdSeat(winningCards, trick, trump, isDefending, knowledge)) {
      if (cheapWinningCards.length > 0) {
        return chooseLowestCost(cheapWinningCards, trump, profile);
      }

      return chooseLowestCost(winningCards, trump, profile);
    }
  }

  if (lateRound && winningCards.length > 0) {
    if (valuablePointsInTrick >= 10 || isDefending) {
      if (cheapWinningCards.length > 0) {
        return chooseLowestCost(cheapWinningCards, trump, profile);
      }

      return chooseLowestCost(winningCards, trump, profile);
    }

    if (isLastPlayer && masterWinningCards.length > 0) {
      return chooseLowestCost(masterWinningCards, trump, profile);
    }
  }

  if (
    winningCards.length > 0 &&
    (isDefending || valuablePointsInTrick >= 10 || profile.cardRisk >= 0.9)
  ) {
    if (cheapWinningCards.length > 0) {
      return chooseLowestCost(cheapWinningCards, trump, profile);
    }

    return chooseLowestCost(winningCards, trump, profile);
  }

  const safeLosers = playableCards.filter((card) => !isProtectedPointCard(card, trump, knowledge));
  const lateRoundPointCards = playableCards.filter(
    (card) =>
      lateRound &&
      cardPoints(card, trump) >= 10 &&
      (isMasterCard(card, knowledge) || knowledge.weakenedSuits.includes(card.suit) || card.suit === trump),
  );
  const nonCashCards = playableCards.filter((card) => !lateRoundPointCards.includes(card));

  if (lateRoundPointCards.length > 0 && winningCards.length === 0 && nonCashCards.length > 0) {
    return chooseBestDiscard(nonCashCards, trump, profile, knowledge);
  }

  if (safeLosers.length > 0) {
    return chooseBestDiscard(safeLosers, trump, profile, knowledge);
  }

  return chooseBestDiscard(playableCards, trump, profile, knowledge);
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
  const knowledge = buildTrickKnowledge(state);

  if (state.currentTrick.cards.length === 0) {
    return chooseBestLead(
      playableCards,
      state.trump,
      state.currentPlayerId,
      profile,
      contractTeam === playerTeam(state.currentPlayerId),
      knowledge,
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
    knowledge,
  });
}
