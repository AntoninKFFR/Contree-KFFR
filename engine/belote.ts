import { playerTeam } from "./rules";
import type { BeloteState, Card, PlayerId, Suit } from "./types";

export function emptyBeloteState(): BeloteState {
  return { declaration: null, pointsByTeam: { 0: 0, 1: 0 } };
}

export function playBeloteCard(
  state: BeloteState | undefined,
  hand: Card[],
  playerId: PlayerId,
  card: Card,
  trump: Suit,
): BeloteState {
  const current = state ?? emptyBeloteState();
  if (card.suit !== trump || (card.rank !== "K" && card.rank !== "Q")) return current;
  const declaration = current.declaration;

  if (!declaration) {
    const hasKing = hand.some((candidate) => candidate.suit === trump && candidate.rank === "K");
    const hasQueen = hand.some((candidate) => candidate.suit === trump && candidate.rank === "Q");
    if (!hasKing || !hasQueen) return current;
    return {
      ...current,
      declaration: { playerId, teamId: playerTeam(playerId), firstRank: card.rank, completed: false },
    };
  }

  if (
    declaration.playerId !== playerId
    || declaration.completed
    || declaration.firstRank === card.rank
  ) return current;

  return {
    declaration: { ...declaration, completed: true },
    pointsByTeam: { ...current.pointsByTeam, [declaration.teamId]: 20 },
  };
}
