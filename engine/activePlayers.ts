import type { Contract, GameState, PlayerId } from "./types";

export const PLAYER_IDS: readonly PlayerId[] = [0, 1, 2, 3];

export function inactivePlayerIdForContract(contract: Contract | null | undefined): PlayerId | null {
  return contract?.kind === "generale" ? ((contract.playerId + 2) % 4) as PlayerId : null;
}

export function inactivePlayerId(state: Pick<GameState, "contract">): PlayerId | null {
  return inactivePlayerIdForContract(state.contract);
}

export function activePlayersForRound(state: Pick<GameState, "contract">): PlayerId[] {
  const inactive = inactivePlayerId(state);
  return PLAYER_IDS.filter((playerId) => playerId !== inactive);
}

export function playersRequiredForTrick(state: Pick<GameState, "contract">): number {
  return activePlayersForRound(state).length;
}

export function nextActivePlayer(
  state: Pick<GameState, "contract">,
  playerId: PlayerId,
): PlayerId {
  const active = new Set(activePlayersForRound(state));
  for (let offset = 1; offset <= 4; offset += 1) {
    const candidate = ((playerId + offset) % 4) as PlayerId;
    if (active.has(candidate)) return candidate;
  }
  throw new Error("A round must have at least one active player.");
}

export function tricksWonByPlayer(
  completedTricks: Pick<GameState, "completedTricks">["completedTricks"],
): Record<PlayerId, number> {
  const counts: Record<PlayerId, number> = { 0: 0, 1: 0, 2: 0, 3: 0 };
  for (const trick of completedTricks) counts[trick.winnerId] += 1;
  return counts;
}
