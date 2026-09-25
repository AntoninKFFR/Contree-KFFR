import { beforeEach, describe, expect, it, vi } from "vitest";
import { createInitialGame } from "@/engine/game";
import type { GameState } from "@/engine/types";
import type { RoomPlayerRow, RoomRow } from "@/lib/roomTypes";
import { createRoom, executeIntent, resolveRoomUsername, roomView } from "@/lib/server/multiplayerService";
import { parseRoomIntent } from "@/lib/server/roomIntentValidation";

vi.mock("server-only", () => ({}));

const state: {
  usernames: Record<string, string>;
  ratings: Record<string, { rating: number; rated_games: number }>;
  room: RoomRow | null;
  players: RoomPlayerRow[];
  game: GameState | null;
} = {
  usernames: {}, ratings: {}, room: null, players: [], game: null,
};

const db = {
  from(table: string) {
    if (table === "profiles") return {
      select: () => ({
        eq: (_column: string, userId: string) => ({ maybeSingle: async () => ({ data: state.usernames[userId] ? { username: state.usernames[userId] } : null, error: null }) }),
        in: async (_column: string, userIds: string[]) => ({
          data: userIds.flatMap((userId) => state.usernames[userId] ? [{ id: userId, username: state.usernames[userId] }] : []),
          error: null,
        }),
      }),
    };
    if (table === "player_ratings") return {
      select: () => ({
        in: async (_column: string, userIds: string[]) => ({
          data: userIds.flatMap((userId) => state.ratings[userId] ? [{ user_id: userId, ...state.ratings[userId] }] : []),
          error: null,
        }),
      }),
    };
    if (table === "rooms") return {
      insert: (values: Partial<RoomRow>) => ({ select: () => ({ single: async () => {
        state.room = {
          id: "room-1", code: "ABC123", status: "lobby", host_user_id: values.host_user_id ?? "host",
          active_game_id: null, scoring_mode: "ffb", target_score: 1000, game_phase: null,
          state_version: 0, turn_deadline_at: null, created_at: "", updated_at: "", started_at: null, finished_at: null,
          ...values,
        } as RoomRow;
        return { data: state.room, error: null };
      } }) }),
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: state.room, error: null }) }) }),
    };
    if (table === "room_players") return {
      insert: async (values: RoomPlayerRow[]) => {
        state.players = values.map((player) => ({ ...player }));
        return { error: null };
      },
      select: () => ({ eq: () => ({ order: async () => ({ data: state.players, error: null }) }) }),
    };
    if (table === "room_game_states") return {
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: state.game ? { state: state.game } : null, error: null }) }) }),
    };
    throw new Error(`Unexpected table ${table}`);
  },
  async rpc(name: string, params: Record<string, unknown>) {
    if (name !== "move_room_seat") throw new Error(`Unexpected RPC ${name}`);
    const seat = state.players.find((player) => player.seat_index === params.p_seat_index);
    if (!seat || !state.room) return { data: false, error: null };
    seat.kind = "human";
    seat.user_id = String(params.p_actor_user_id);
    seat.display_name = String(params.p_display_name);
    seat.is_connected = true;
    state.room.state_version += 1;
    return { data: true, error: null };
  },
};

vi.mock("@/lib/server/supabaseAdmin", () => ({ getSupabaseAdmin: () => db }));

beforeEach(() => {
  state.usernames = { host: "Antonin", guest: "Marie" };
  state.ratings = {
    host: { rating: 1450, rated_games: 5 },
    guest: { rating: 1020, rated_games: 4 },
  };
  state.room = null;
  state.players = [];
  state.game = null;
});

describe("server-authoritative multiplayer identity", () => {
  it("resolves a valid username from profiles and refuses a missing profile", async () => {
    expect(await resolveRoomUsername("host")).toBe("Antonin");
    await expect(resolveRoomUsername("missing")).rejects.toMatchObject({ code: "profile_required", status: 403 });
  });

  it("creates and joins seats with server profile names, never a client displayName", async () => {
    const created = await createRoom({ userId: "host", rules: { presetId: "contree-kffr" } });
    expect(created.players[0].display_name).toBe("Antonin");
    expect(created.players[0]).toMatchObject({ rating: 1450, rank: "Sait jouer II", is_ranked: true });
    const outsiderView = await roomView("room-1", "outsider");
    expect(outsiderView.players[0]).toMatchObject({ rating: null, rank: null, is_ranked: false });
    const intent = parseRoomIntent({ type: "join-seat", seatIndex: 1, displayName: "Spoofed" });
    expect(intent).toEqual({ type: "join-seat", seatIndex: 1 });
    const joined = await executeIntent("room-1", "guest", 0, intent);
    expect(joined.players[1].display_name).toBe("Marie");
    expect(joined.players[1].display_name).not.toBe("Spoofed");
    expect(joined.players[1]).toMatchObject({ rating: null, rank: null, is_ranked: false });
  });

  it("does not create a room for an account without a profile", async () => {
    await expect(createRoom({ userId: "missing", rules: { presetId: "contree-kffr" } })).rejects.toMatchObject({ code: "profile_required" });
    expect(state.room).toBeNull();
  });

  it("projects the precise game id only to a seated participant while retaining room privacy", async () => {
    await createRoom({ userId: "host", rules: { presetId: "contree-kffr" } });
    expect((await roomView("room-1", "outsider")).gameId).toBeNull();
    state.room!.status = "playing";
    state.room!.game_phase = "bidding";
    state.room!.active_game_id = "00000000-0000-4000-8000-000000000001";
    state.game = createInitialGame(() => 0.1);
    const seated = await roomView("room-1", "host");
    expect(seated.gameId).toBe(state.room!.active_game_id);
    expect(seated.room).not.toHaveProperty("active_game_id");
    expect(seated.room).not.toHaveProperty("host_user_id");
    await expect(roomView("room-1", "outsider")).rejects.toMatchObject({ status: 403 });
  });

  it("refuses a lobby seat without a profile and uses the latest name on a new seat", async () => {
    await createRoom({ userId: "host", rules: { presetId: "contree-kffr" } });
    await expect(executeIntent("room-1", "missing", 0, { type: "join-seat", seatIndex: 1 }))
      .rejects.toMatchObject({ code: "profile_required" });
    expect(state.players[1].kind).toBe("empty");
    state.usernames.guest = "Nouveau pseudo";
    const joined = await executeIntent("room-1", "guest", 0, { type: "join-seat", seatIndex: 1 });
    expect(joined.players[1].display_name).toBe("Nouveau pseudo");
  });
});
