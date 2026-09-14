import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { createInitialGame } from "@/engine/game";
import { disconnectedHostSuccessor } from "@/lib/multiplayerHost";
import { projectRoomPlayers } from "@/lib/multiplayerPresence";
import type { RoomPlayerRow, RoomRow } from "@/lib/roomTypes";
import { hostTransferTargetUserId, requireHost } from "@/lib/server/multiplayerGame";
import { parseRoomIntent } from "@/lib/server/roomIntentValidation";

vi.mock("server-only", () => ({}));

const NOW_MS = Date.parse("2026-09-14T20:00:00.000Z");

function room(hostUserId = "user-0"): RoomRow {
  return {
    id: "room", code: "ABC123", status: "lobby", host_user_id: hostUserId,
    active_game_id: null, scoring_mode: "ffb", target_score: 1_000, game_phase: null,
    state_version: 12, turn_deadline_at: null, created_at: "", updated_at: "",
    started_at: null, finished_at: null,
  };
}

function players(): RoomPlayerRow[] {
  return [0, 1, 2, 3].map((seat) => ({
    id: `p${seat}`, room_id: "room", seat_index: seat as 0 | 1 | 2 | 3,
    kind: seat === 3 ? "bot" : "human", user_id: seat === 3 ? null : `user-${seat}`,
    bot_profile_id: seat === 3 ? "simple" : null, display_name: `P${seat}`,
    is_ready: seat !== 2, is_connected: true, bot_takeover: false,
    last_seen_at: new Date(NOW_MS - seat * 1_000).toISOString(),
    joined_at: new Date(NOW_MS - 10_000 + seat).toISOString(), left_at: null,
    created_at: "", updated_at: "",
  }));
}

describe("explicit host transfer", () => {
  it("uses the authoritative RPC and removes the ambiguous claim control from the UI", () => {
    const service = readFileSync("lib/server/multiplayerService.ts", "utf8");
    const client = readFileSync("app/multiplayer/[roomId]/RoomPageClient.tsx", "utf8");
    expect(service).toContain('.rpc("transfer_room_host"');
    expect(client).toContain("Transférer l&apos;hôte");
    expect(client).not.toContain("Devenir hôte");
    expect(client).not.toContain('{ type: "claim-host" }');
  });

  it("rejects a non-host", () => {
    expect(() => hostTransferTargetUserId({
      room: room(), players: players(), actorUserId: "user-1", targetSeatIndex: 2, nowMs: NOW_MS,
    })).toThrow("Seul l'hôte");
  });

  it("lets the host target another connected human", () => {
    expect(hostTransferTargetUserId({
      room: room(), players: players(), actorUserId: "user-0", targetSeatIndex: 1, nowMs: NOW_MS,
    })).toBe("user-1");
  });

  it("rejects a missing, bot, self, or disconnected target", () => {
    const current = players();
    expect(() => hostTransferTargetUserId({ room: room(), players: current, actorUserId: "user-0", targetSeatIndex: 3, nowMs: NOW_MS })).toThrow("humain");
    expect(() => hostTransferTargetUserId({ room: room(), players: current, actorUserId: "user-0", targetSeatIndex: 0, nowMs: NOW_MS })).toThrow("déjà l'hôte");
    current[2] = { ...current[2], last_seen_at: new Date(NOW_MS - 61_000).toISOString() };
    expect(() => hostTransferTargetUserId({ room: room(), players: current, actorUserId: "user-0", targetSeatIndex: 2, nowMs: NOW_MS })).toThrow("connecté");
  });

  it("changes host permissions without mutating rules, game, seats, or ready state", () => {
    const currentRoom = room();
    const currentPlayers = players();
    const game = createInitialGame(() => 0.1);
    const beforePlayers = structuredClone(currentPlayers);
    const beforeGame = structuredClone(game);
    const targetUserId = hostTransferTargetUserId({
      room: currentRoom, players: currentPlayers, actorUserId: "user-0", targetSeatIndex: 1, nowMs: NOW_MS,
    });
    const transferredRoom = { ...currentRoom, host_user_id: targetUserId, state_version: 13 };
    expect(() => requireHost(transferredRoom, "user-0")).toThrow("Seul l'hôte");
    expect(() => requireHost(transferredRoom, "user-1")).not.toThrow();
    expect(currentPlayers).toEqual(beforePlayers);
    expect(game).toEqual(beforeGame);
    expect(currentPlayers.map((entry) => entry.is_ready)).toEqual([true, true, false, true]);
    expect(projectRoomPlayers(currentPlayers, NOW_MS, targetUserId).find((entry) => entry.is_host)?.seat_index).toBe(1);
  });

  it("parses only a target seat and drops forged user ids", () => {
    expect(parseRoomIntent({ type: "transfer-host", targetSeatIndex: 1, targetUserId: "forged" }))
      .toEqual({ type: "transfer-host", targetSeatIndex: 1 });
  });
});

describe("automatic disconnected-host succession", () => {
  it("selects a connected successor only after the existing presence timeout", () => {
    const current = players();
    current[0] = { ...current[0], last_seen_at: new Date(NOW_MS - 59_000).toISOString() };
    expect(disconnectedHostSuccessor(room(), current, NOW_MS)).toBeNull();
    current[0] = { ...current[0], last_seen_at: new Date(NOW_MS - 61_000).toISOString() };
    expect(disconnectedHostSuccessor(room(), current, NOW_MS)).toBe("user-1");
  });
});

describe("atomic host transfer migration", () => {
  const sql = readFileSync("supabase/migrations/20260914000000_lobby_realtime_host_transfer.sql", "utf8");
  const transferBody = sql.slice(sql.indexOf("create or replace function public.transfer_room_host"), sql.indexOf("create or replace function public.claim_room_host"));

  it("locks, CAS-checks, authorizes, and increments the room version", () => {
    expect(transferBody).toContain("for update");
    expect(transferBody).toContain("current_room.state_version <> p_expected_version");
    expect(transferBody).toContain("current_room.host_user_id is distinct from p_actor_user_id");
    expect(transferBody).toContain("player.kind = 'human'");
    expect(transferBody).toContain("player.last_seen_at >= p_online_after");
    expect(transferBody).toContain("state_version = state_version + 1");
  });

  it("updates only host metadata and does not touch players, rules, ready, or game state", () => {
    expect(transferBody.match(/update public\.rooms/g)).toHaveLength(1);
    expect(transferBody).not.toContain("update public.room_players");
    expect(transferBody).not.toContain("room_game_states");
    expect(transferBody).not.toContain("ruleset");
    expect(transferBody).not.toContain("is_ready");
  });

  it("publishes only non-sensitive room_players columns", () => {
    const publication = sql.slice(sql.indexOf("alter publication"), sql.indexOf("exception when duplicate_object"));
    expect(publication).toContain("room_id");
    expect(publication).toContain("is_ready");
    expect(publication).not.toContain("user_id");
    expect(publication).not.toContain("last_seen_at");
  });
});
