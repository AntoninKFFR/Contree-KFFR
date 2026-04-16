import type { PlayerId } from "./types";

export const PLAYER_NAMES: Record<PlayerId, string> = {
  0: "Anto",
  1: "Max",
  2: "Boulais",
  3: "Allan",
};

export function playerName(playerId: PlayerId): string {
  return PLAYER_NAMES[playerId];
}
