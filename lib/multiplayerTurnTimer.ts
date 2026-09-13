import type { GameState } from "@/engine/types";
import type { RoomPlayerRow, RoomRow } from "@/lib/roomTypes";
import { inactivePlayerId } from "@/engine/activePlayers";

export const MULTIPLAYER_TURN_TIMEOUT_MS = 45_000;
export const MULTIPLAYER_TICK_INTERVAL_MS = 4_000;

export function turnDeadlineForState(
  state: GameState | null,
  players: RoomPlayerRow[],
  nowMs: number,
): string | null {
  if (!state || (state.phase !== "bidding" && state.phase !== "playing")) return null;
  if (state.phase === "playing" && state.currentPlayerId === inactivePlayerId(state)) return null;
  const current = players.find((player) => player.seat_index === state.currentPlayerId);
  if (!current || current.kind !== "human" || current.bot_takeover) return null;
  return new Date(nowMs + MULTIPLAYER_TURN_TIMEOUT_MS).toISOString();
}

export function isTurnDeadlineExpired(room: RoomRow, nowMs: number): boolean {
  if (room.status !== "playing" || !room.turn_deadline_at) return false;
  const deadlineMs = Date.parse(room.turn_deadline_at);
  return Number.isFinite(deadlineMs) && deadlineMs <= nowMs;
}
