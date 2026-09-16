import { afterEach, describe, expect, it, vi } from "vitest";
import { sendRoomIntentWithLobbyRetry } from "@/lib/multiplayerApi";
import type { MultiplayerRoomView, RoomPlayerView } from "@/lib/roomTypes";
import { subscribeToRoomRealtime } from "@/lib/roomRealtime";

const token = { access_token: "test-token" };

function player(seat: 0 | 1 | 2 | 3, kind: RoomPlayerView["kind"] = "empty"): RoomPlayerView {
  return {
    seat_index: seat, kind, display_name: kind === "empty" ? null : `P${seat}`,
    is_ready: false, is_connected: kind !== "empty", bot_takeover: false, is_host: seat === 0,
  };
}

function roomView(version: number, overrides: Partial<MultiplayerRoomView> = {}): MultiplayerRoomView {
  return {
    room: {
      id: "room", code: "ABC123", status: "lobby", scoring_mode: "ffb", target_score: 1_000,
      game_phase: null, state_version: version, turn_deadline_at: null,
      created_at: "", updated_at: "", started_at: null, finished_at: null,
    },
    players: [player(0, "human"), player(1), player(2), player(3)],
    isHost: false, canClaimHost: false, viewerSeatIndex: null, game: null,
    ...overrides,
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("safe lobby CAS retries", () => {
  it("refetches and retries once when another client committed the shared old version", async () => {
    const latest = roomView(5);
    const joined = roomView(6, {
      viewerSeatIndex: 1,
      players: [player(0, "human"), player(1, "human"), player(2), player(3)],
    });
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ error: "stale", code: "version_conflict" }, 409))
      .mockResolvedValueOnce(jsonResponse({ data: latest }))
      .mockResolvedValueOnce(jsonResponse({ data: joined }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(sendRoomIntentWithLobbyRetry("room", 4, {
      type: "join-seat", seatIndex: 1,
    }, token)).resolves.toEqual(joined);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({ expectedVersion: 4 });
    expect(JSON.parse(fetchMock.mock.calls[2][1].body)).toMatchObject({ expectedVersion: 5 });
  });

  it("reports a precise error when the target seat was taken before retry", async () => {
    const occupied = roomView(5, {
      players: [player(0, "human"), player(1, "human"), player(2), player(3)],
    });
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ error: "stale", code: "version_conflict" }, 409))
      .mockResolvedValueOnce(jsonResponse({ data: occupied }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(sendRoomIntentWithLobbyRetry("room", 4, {
      type: "join-seat", seatIndex: 1,
    }, token)).rejects.toMatchObject({
      status: 409, code: "seat_taken", message: "Cette place vient d'être prise.",
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("refetches and retries a stale ready update", async () => {
    const seatedPlayers = [player(0, "human"), player(1, "human"), player(2), player(3)];
    const latest = roomView(8, { players: seatedPlayers, viewerSeatIndex: 1 });
    const readyPlayers = seatedPlayers.map((entry) => entry.seat_index === 1 ? { ...entry, is_ready: true } : entry);
    const ready = roomView(9, { players: readyPlayers, viewerSeatIndex: 1 });
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ error: "stale", code: "version_conflict" }, 409))
      .mockResolvedValueOnce(jsonResponse({ data: latest }))
      .mockResolvedValueOnce(jsonResponse({ data: ready }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(sendRoomIntentWithLobbyRetry("room", 7, {
      type: "set-ready", ready: true,
    }, token)).resolves.toEqual(ready);
    expect(JSON.parse(fetchMock.mock.calls[2][1].body)).toMatchObject({ expectedVersion: 8 });
  });

  it("never retries a gameplay action", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({ error: "stale", code: "version_conflict" }, 409),
    );
    vi.stubGlobal("fetch", fetchMock);
    await expect(sendRoomIntentWithLobbyRetry("room", 3, {
      type: "game-action", action: { type: "pass" },
    }, token)).rejects.toMatchObject({ code: "version_conflict" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("lobby Realtime refresh", () => {
  it("refreshes for room_players changes and coalesces duplicate events", async () => {
    vi.useFakeTimers();
    const handlers = new Map<string, () => void>();
    const channel = {
      on: vi.fn((_kind, config: { table: string }, callback: () => void) => {
        handlers.set(config.table, callback);
        return channel;
      }),
      subscribe: vi.fn(() => channel),
    };
    const supabase = {
      channel: vi.fn(() => channel),
      removeChannel: vi.fn(),
    };
    const refresh = vi.fn();
    const unsubscribe = subscribeToRoomRealtime(
      supabase as never,
      "room",
      refresh,
    );

    handlers.get("room_players")?.();
    handlers.get("rooms")?.();
    await vi.advanceTimersByTimeAsync(50);
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(channel.on).toHaveBeenCalledWith(
      "postgres_changes",
      expect.objectContaining({ table: "room_players", filter: "room_id=eq.room" }),
      expect.any(Function),
    );
    unsubscribe();
    expect(supabase.removeChannel).toHaveBeenCalledWith(channel);
  });
});
