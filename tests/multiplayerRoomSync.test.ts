import type { Dispatch, SetStateAction } from "react";
import type { Session, SupabaseClient } from "@supabase/supabase-js";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  loadMultiplayerRoom,
  startPresenceHeartbeat,
  subscribeToMultiplayerRoomSync,
  type MultiplayerRoomPageState,
  type MultiplayerRoomSyncServices,
  type PresenceEnvironment,
} from "@/components/multiplayer/useMultiplayerRoomSync";
import { PRESENCE_HEARTBEAT_INTERVAL_MS } from "@/lib/multiplayerPresence";
import type { MultiplayerRoomView, RoomPlayerView } from "@/lib/roomTypes";

function player(seat: 0 | 1 | 2 | 3, kind: RoomPlayerView["kind"] = "empty"): RoomPlayerView {
  return {
    seat_index: seat,
    kind,
    display_name: kind === "empty" ? null : `P${seat}`,
    is_ready: false,
    is_connected: kind !== "empty",
    bot_takeover: false,
    is_host: seat === 0,
    is_ranked: false,
    rating: null,
    rank: null,
  };
}

function roomView(version: number, viewerSeatIndex: 0 | 1 | 2 | 3 | null = 0): MultiplayerRoomView {
  return {
    gameId: null,
    room: {
      id: "room",
      code: "ABC123",
      status: "lobby",
      scoring_mode: "ffb",
      target_score: 1_000,
      game_phase: null,
      state_version: version,
      turn_deadline_at: null,
      created_at: "",
      updated_at: "",
      started_at: null,
      finished_at: null,
    },
    players: [player(0, "human"), player(1), player(2), player(3)],
    isHost: true,
    canClaimHost: false,
    viewerSeatIndex,
    game: null,
  };
}

function session(): Session {
  return {
    access_token: "test-token",
    user: { id: "user-0", user_metadata: {} },
  } as Session;
}

function stateCell<T>(initialValue: T) {
  let value = initialValue;
  const history: T[] = [];
  const set: Dispatch<SetStateAction<T>> = (nextValue) => {
    value = typeof nextValue === "function"
      ? (nextValue as (current: T) => T)(value)
      : nextValue;
    history.push(value);
  };
  return { get value() { return value; }, history, set };
}

function syncState(initialRoom: MultiplayerRoomView | null = null) {
  return {
    error: stateCell<string | null>(null),
    localDisplayName: stateCell("Joueur"),
    pageState: stateCell<MultiplayerRoomPageState>("loading"),
    profileUsername: stateCell<string | null>(null),
    roomWithPlayers: stateCell<MultiplayerRoomView | null>(initialRoom),
    session: stateCell<Session | null>(null),
  };
}

function servicesFor(
  currentSession: Session | null,
  fetchRoomView = vi.fn<MultiplayerRoomSyncServices["fetchRoomView"]>(),
) {
  const supabase = {
    auth: {
      getSession: vi.fn(async () => ({ data: { session: currentSession } })),
    },
  } as unknown as SupabaseClient;
  const services: MultiplayerRoomSyncServices = {
    ensureProfile: vi.fn(async () => "Antonin"),
    fetchRoomView,
    getSupabaseClient: vi.fn(() => supabase),
    sendPresenceHeartbeat: vi.fn(),
    subscribeToRoomRealtime: vi.fn(),
  };
  return { services, supabase };
}

function loadInput(
  state: ReturnType<typeof syncState>,
  services: MultiplayerRoomSyncServices,
  options: { silent?: boolean } = {},
) {
  return {
    options,
    roomId: "room",
    services,
    setError: state.error.set,
    setLocalDisplayName: state.localDisplayName.set,
    setPageState: state.pageState.set,
    setProfileUsername: state.profileUsername.set,
    setRoomWithPlayers: state.roomWithPlayers.set,
    setSession: state.session.set,
  };
}

function presenceEnvironment() {
  const documentListeners: Array<() => void> = [];
  const windowListeners = new Map<"focus" | "online", () => void>();
  const environment: PresenceEnvironment = {
    addDocumentListener: vi.fn((listener) => documentListeners.push(listener)),
    addWindowListener: vi.fn((type, listener) => windowListeners.set(type, listener)),
    clearInterval: vi.fn(),
    isVisible: vi.fn(() => true),
    removeDocumentListener: vi.fn(),
    removeWindowListener: vi.fn(),
    setInterval: vi.fn(() => 1),
  };
  return { documentListeners, environment, windowListeners };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("multiplayer room synchronization", () => {
  it("enters signed-out when Supabase has no session", async () => {
    const state = syncState();
    const { services } = servicesFor(null);

    await loadMultiplayerRoom(loadInput(state, services));

    expect(state.pageState.value).toBe("signed-out");
    expect(state.session.value).toBeNull();
    expect(services.fetchRoomView).not.toHaveBeenCalled();
  });

  it("enters ready after a successful room load", async () => {
    const state = syncState();
    const nextRoom = roomView(3);
    const fetchRoom = vi.fn(async () => nextRoom);
    const { services } = servicesFor(session(), fetchRoom);

    await loadMultiplayerRoom(loadInput(state, services));

    expect(state.pageState.value).toBe("ready");
    expect(state.roomWithPlayers.value).toBe(nextRoom);
    expect(state.profileUsername.value).toBe("Antonin");
    expect(state.localDisplayName.value).toBe("Antonin");
    expect(state.error.value).toBeNull();
  });

  it("enters missing and keeps the user-facing error when room fetch fails", async () => {
    const state = syncState(roomView(2));
    const fetchRoom = vi.fn(async () => { throw new Error("Table introuvable."); });
    const { services } = servicesFor(session(), fetchRoom);

    await loadMultiplayerRoom(loadInput(state, services));

    expect(state.pageState.value).toBe("missing");
    expect(state.roomWithPlayers.value).toBeNull();
    expect(state.error.value).toBe("Table introuvable.");
  });

  it("does not return to loading during a silent refresh", async () => {
    const state = syncState();
    const { services } = servicesFor(session(), vi.fn(async () => roomView(4)));

    await loadMultiplayerRoom(loadInput(state, services, { silent: true }));

    expect(state.pageState.history).not.toContain("loading");
    expect(state.pageState.value).toBe("ready");
  });

  it("does not replace a newer room with an older fetched version", async () => {
    const current = roomView(8);
    const state = syncState(current);
    const { services } = servicesFor(session(), vi.fn(async () => roomView(7)));

    await loadMultiplayerRoom(loadInput(state, services, { silent: true }));

    expect(state.roomWithPlayers.value).toBe(current);
    expect(state.pageState.value).toBe("ready");
  });

  it("uses a silent refresh for Realtime room events", async () => {
    const loadRoom = vi.fn(async () => undefined);
    const cleanup = vi.fn();
    const subscribe = vi.fn((_supabase, _roomId, refresh: () => void | Promise<void>) => {
      void refresh();
      return cleanup;
    });

    const unsubscribe = subscribeToMultiplayerRoomSync(
      {} as SupabaseClient,
      "room",
      loadRoom,
      subscribe,
    );

    await vi.waitFor(() => expect(loadRoom).toHaveBeenCalledWith({ silent: true }));
    expect(unsubscribe).toBe(cleanup);
  });

  it("converges a non-host from finished to the host's lobby and recovers after reconnect", async () => {
    const finished = roomView(5, 1);
    finished.room.status = "finished";
    finished.gameId = "00000000-0000-4000-8000-000000000001";
    finished.players[1] = player(1, "human");
    const lobby = roomView(6, 1);
    lobby.players[1] = player(1, "human");
    const finishedReload = syncState();
    await loadMultiplayerRoom(loadInput(finishedReload, servicesFor(session(), vi.fn(async () => finished)).services));
    expect(finishedReload.roomWithPlayers.value?.room.status).toBe("finished");
    expect(finishedReload.roomWithPlayers.value?.gameId).toBe(finished.gameId);
    const state = syncState(finished);
    const fetchRoom = vi.fn(async () => lobby);
    const { services } = servicesFor(session(), fetchRoom);
    const subscribe = vi.fn((_supabase, _roomId, refresh: () => void | Promise<void>) => {
      void refresh();
      return () => undefined;
    });

    subscribeToMultiplayerRoomSync({} as SupabaseClient, "room", () => loadMultiplayerRoom(
      loadInput(state, services, { silent: true }),
    ), subscribe);
    await vi.waitFor(() => expect(state.roomWithPlayers.value).toBe(lobby));
    expect(state.roomWithPlayers.value?.room.status).toBe("lobby");
    expect(state.roomWithPlayers.value?.gameId).toBeNull();
    expect(state.roomWithPlayers.value?.players.filter((seat) => seat.kind === "human").map((seat) => seat.seat_index)).toEqual([0, 1]);
    expect(state.pageState.history).not.toContain("loading");

    fetchRoom.mockResolvedValueOnce(finished);
    await loadMultiplayerRoom(loadInput(state, services, { silent: true }));
    expect(state.roomWithPlayers.value).toBe(lobby);
    const reconnected = syncState();
    await loadMultiplayerRoom(loadInput(reconnected, services));
    expect(reconnected.roomWithPlayers.value?.room.status).toBe("lobby");
    expect(reconnected.roomWithPlayers.value?.gameId).toBeNull();
  });

  it("does not start presence heartbeat without a viewer seat", () => {
    const state = syncState(roomView(2, null));
    const sendHeartbeat = vi.fn(async () => roomView(3));
    const { environment } = presenceEnvironment();

    const cleanup = startPresenceHeartbeat({
      accessToken: "test-token",
      environment,
      roomId: "room",
      sendHeartbeat,
      setPageState: state.pageState.set,
      setRoomWithPlayers: state.roomWithPlayers.set,
      viewerSeatIndex: null,
    });

    expect(cleanup).toBeUndefined();
    expect(sendHeartbeat).not.toHaveBeenCalled();
    expect(environment.setInterval).not.toHaveBeenCalled();
  });

  it("accepts only sufficiently recent heartbeat room versions", async () => {
    const current = roomView(5);
    const state = syncState(current);
    const sendHeartbeat = vi.fn()
      .mockResolvedValueOnce(roomView(4))
      .mockResolvedValueOnce(roomView(6));
    const { environment, windowListeners } = presenceEnvironment();

    const cleanup = startPresenceHeartbeat({
      accessToken: "test-token",
      environment,
      roomId: "room",
      sendHeartbeat,
      setPageState: state.pageState.set,
      setRoomWithPlayers: state.roomWithPlayers.set,
      viewerSeatIndex: 0,
    });

    await vi.waitFor(() => expect(sendHeartbeat).toHaveBeenCalledTimes(1));
    expect(state.roomWithPlayers.value).toBe(current);
    windowListeners.get("focus")?.();
    await vi.waitFor(() => expect(sendHeartbeat).toHaveBeenCalledTimes(2));
    expect(state.roomWithPlayers.value?.room.state_version).toBe(6);
    expect(environment.setInterval).toHaveBeenCalledWith(
      expect.any(Function),
      PRESENCE_HEARTBEAT_INTERVAL_MS,
    );
    expect(environment.addDocumentListener).toHaveBeenCalledOnce();
    expect(environment.addWindowListener).toHaveBeenCalledWith("focus", expect.any(Function));
    expect(environment.addWindowListener).toHaveBeenCalledWith("online", expect.any(Function));
    cleanup?.();
    expect(environment.clearInterval).toHaveBeenCalledWith(1);
    expect(environment.removeDocumentListener).toHaveBeenCalledOnce();
    expect(environment.removeWindowListener).toHaveBeenCalledWith("focus", expect.any(Function));
    expect(environment.removeWindowListener).toHaveBeenCalledWith("online", expect.any(Function));
  });
});
