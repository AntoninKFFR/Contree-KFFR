import { cardStrength } from "@/engine/rules";
import type { Card, ContractMode, Suit } from "@/engine/types";
import type { PlayerPreferences } from "./playerPreferences";

function suitIndex(suit: Suit, order: Suit[]): number {
  const index = order.indexOf(suit);
  return index === -1 ? order.length : index;
}

export function sortHandForDisplay(
  cards: Card[],
  preferences: PlayerPreferences["cards"],
  mode: ContractMode | null = null,
): Card[] {
  const result = [...cards];
  if (!preferences.autoSortHand || preferences.sortMode === "manual") return result;
  const effectiveMode: ContractMode = mode ?? { kind: "no-trump" };
  result.sort((first, second) => {
    const suitDifference = suitIndex(first.suit, preferences.suitOrder) - suitIndex(second.suit, preferences.suitOrder);
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
