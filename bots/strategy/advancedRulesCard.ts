import { chooseAdvancedMonteCarloCardToPlay, chooseMonteCarloCardToPlay } from "@/bots/strategy/monteCarloCardStrategy";
import { buildTrickKnowledge, getMasterCardsStillOutBySuit, getRemainingTrumps } from "@/bots/strategy/trickKnowledge";
import { playableCardsForCurrentPlayer } from "@/engine/game";
import { resolveContractMode } from "@/engine/contractMode";
import { cardPoints, cardStrength, playerTeam } from "@/engine/rules";
import type { Card, GameState, Suit } from "@/engine/types";

function sameCard(a: Card, b: Card | null): boolean {
  return Boolean(b && a.rank === b.rank && a.suit === b.suit);
}

function justifiedDefensiveTrumpLead(state: GameState, trump: Suit, chosen: Card): boolean {
  if (state.completedTricks.length < 5) return false;
  const masters = getMasterCardsStillOutBySuit(state);
  const trumpCards = state.hands[state.currentPlayerId].filter((card) => card.suit === trump);
  const remainingOutsideHand = getRemainingTrumps(state).length - trumpCards.length;
  // With J/9 control late in the round and at most one unseen enemy trump,
  // a master lead can cash our atouts instead of gifting a free purge.
  return sameCard(chosen, masters[trump]) && trumpCards.length >= 2 && remainingOutsideHand <= 1;
}

function bestDefensiveAlternative(state: GameState, cards: Card[], trump: Suit): Card {
  const masters = getMasterCardsStillOutBySuit(state);
  const hand = state.hands[state.currentPlayerId];
  return [...cards].sort((a, b) => {
    const score = (card: Card) => {
      const master = sameCard(card, masters[card.suit]);
      const length = hand.filter((held) => held.suit === card.suit).length;
      return (master ? 16 : 0)
        + (length === 1 ? 4 : 0)
        - (cardPoints(card, { kind: "suit", suit: trump }) >= 10 && !master ? 12 : 0)
        - cardStrength(card, { kind: "suit", suit: trump }) * 0.3;
    };
    return score(b) - score(a) || a.suit.localeCompare(b.suit);
  })[0];
}

export function avoidLeadingUnderSafeOwnAce(state: GameState, chosen: Card): Card {
  const mode = resolveContractMode(state);
  const contract = state.contract;
  if (state.phase !== "playing" || mode?.kind !== "suit" || !contract
    || state.currentTrick.cards.length !== 0
    || contract.kind === "capot" || contract.kind === "generale"
    || contract.status !== "normal"
    || contract.teamId !== playerTeam(state.currentPlayerId)
    || chosen.suit === mode.suit || chosen.rank === "A") return chosen;

  const ace = playableCardsForCurrentPlayer(state).find(
    (card) => card.suit === chosen.suit && card.rank === "A",
  );
  if (!ace) return chosen;

  const knowledge = buildTrickKnowledge(state);
  const risk = knowledge.cutRiskBySuit[chosen.suit];
  if (!sameCard(ace, knowledge.masterCardsBySuit[chosen.suit])
    || risk.level === "high" || risk.knownVoidOpponents.length > 0) return chosen;

  return ace;
}

/** Experimental card choice, preserving the proven V1 path for ordinary suit contracts. */
export function chooseAdvancedRulesCard(state: GameState): Card {
  const mode = resolveContractMode(state);
  if (state.phase !== "playing" || !mode) throw new Error("Playing contract required.");
  const contract = state.contract;
  if (mode.kind === "suit" && contract && state.currentTrick.cards.length === 0
    && (contract.kind === "capot" || contract.kind === "generale")
    && contract.teamId === playerTeam(state.currentPlayerId)
    && (contract.kind !== "generale" || contract.playerId === state.currentPlayerId)) {
    const trumps = state.hands[state.currentPlayerId].filter((card) => card.suit === mode.suit);
    const remainingOutsideHand = getRemainingTrumps(state).length - trumps.length;
    const master = getMasterCardsStillOutBySuit(state)[mode.suit];
    // With an all-tricks objective, cash the certain master trump first until
    // opposing trumps are exhausted; otherwise a side master can be cut.
    if (remainingOutsideHand > 0 && master
      && playableCardsForCurrentPlayer(state).some((card) => sameCard(card, master))) return master;
  }
  if (mode.kind === "suit" && contract && state.currentTrick.cards.length === 0
    && contract.teamId !== playerTeam(state.currentPlayerId)) {
    const master = getMasterCardsStillOutBySuit(state)[mode.suit];
    if (master && playableCardsForCurrentPlayer(state).some((card) => sameCard(card, master))
      && justifiedDefensiveTrumpLead(state, mode.suit, master)) return master;
  }
  const objectiveIsSpecial = contract?.kind === "capot" || contract?.kind === "generale"
    || contract?.status === "coinched" || contract?.status === "surcoinched";
  const chosen = mode.kind !== "suit" || objectiveIsSpecial
    ? chooseAdvancedMonteCarloCardToPlay(state)
    : chooseMonteCarloCardToPlay(state);
  const attackingLead = avoidLeadingUnderSafeOwnAce(state, chosen);
  if (!sameCard(attackingLead, chosen)) return attackingLead;
  if (mode.kind !== "suit" || !contract || state.currentTrick.cards.length !== 0
    || contract.teamId === playerTeam(state.currentPlayerId) || chosen.suit !== mode.suit) return chosen;

  const alternatives = playableCardsForCurrentPlayer(state).filter((card) => card.suit !== mode.suit);
  if (alternatives.length === 0 || justifiedDefensiveTrumpLead(state, mode.suit, chosen)) return chosen;
  return bestDefensiveAlternative(state, alternatives, mode.suit);
}
