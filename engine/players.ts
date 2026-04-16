import type { PlayerId } from "./types";

export const PLAYER_NAMES: Record<PlayerId, string> = {
  0: "Moi",
  1: "Bot 2",
  2: "Bot 1 (mon partenaire)",
  3: "Bot 3",
};

export function playerName(playerId: PlayerId): string {
  return PLAYER_NAMES[playerId];
}
