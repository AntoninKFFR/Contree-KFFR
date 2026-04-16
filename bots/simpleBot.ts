import { playableCardsForCurrentPlayer } from "@/engine/game";
import { cardPoints } from "@/engine/rules";
import type { Card, GameState } from "@/engine/types";

export function chooseBotCard(state: GameState): Card {
  const playableCards = playableCardsForCurrentPlayer(state);

  if (playableCards.length === 0) {
    throw new Error("Bot has no playable card.");
  }

  // Bot volontairement simple: il joue la carte qui vaut le moins de points.
  // Cela suffit pour une V1 et laisse de la place pour améliorer l'IA plus tard.
  return [...playableCards].sort((first, second) => {
    const pointDiff = cardPoints(first, state.trump) - cardPoints(second, state.trump);
    if (pointDiff !== 0) return pointDiff;
    return first.rank.localeCompare(second.rank);
  })[0];
}

export function isBotPlayer(playerId: GameState["currentPlayerId"]): boolean {
  return playerId !== 0;
}
