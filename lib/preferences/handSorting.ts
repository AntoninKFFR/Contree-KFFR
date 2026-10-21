import { cardStrength } from "@/engine/rules";
import { getCurrentContractFromBids } from "@/engine/bidding";
import { resolveContractMode } from "@/engine/contractMode";
import type { Bid, Card, ContractMode, Suit } from "@/engine/types";
import type { PlayerPreferences } from "./playerPreferences";

/** Display only: a selected, unannounced suit never changes the hand order. */
export function handDisplayMode(game: { phase: string; bids: Bid[]; contractMode?: ContractMode | null; trump?: Suit | null }): ContractMode | null {
  return game.phase === "bidding"
    ? resolveContractMode(getCurrentContractFromBids(game.bids) ?? {})
    : resolveContractMode(game);
}

function suitIndex(suit: Suit, order: Suit[]): number {
  const index = order.indexOf(suit);
  return index === -1 ? order.length : index;
}

function suitColor(suit: Suit): "red" | "black" {
  return suit === "hearts" || suit === "diamonds" ? "red" : "black";
}

function effectiveSuitOrder(cards: Card[], preferredOrder: Suit[]): Suit[] {
  const present = new Set(cards.map((card) => card.suit));
  const orderedPresent = preferredOrder.filter((suit) => present.has(suit));
  for (const card of cards) {
    if (!orderedPresent.includes(card.suit)) orderedPresent.push(card.suit);
  }
  if (orderedPresent.length < 3) return orderedPresent;

  const red = orderedPresent.filter((suit) => suitColor(suit) === "red");
  const black = orderedPresent.filter((suit) => suitColor(suit) === "black");
  if (orderedPresent.length === 3) {
    const majority = red.length === 2 ? red : black;
    const isolated = red.length === 1 ? red[0] : black[0];
    return [majority[0], isolated, majority[1]];
  }

  const firstColor = suitColor(orderedPresent[0]);
  const first = firstColor === "red" ? red : black;
  const second = firstColor === "red" ? black : red;
  return [first[0], second[0], first[1], second[1]];
}

export function sortHandForDisplay(
  cards: Card[],
  preferences: PlayerPreferences["cards"],
  mode: ContractMode | null = null,
): Card[] {
  const result = [...cards];
  if (!preferences.autoSortHand) return result;
  const effectiveMode: ContractMode = mode ?? { kind: "no-trump" };
  const displaySuitOrder = preferences.sortMode === "suit-rank"
    ? effectiveSuitOrder(cards, preferences.suitOrder)
    : preferences.suitOrder;
  result.sort((first, second) => {
    const suitDifference = suitIndex(first.suit, displaySuitOrder) - suitIndex(second.suit, displaySuitOrder);
    const rankDifference = cardStrength(second, effectiveMode) - cardStrength(first, effectiveMode);
    return preferences.sortMode === "suit-rank"
      ? suitDifference || rankDifference
      : rankDifference || suitDifference;
  });
  return result;
}

export function moveSuit(order: Suit[], suit: Suit, direction: -1 | 1): Suit[] {
  const next = [...order];
  const index = next.indexOf(suit);
  const destination = index + direction;
  if (index < 0 || destination < 0 || destination >= next.length) return next;
  [next[index], next[destination]] = [next[destination], next[index]];
  return next;
}
