import { playerTeam } from "./rules";
import { normalizeContractMode } from "./contractMode";
import type { ContractModeInput } from "./contractMode";
import type { BeloteState, Card, PlayerId } from "./types";

export function emptyBeloteState(): BeloteState {
  return { declaration: null, pointsByTeam: { 0: 0, 1: 0 } };
}

export function playBeloteCard(
  state: BeloteState | undefined,
  hand: Card[],
  playerId: PlayerId,
  card: Card,
  modeInput: ContractModeInput,
  points = 20,
  allowInAllTrump = false,
): BeloteState {
  const current = state ?? emptyBeloteState();
  const mode = normalizeContractMode(modeInput);
  if (mode.kind === "no-trump" || (mode.kind === "all-trump" && !allowInAllTrump)) return current;
  if ((mode.kind === "suit" && card.suit !== mode.suit) || (card.rank !== "K" && card.rank !== "Q")) return current;
  const suit = card.suit;
  if (mode.kind === "all-trump") {
    const declarations = current.declarations ?? (current.declaration?.suit ? [current.declaration as NonNullable<BeloteState["declarations"]>[number]] : []);
    const declaration = declarations.find((item) => item.playerId === playerId && item.suit === suit);
    if (!declaration) {
      const hasKing = hand.some((candidate) => candidate.suit === suit && candidate.rank === "K");
      const hasQueen = hand.some((candidate) => candidate.suit === suit && candidate.rank === "Q");
      if (!hasKing || !hasQueen) return current;
      const next = { playerId, teamId: playerTeam(playerId), firstRank: card.rank, completed: false, suit } as const;
      return { ...current, declaration: current.declaration ?? next, declarations: [...declarations, next] };
    }
    if (declaration.completed || declaration.firstRank === card.rank) return current;
    const completed = { ...declaration, completed: true };
    return {
      ...current,
      declaration: current.declaration === declaration ? completed : current.declaration,
      declarations: declarations.map((item) => item === declaration ? completed : item),
      pointsByTeam: { ...current.pointsByTeam, [declaration.teamId]: current.pointsByTeam[declaration.teamId] + points },
    };
  }
  const trump = mode.suit;
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
    pointsByTeam: { ...current.pointsByTeam, [declaration.teamId]: points },
  };
}
