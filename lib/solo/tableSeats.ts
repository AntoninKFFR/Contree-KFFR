import type { PlayerId } from "../../engine/types";
export type TableSeats = { bottom: PlayerId; right: PlayerId; top: PlayerId; left: PlayerId };

export function tableSeatsFor(state: { phase: unknown; viewerPlayerId?: PlayerId }): TableSeats {
  const bottom = state.viewerPlayerId ?? 0;
  return {
    bottom,
    right: ((bottom + 1) % 4) as PlayerId,
    top: ((bottom + 2) % 4) as PlayerId,
    left: ((bottom + 3) % 4) as PlayerId,
  };
}
