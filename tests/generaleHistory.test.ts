import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createInitialGame } from "@/engine/game";
import { scoreRound } from "@/engine/scoring";
import { createTestRuleset } from "@/tests/helpers/rulesets";
import { buildSavedGamePayload } from "@/lib/games";
import { buildMultiplayerArchive } from "@/lib/multiplayerHistory";
import type { Contract, GameState, PlayerId } from "@/engine/types";
import type { RoomPlayerRow, RoomRow } from "@/lib/roomTypes";

const rules = createTestRuleset({ bidding: { allowGenerale: true } });
const contract: Contract = { kind: "generale", value: 500, playerId: 0, teamId: 0, trump: "hearts", contractMode: { kind: "suit", suit: "hearts" }, status: "normal" };

function completed(): GameState {
  const result = scoreRound({ contract, settings: { scoringMode: "ffb", targetScore: 500, ruleset: rules }, trickPointsByTeam: { 0: 100, 1: 0 }, tricksWonByTeam: { 0: 8, 1: 0 }, tricksWonByPlayer: { 0: 8, 1: 0, 2: 0, 3: 0 } });
  const state = createInitialGame(() => 0, { ruleset: rules });
  return { ...state, phase: "game-over", winnerTeam: 0, contract, result, roundHistory: [{ roundNumber: 1, result, totalScoreAfterRound: { 0: 500, 1: 0 } }], playerNames: { 0: "Antonin", 1: "B", 2: "C", 3: "D" }, totalScore: { 0: 500, 1: 0 } };
}

const room: RoomRow = { id: "room", code: "GEN001", status: "finished", host_user_id: "u0", active_game_id: "game", scoring_mode: "ffb", target_score: 500, game_phase: "game-over", state_version: 1, turn_deadline_at: null, created_at: "start", updated_at: "", started_at: "start", finished_at: "end" };
const players: RoomPlayerRow[] = [0, 1, 2, 3].map((seat) => ({ id: `p${seat}`, room_id: "room", seat_index: seat as PlayerId, kind: "human", user_id: `u${seat}`, bot_profile_id: null, display_name: seat === 0 ? "Antonin" : `P${seat}`, is_ready: true, is_connected: true, bot_takeover: false, last_seen_at: null, joined_at: "", left_at: null, created_at: "", updated_at: "" }));

describe("Générale history", () => {
  it("stores the distinct contract, announcer and personal trick count in solo history", () => {
    const payload = buildSavedGamePayload(completed(), "u0");
    expect(payload?.round_history?.[0].result).toMatchObject({ contract: { kind: "generale", playerId: 0 }, tricksWonByPlayer: { 0: 8 } });
    expect(payload?.player_names?.[0]).toBe("Antonin");
  });

  it("stores the same immutable round history for multiplayer reconnect/history", () => {
    const archive = buildMultiplayerArchive({ gameId: "game", room, state: completed(), players, finishedAt: "end" });
    expect(archive?.game.round_history?.[0].result).toMatchObject({ contract: { kind: "generale", playerId: 0 } });
    expect(archive?.game.player_names?.[0]).toBe("Antonin");
  });

  it("adds safe JSON history columns and returns them from the authenticated RPC", () => {
    const sql = readFileSync("supabase/migrations/20260913030000_generale_history.sql", "utf8");
    expect(sql).toContain("round_history jsonb");
    expect(sql).toContain("player_names jsonb");
    expect(sql).toContain("'round_history',game.round_history");
    expect(sql).toContain("viewer.kind='human' and viewer.user_id=auth.uid()");
  });
});
