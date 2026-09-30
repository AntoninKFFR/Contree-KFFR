import type { MultiplayerRoomView } from "@/lib/roomTypes";

/** Invalidate only when the applied view first exposes this terminal game. */
export function shouldInvalidateProgressionForRoomTransition(
  current: MultiplayerRoomView | null,
  next: MultiplayerRoomView,
): boolean {
  if (next.room.status !== "finished" || next.game?.phase !== "game-over") return false;
  return !current || current.room.id !== next.room.id || current.gameId !== next.gameId
    || current.room.status !== "finished" || current.game?.phase !== "game-over";
}
