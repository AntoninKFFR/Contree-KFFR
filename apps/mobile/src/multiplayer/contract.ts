import type { MultiplayerRoomView } from "../../../../lib/roomTypes";
import { parsePlayerGameView, parsePublicSettings, uuidPattern } from "../solo/contract";
import { isMultiplayerTablePreferences } from "../../../../lib/multiplayerTablePreferences";
export type { MultiplayerRoomView, RoomIntent, RoomPlayerAction } from "../../../../lib/roomTypes";

export class RoomFailure extends Error {
  constructor(message: string, readonly status = 0, readonly code = "network") { super(message); }
}
function invalid(): never { throw new RoomFailure("Réponse de table invalide. Recharge la table.", 502, "invalid_response"); }
const object = (v: unknown): Record<string, unknown> => v && typeof v === "object" && !Array.isArray(v) ? v as Record<string, unknown> : invalid();
const string = (v: unknown): string => typeof v === "string" && v.length <= 500 ? v : invalid();
const bool = (v: unknown): boolean => typeof v === "boolean" ? v : invalid();
const integer = (v: unknown, max = Number.MAX_SAFE_INTEGER): number => Number.isSafeInteger(v) && Number(v) >= 0 && Number(v) <= max ? Number(v) : invalid();
const nullableString = (v: unknown) => v === null ? null : string(v);
function choice<T extends string>(v: unknown, values: readonly T[]): T { return values.includes(v as T) ? v as T : invalid(); }
export function roomId(value: unknown): string { const id = string(value); return uuidPattern.test(id) ? id : invalid(); }

/** Whitelist the public wire schema. Never propagate a DB/realtime row into UI. */
export function parseRoom(value: unknown): MultiplayerRoomView {
  const v = object(value), r = object(v.room);
  if ("hands" in v || "host_user_id" in r || "active_game_id" in r) invalid();
  if (!Array.isArray(v.players) || v.players.length !== 4) invalid();
  const players = v.players.map((raw) => {
    const p = object(raw);
    if ("user_id" in p) invalid();
    return { seat_index: integer(p.seat_index, 3) as 0 | 1 | 2 | 3, kind: choice(p.kind, ["human", "bot", "empty"]),
      display_name: nullableString(p.display_name), is_ready: bool(p.is_ready), is_connected: bool(p.is_connected),
      bot_takeover: bool(p.bot_takeover), is_host: bool(p.is_host), rating: p.rating === null ? null : integer(p.rating),
      rank: nullableString(p.rank), is_ranked: bool(p.is_ranked) };
  });
  if (new Set(players.map((p) => p.seat_index)).size !== 4) invalid();
  const viewerSeatIndex = v.viewerSeatIndex === null ? null : integer(v.viewerSeatIndex, 3) as 0 | 1 | 2 | 3;
  const game = v.game === null ? null : parsePlayerGameView(v.game);
  if (game && (viewerSeatIndex === null || game.viewerPlayerId !== viewerSeatIndex)) invalid();
  if (viewerSeatIndex !== null && players.find((p) => p.seat_index === viewerSeatIndex)?.kind !== "human") invalid();
  const scoring_mode = choice(r.scoring_mode, ["ffb", "announced-points", "made-points"]), target_score = integer(r.target_score, 100000);
  if (!target_score) invalid();
  const rules = r.ruleset_snapshot == null ? null : parsePublicSettings({ scoringMode: scoring_mode, targetScore: target_score, ruleset: r.ruleset_snapshot }).ruleset;
  if (r.presentation_settings != null && !isMultiplayerTablePreferences(r.presentation_settings)) invalid();
  return { room: { id: roomId(r.id), code: string(r.code), status: choice(r.status, ["lobby", "playing", "finished", "cancelled"]),
    scoring_mode, target_score, ruleset_id: r.ruleset_id == null ? null : string(r.ruleset_id),
    ruleset_version: r.ruleset_version == null ? null : integer(r.ruleset_version), ruleset_snapshot: rules,
    presentation_settings: r.presentation_settings == null ? null : { ...r.presentation_settings },
    game_phase: r.game_phase === null ? null : choice(r.game_phase, ["bidding", "playing", "finished", "game-over"] as const),
    state_version: integer(r.state_version), turn_deadline_at: nullableString(r.turn_deadline_at),
    created_at: string(r.created_at), updated_at: string(r.updated_at), started_at: nullableString(r.started_at), finished_at: nullableString(r.finished_at) },
    gameId: v.gameId === null ? null : roomId(v.gameId), players, viewerSeatIndex, game,
    isHost: bool(v.isHost), canClaimHost: bool(v.canClaimHost) };
}
