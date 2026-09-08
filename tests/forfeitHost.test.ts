import { describe, expect, it, vi } from "vitest";
import { createInitialGame } from "@/engine/game";
import { toPlayerGameView } from "@/engine/views";
import { canClaimRoomHost, nextHostUserId } from "@/lib/multiplayerHost";
import { turnDeadlineForState } from "@/lib/multiplayerTurnTimer";
import type { RoomPlayerRow, RoomRow } from "@/lib/roomTypes";
import {
  applyBotTurns, applyTimedOutTurnIfExpired, forfeitRoom, leaveLobbySeat, resetRoomPlayers,
} from "@/lib/server/multiplayerGame";
import { parseRoomIntent } from "@/lib/server/roomIntentValidation";

vi.mock("server-only", () => ({}));

const NOW_MS = Date.parse("2026-09-09T14:00:00.000Z");

function room(status: RoomRow["status"] = "playing", hostUserId: string | null = "user-0"): RoomRow {
  return {
    id: "room", code: "ABC123", status, host_user_id: hostUserId,
    scoring_mode: "made-points", target_score: 1000,
    game_phase: status === "playing" ? "bidding" : null, state_version: 40,
    turn_deadline_at: status === "playing" ? "2026-09-09T14:00:45.000Z" : null,
    created_at: "", updated_at: "", started_at: "", finished_at: null,
  };
}

function players(): RoomPlayerRow[] {
  return [0, 1, 2, 3].map((seat) => ({
    id: `seat-${seat}`, room_id: "room", seat_index: seat as 0 | 1 | 2 | 3,
    kind: "human", user_id: `user-${seat}`, bot_profile_id: null, display_name: `P${seat}`,
    is_ready: true, is_connected: true, bot_takeover: seat === 3,
    last_seen_at: "2026-09-09T13:59:30.000Z",
    joined_at: `2026-09-09T10:0${seat}:00.000Z`, left_at: null, created_at: "", updated_at: "",
  }));
}

describe("voluntary multiplayer forfeit", () => {
  it("lets a human forfeit only their own team and gives victory to the opponent", () => {
    const state = { ...createInitialGame(() => 0.1), totalScore: { 0: 120, 1: 240 } };
    const result = forfeitRoom({ room: room(), players: players(), state, userId: "user-2", nowMs: NOW_MS });
    expect(result.state).toMatchObject({
      phase: "game-over", winnerTeam: 1, endReason: "forfeit", forfeitingTeam: 0,
    });
    expect(result.status).toBe("finished");
  });

  it("preserves real scores, cards and history without inventing a result", () => {
    const state = { ...createInitialGame(() => 0.1), totalScore: { 0: 321, 1: 456 } };
    const originalHands = structuredClone(state.hands);
    const originalHistory = structuredClone(state.roundHistory);
    const result = forfeitRoom({ room: room(), players: players(), state, userId: "user-1", nowMs: NOW_MS });
    expect(result.state.totalScore).toEqual({ 0: 321, 1: 456 });
    expect(result.state.hands).toEqual(originalHands);
    expect(result.state.roundHistory).toEqual(originalHistory);
    expect(result.state.result).toBe(state.result);
  });

  it("clears the deadline and prevents any bot continuation after forfeit", () => {
    const currentPlayers = players();
    const result = forfeitRoom({
      room: room(), players: currentPlayers, state: createInitialGame(() => 0.1),
      userId: "user-0", nowMs: NOW_MS,
    });
    expect(turnDeadlineForState(result.state, result.players, NOW_MS)).toBeNull();
    expect(applyTimedOutTurnIfExpired(
      { ...room("finished"), turn_deadline_at: null },
      result.state,
      result.players,
      NOW_MS,
    )).toBeNull();
    expect(result.players.every((player) => !player.bot_takeover)).toBe(true);
    expect(applyBotTurns(result.state, result.players)).toEqual(result.state);
  });

  it("rejects a non-member and a second forfeit after game over", () => {
    const state = createInitialGame(() => 0.1);
    expect(() => forfeitRoom({ room: room(), players: players(), state, userId: "intruder", nowMs: NOW_MS }))
      .toThrow("Tu ne fais pas partie");
    const finished = forfeitRoom({ room: room(), players: players(), state, userId: "user-0", nowMs: NOW_MS });
    expect(() => forfeitRoom({
      room: room("finished"), players: players(), state: finished.state, userId: "user-1", nowMs: NOW_MS,
    })).toThrow("déjà terminée");
  });

  it("drops any forged team from the client intent", () => {
    expect(parseRoomIntent({ type: "forfeit-game", teamId: 1, userId: "forged" }))
      .toEqual({ type: "forfeit-game" });
  });

  it("keeps PlayerGameView isolated after a forfeit", () => {
    const state = createInitialGame(() => 0.1);
    const result = forfeitRoom({ room: room(), players: players(), state, userId: "user-0", nowMs: NOW_MS });
    const view = toPlayerGameView(result.state, 0);
    expect(view.endReason).toBe("forfeit");
    expect("hands" in view).toBe(false);
    for (const opponent of [1, 2, 3] as const) {
      expect(JSON.stringify(view)).not.toContain(JSON.stringify(state.hands[opponent]));
    }
  });
});

describe("multiplayer host continuity", () => {
  it("transfers a leaving lobby host to the oldest connected human", () => {
    const remaining = leaveLobbySeat(players(), "user-0", new Date(NOW_MS).toISOString());
    expect(nextHostUserId(remaining, "user-0", NOW_MS)).toBe("user-1");
  });

  it("falls back deterministically to the first remaining seat", () => {
    const current = players().map((player) => ({ ...player, last_seen_at: null }));
    expect(nextHostUserId(current, "user-0", NOW_MS)).toBe("user-1");
  });

  it("transfers host after their forfeit while keeping their human seat", () => {
    const result = forfeitRoom({
      room: room(), players: players(), state: createInitialGame(() => 0.1),
      userId: "user-0", nowMs: NOW_MS,
    });
    expect(result.nextHostUserId).toBe("user-1");
    expect(result.players[0]).toMatchObject({ kind: "human", user_id: "user-0", seat_index: 0 });
  });

  it("does not allow replacing an online or only briefly offline host", () => {
    const current = players();
    expect(canClaimRoomHost(room(), current, "user-1", NOW_MS)).toBe(false);
    current[0] = { ...current[0], last_seen_at: "2026-09-09T13:59:30.000Z" };
    expect(canClaimRoomHost(room(), current, "user-1", NOW_MS)).toBe(false);
  });

  it("allows a connected human to claim after the host is offline for over 60 seconds", () => {
    const current = players();
    current[0] = { ...current[0], last_seen_at: "2026-09-09T13:58:00.000Z" };
    expect(canClaimRoomHost(room(), current, "user-1", NOW_MS)).toBe(true);
  });

  it("rejects a non-member host claim and strips forged host ids", () => {
    expect(canClaimRoomHost(room(), players(), "intruder", NOW_MS)).toBe(false);
    expect(parseRoomIntent({ type: "claim-host", hostUserId: "forged" })).toEqual({ type: "claim-host" });
  });

  it("allows only one winner when two claims race", () => {
    const current = players();
    current[0] = { ...current[0], last_seen_at: "2026-09-09T13:58:00.000Z" };
    expect(canClaimRoomHost(room(), current, "user-1", NOW_MS)).toBe(true);
    expect(canClaimRoomHost(room(), current, "user-2", NOW_MS)).toBe(true);
    const afterFirstClaim = room("playing", "user-1");
    expect(canClaimRoomHost(afterFirstClaim, current, "user-2", NOW_MS)).toBe(false);
  });

  it("does not restore the former host role when they reconnect", () => {
    const current = players();
    const transferredRoom = room("playing", "user-1");
    current[0] = { ...current[0], last_seen_at: new Date(NOW_MS).toISOString() };
    expect(transferredRoom.host_user_id).toBe("user-1");
    expect(canClaimRoomHost(transferredRoom, current, "user-0", NOW_MS)).toBe(false);
  });

  it("does not mutate GameState, hands, deadline or state_version while evaluating a claim", () => {
    const currentRoom = room();
    const currentPlayers = players();
    currentPlayers[0] = { ...currentPlayers[0], last_seen_at: "2026-09-09T13:58:00.000Z" };
    const state = createInitialGame(() => 0.1);
    const roomSnapshot = structuredClone(currentRoom);
    const stateSnapshot = structuredClone(state);
    expect(canClaimRoomHost(currentRoom, currentPlayers, "user-1", NOW_MS)).toBe(true);
    expect(currentRoom).toEqual(roomSnapshot);
    expect(state).toEqual(stateSnapshot);
  });

  it("resets all forfeit and takeover data for a rematch", () => {
    const forfeited = forfeitRoom({
      room: room(), players: players(), state: createInitialGame(() => 0.1),
      userId: "user-0", nowMs: NOW_MS,
    });
    const resetPlayers = resetRoomPlayers(forfeited.players);
    const rematch = createInitialGame(() => 0.1);
    expect(resetPlayers.every((player) => !player.bot_takeover && !player.is_ready)).toBe(true);
    expect(rematch).toMatchObject({ winnerTeam: null, endReason: null, forfeitingTeam: null });
    expect(turnDeadlineForState(null, resetPlayers, NOW_MS)).toBeNull();
  });
});
