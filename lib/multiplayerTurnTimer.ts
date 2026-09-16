import type { GameState } from "@/engine/types";
import type { RoomPlayerRow, RoomRow } from "@/lib/roomTypes";
import { inactivePlayerId } from "@/engine/activePlayers";
import { GAME_SPEED_PRESETS } from "@/lib/preferences/playerPreferences";
import { normalizeMultiplayerTablePreferences, type MultiplayerTablePreferences } from "@/lib/multiplayerTablePreferences";

export const MULTIPLAYER_TURN_TIMEOUT_MS = 45_000;
export const MULTIPLAYER_TICK_INTERVAL_MS = 4_000;

export function botPacingDelayMs(
  phase: "bidding" | "playing",
  currentTrickCards: number,
  completedTricks: number,
  settings: MultiplayerTablePreferences,
): number {
  const preset = GAME_SPEED_PRESETS[settings.gameSpeed === "custom" ? "normal" : settings.gameSpeed];
  const actionDelay = phase === "bidding" ? preset.biddingDelayMs : preset.botDelayMs;
  const trickDelay = phase === "playing" && currentTrickCards === 0 && completedTricks > 0
    ? settings.trickDisplayMs : 0;
  return Math.max(actionDelay, trickDelay);
}

// Custom table settings currently store only the trick duration. Use the normal
// thinking pace for custom tables until bot timings become shared settings.
export function botReadyAt(room: RoomRow, state: GameState, players: RoomPlayerRow[]): number | null {
  if (room.status !== "playing" || (state.phase !== "bidding" && state.phase !== "playing")) return null;
  if (state.phase === "playing" && state.currentPlayerId === inactivePlayerId(state)) return null;
  const seat = players.find((player) => player.seat_index === state.currentPlayerId);
  if (!seat || (seat.kind !== "bot" && !seat.bot_takeover)) return null;
  const updatedAt = Date.parse(room.updated_at);
  if (!Number.isFinite(updatedAt)) return null;
  const settings = normalizeMultiplayerTablePreferences(room.presentation_settings);
  return updatedAt + botPacingDelayMs(state.phase, state.currentTrick.cards.length, state.completedTricks.length, settings);
}

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
