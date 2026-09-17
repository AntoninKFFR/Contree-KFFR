import { getMasterCardsStillOutBySuit, inferVoidSuitsByPlayer } from "@/bots/strategy/trickKnowledge";
import { playableCardsForCurrentPlayer } from "@/engine/game";
import { cardPoints, cardStrength, compareCards, getTrickWinner, playerTeam } from "@/engine/rules";
import { resolveContractMode } from "@/engine/contractMode";
import type { Card, ContractMode, GameState, Suit } from "@/engine/types";

function sameCard(a: Card, b: Card): boolean {
  return a.rank === b.rank && a.suit === b.suit;
}

function cheapest(cards: Card[], mode: ContractMode): Card {
  return [...cards].sort((a, b) =>
    cardPoints(a, mode) - cardPoints(b, mode)
    || cardStrength(a, mode) - cardStrength(b, mode)
    || a.suit.localeCompare(b.suit))[0];
}

function chooseLead(state: GameState, legal: Card[], mode: ContractMode): Card {
  const masters = getMasterCardsStillOutBySuit(state);
  const hand = state.hands[state.currentPlayerId];
  const defending = state.contract?.teamId !== playerTeam(state.currentPlayerId);
  const voids = inferVoidSuitsByPlayer(state);
  const opponents = ([0, 1, 2, 3] as const).filter((player) => playerTeam(player) !== playerTeam(state.currentPlayerId));
  const safeMasters = legal.filter((card) => sameCard(card, masters[card.suit] ?? card)
    && masters[card.suit] !== null
    && !opponents.some((player) => voids[player].includes(card.suit)));
  if (safeMasters.length) {
    // In SA an Ace controls the suit; in TA the Jack does. Cash a master
    // before an exposed Ten or Nine can be lost.
    return [...safeMasters].sort((a, b) =>
      cardPoints(b, mode) - cardPoints(a, mode)
      || hand.filter((card) => card.suit === b.suit).length - hand.filter((card) => card.suit === a.suit).length)[0];
  }
  const scored = legal.map((card) => {
    const length = hand.filter((held) => held.suit === card.suit).length;
    const master = masters[card.suit];
    const control = master && sameCard(card, master);
    const vulnerablePoints = cardPoints(card, mode) >= 10 && !control;
    const shortSuit = length <= 2;
    const strength = cardStrength(card, mode);
    const score = (control ? 12 : 0)
      + (!defending && length >= 3 ? 2 : 0)
      + (defending && shortSuit && mode.kind === "suit" ? 3 : 0)
      - (vulnerablePoints ? 12 : 0)
      - strength * 0.4;
    return { card, score };
  });
  scored.sort((a, b) => b.score - a.score || cardPoints(a.card, mode) - cardPoints(b.card, mode));
  return scored[0].card;
}

/** Legal, visible-information-only card doctrine for SA and TA. */
export function chooseAdvancedModeCard(state: GameState): Card {
  const mode = resolveContractMode(state);
  if (state.phase !== "playing" || !mode || mode.kind === "suit") {
    throw new Error("Cette stratégie exige un contrat Sans Atout ou Tout Atout.");
  }
  const legal = playableCardsForCurrentPlayer(state);
  if (legal.length === 1) return legal[0];
  const trick = state.currentTrick;
  if (!trick.cards.length) return chooseLead(state, legal, mode);

  const winner = getTrickWinner(trick, mode);
  const partnerWinning = playerTeam(winner) === playerTeam(state.currentPlayerId);
  const leadSuit: Suit = trick.cards[0].card.suit;
  const winningCard = trick.cards.find((played) => played.playerId === winner)!.card;
  const winners = legal.filter((card) => compareCards(card, winningCard, leadSuit, mode) > 0);
  const losers = legal.filter((card) => !winners.includes(card));
  const trickPoints = trick.cards.reduce((sum, played) => sum + cardPoints(played.card, mode), 0);
  const specialContract = state.contract?.kind === "capot" || state.contract?.kind === "generale";

  if (partnerWinning) {
    if (trick.cards.length === 3) {
      const safeFeed = losers.filter((card) => cardPoints(card, mode) >= 10);
      if (safeFeed.length) return [...safeFeed].sort((a, b) => cardPoints(b, mode) - cardPoints(a, mode))[0];
    }
    return cheapest(losers.length ? losers : legal, mode);
  }
  if (winners.length && (specialContract || trickPoints >= 8 || trick.cards.length >= 2)) {
    return cheapest(winners, mode);
  }
  return cheapest(losers.length ? losers : legal, mode);
}
