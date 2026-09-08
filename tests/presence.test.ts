import { describe, expect, it } from "vitest";
import { createInitialGame } from "@/engine/game";
import { toPlayerGameView } from "@/engine/views";
import {
  isPlayerConnected, PRESENCE_HEARTBEAT_INTERVAL_MS, PRESENCE_OFFLINE_TIMEOUT_MS,
  PresenceMembershipError, projectRoomPlayers, recordPresenceHeartbeat, type PresenceHeartbeatWriter,
} from "@/lib/multiplayerPresence";
import type { RoomPlayerRow, RoomRow } from "@/lib/roomTypes";
import { leaveLobbySeat, viewerSeatIndex } from "@/lib/server/multiplayerGame";

const NOW = new Date("2026-09-09T00:00:00.000Z");

function room(status: RoomRow["status"] = "playing"): RoomRow {
  return {
    id: "room", code: "ABC123", status, host_user_id: "host", scoring_mode: "made-points",
    target_score: 1000, game_phase: status === "playing" ? "playing" : null, state_version: 12,
    created_at: "", updated_at: "", started_at: null, finished_at: null,
  };
}

function players(lastSeenAt = "2026-09-08T23:58:00.000Z"): RoomPlayerRow[] {
  return [0, 1, 2, 3].map((seat) => ({
    id: `seat-${seat}`, room_id: "room", seat_index: seat as 0 | 1 | 2 | 3,
    kind: seat === 2 ? "human" : "empty", user_id: seat === 2 ? "user-2" : null,
    bot_profile_id: null, display_name: seat === 2 ? "Anto 2" : null,
    is_ready: seat === 2, is_connected: seat === 2, last_seen_at: seat === 2 ? lastSeenAt : null,
    joined_at: seat === 2 ? "2026-09-08T22:00:00.000Z" : null, left_at: null,
    created_at: "", updated_at: "",
  }));
}

function memoryWriter(state: { players: RoomPlayerRow[] }): PresenceHeartbeatWriter {
  return async (write) => {
    const index = state.players.findIndex((player) =>
      player.room_id === write.roomId && player.user_id === write.userId && player.kind === "human");
    if (index < 0) return false;
    state.players[index] = {
      ...state.players[index], is_connected: write.isConnected, last_seen_at: write.lastSeenAt,
    };
    return true;
  };
}

describe("multiplayer presence and reconnection", () => {
  it("uses a 15-second heartbeat and a 60-second offline timeout", () => {
    expect(PRESENCE_HEARTBEAT_INTERVAL_MS).toBe(15_000);
    expect(PRESENCE_OFFLINE_TIMEOUT_MS).toBe(60_000);
  });

  it("refreshes last_seen_at and marks a seated member online", async () => {
    const state = { players: players() };
    await recordPresenceHeartbeat(memoryWriter(state), { roomId: "room", userId: "user-2", now: NOW });
    expect(state.players[2].last_seen_at).toBe(NOW.toISOString());
    expect(isPlayerConnected(state.players[2], NOW.getTime())).toBe(true);
  });

  it("rejects a heartbeat from a user without a human seat", async () => {
    const state = { players: players() };
    await expect(recordPresenceHeartbeat(memoryWriter(state), {
      roomId: "room", userId: "intruder", now: NOW,
    })).rejects.toBeInstanceOf(PresenceMembershipError);
  });

  it("does not change state_version or the server GameState", async () => {
    const currentRoom = room();
    const gameState = createInitialGame(() => 0.1);
    const originalRoom = structuredClone(currentRoom);
    const originalGameState = structuredClone(gameState);
    const state = { players: players() };
    await recordPresenceHeartbeat(memoryWriter(state), { roomId: "room", userId: "user-2", now: NOW });
    expect(currentRoom).toEqual(originalRoom);
    expect(gameState).toEqual(originalGameState);
    expect(currentRoom.state_version).toBe(12);
  });

  it("projects an expired human as offline while preserving their reserved seat", () => {
    const storedPlayers = players("2026-09-08T23:58:00.000Z");
    const view = projectRoomPlayers(storedPlayers, NOW.getTime());
    expect(view[2].is_connected).toBe(false);
    expect("last_seen_at" in view[2]).toBe(false);
    expect(storedPlayers[2]).toMatchObject({ kind: "human", user_id: "user-2", seat_index: 2 });
  });

  it("uses last_seen_at rather than a stale is_connected cache value", () => {
    const storedPlayers = players("2026-09-08T23:59:30.000Z");
    storedPlayers[2].is_connected = false;
    expect(isPlayerConnected(storedPlayers[2], NOW.getTime())).toBe(true);
  });

  it("reconnects the same user to the same seat without creating a row", async () => {
    const state = { players: players() };
    const initialCount = state.players.length;
    await recordPresenceHeartbeat(memoryWriter(state), { roomId: "room", userId: "user-2", now: NOW });
    expect(state.players).toHaveLength(initialCount);
    expect(viewerSeatIndex(state.players, "user-2")).toBe(2);
    expect(projectRoomPlayers(state.players, NOW.getTime())[2].is_connected).toBe(true);
  });

  it("restores only the reconnecting player's hand in PlayerGameView", () => {
    const gameState = createInitialGame(() => 0.1);
    const view = toPlayerGameView(gameState, 2);
    expect(view.hand).toEqual(gameState.hands[2]);
    expect("hands" in view).toBe(false);
    for (const opponent of [0, 1, 3] as const) {
      expect(JSON.stringify(view)).not.toContain(JSON.stringify(gameState.hands[opponent]));
    }
  });

  it("preserves a lobby seat and ready state across refresh and heartbeat", async () => {
    const currentRoom = room("lobby");
    const state = { players: players() };
    projectRoomPlayers(state.players, NOW.getTime());
    await recordPresenceHeartbeat(memoryWriter(state), { roomId: currentRoom.id, userId: "user-2", now: NOW });
    expect(state.players[2]).toMatchObject({ kind: "human", user_id: "user-2", is_ready: true });
    expect(currentRoom.state_version).toBe(12);
  });

  it("keeps explicit leave-seat as the operation that frees a lobby seat", () => {
    const left = leaveLobbySeat(players(), "user-2", NOW.toISOString());
    expect(left[2]).toMatchObject({
      kind: "empty", user_id: null, is_ready: false, is_connected: false,
      last_seen_at: null, joined_at: null,
    });
  });
});
