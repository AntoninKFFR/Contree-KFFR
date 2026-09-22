import type { Dispatch, SetStateAction } from "react";
import type { Session, SupabaseClient } from "@supabase/supabase-js";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createMultiplayerRoomActionHandlers,
  type MultiplayerRoomActionServices,
} from "@/components/multiplayer/useMultiplayerRoomActions";
import type { MultiplayerRoomPageState } from "@/components/multiplayer/useMultiplayerRoomSync";
import type { MultiplayerRoomView, RoomPlayerView } from "@/lib/roomTypes";

type ActionInput = Parameters<typeof createMultiplayerRoomActionHandlers>[0];

function player(seat: 0 | 1 | 2 | 3, isReady = false): RoomPlayerView {
  return {
    seat_index: seat,
    kind: "human",
    display_name: `P${seat}`,
    is_ready: isReady,
    is_connected: true,
    bot_takeover: false,
    is_host: seat === 0,
    is_ranked: false,
    rating: null,
    rank: null,
  };
}

function roomView(
  version = 7,
  status: MultiplayerRoomView["room"]["status"] = "lobby",
): MultiplayerRoomView {
  return {
    room: {
      id: "room",
      code: "ABC123",
      status,
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
    players: [player(0), player(1), player(2), player(3)],
    isHost: true,
    canClaimHost: false,
    viewerSeatIndex: 0,
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

function actionHarness(
  overrides: Partial<ActionInput> = {},
  serviceOverrides: Partial<MultiplayerRoomActionServices> = {},
) {
  const currentRoom = roomView();
  const nextRoom = roomView(8);
  const currentSession = session();
  const state = {
    error: stateCell<string | null>("old error"),
    hostTransferSeat: stateCell<0 | 1 | 2 | 3 | null>(2),
    isForfeitConfirmationOpen: stateCell(true),
    isForfeiting: stateCell(false),
    isHostTransferOpen: stateCell(true),
    isJoiningSeat: stateCell(false),
    isLeavingSeat: stateCell(false),
    isResettingRoom: stateCell(false),
    isRulesOpen: stateCell(true),
    isStartingGame: stateCell(false),
    isStartingNextRound: stateCell(false),
    isTransferringHost: stateCell(false),
    isUpdatingReady: stateCell(false),
    isUpdatingRules: stateCell(false),
    isUpdatingTablePreferences: stateCell(false),
    pageState: stateCell<MultiplayerRoomPageState>("loading"),
    roomWithPlayers: stateCell<MultiplayerRoomView | null>(currentRoom),
    takeoverSeatInFlight: stateCell<0 | 1 | 2 | 3 | null>(null),
  };
  const services: MultiplayerRoomActionServices = {
    getSupabaseClient: vi.fn(() => ({} as SupabaseClient)),
    sendRoomIntent: vi.fn(async () => nextRoom),
    sendRoomIntentWithLobbyRetry: vi.fn(async () => nextRoom),
    ...serviceOverrides,
  };
  const input: ActionInput = {
    canShowNextRoundButton: true,
    canStartGame: true,
    currentSeat: currentRoom.players[0] ?? null,
    hostTransferSeat: 2,
    isForfeiting: false,
    isHost: true,
    isJoiningSeat: false,
    isLeavingSeat: false,
    isResettingRoom: false,
    isStartingNextRound: false,
    isTransferringHost: false,
    isUpdatingTablePreferences: false,
    profileUsername: "Antonin",
    roomWithPlayers: currentRoom,
    rulesDraft: { presetId: "contree-kffr" },
    services,
    session: currentSession,
    setError: state.error.set,
    setHostTransferSeat: state.hostTransferSeat.set,
    setIsForfeitConfirmationOpen: state.isForfeitConfirmationOpen.set,
    setIsForfeiting: state.isForfeiting.set,
    setIsHostTransferOpen: state.isHostTransferOpen.set,
    setIsJoiningSeat: state.isJoiningSeat.set,
    setIsLeavingSeat: state.isLeavingSeat.set,
    setIsResettingRoom: state.isResettingRoom.set,
    setIsRulesOpen: state.isRulesOpen.set,
    setIsStartingGame: state.isStartingGame.set,
    setIsStartingNextRound: state.isStartingNextRound.set,
    setIsTransferringHost: state.isTransferringHost.set,
    setIsUpdatingReady: state.isUpdatingReady.set,
    setIsUpdatingRules: state.isUpdatingRules.set,
    setIsUpdatingTablePreferences: state.isUpdatingTablePreferences.set,
    setPageState: state.pageState.set,
    setRoomWithPlayers: state.roomWithPlayers.set,
    setTakeoverSeatInFlight: state.takeoverSeatInFlight.set,
    takeoverSeatInFlight: null,
    ...overrides,
  };

  return {
    handlers: createMultiplayerRoomActionHandlers(input),
    input,
    nextRoom,
    services,
    state,
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("multiplayer room and lobby actions", () => {
  it("toggles the ready state to the inverse current value", async () => {
    const harness = actionHarness();

    await harness.handlers.handleToggleReady();

    expect(harness.services.sendRoomIntentWithLobbyRetry).toHaveBeenCalledWith(
      "room",
      7,
      { type: "set-ready", ready: true },
      harness.input.session,
    );
    expect(harness.state.roomWithPlayers.value).toBe(harness.nextRoom);
    expect(harness.state.pageState.value).toBe("ready");
    expect(harness.state.isUpdatingReady.history).toEqual([true, false]);
  });

  it("refuses a second join submission while one is in flight", async () => {
    const harness = actionHarness({ isJoiningSeat: true });

    await harness.handlers.handleJoinSeat(1);

    expect(harness.services.sendRoomIntentWithLobbyRetry).not.toHaveBeenCalled();
    expect(harness.state.isJoiningSeat.history).toEqual([]);
  });

  it("leaves the current seat with the leave-seat lobby intent", async () => {
    const harness = actionHarness();

    await harness.handlers.handleLeaveSeat();

    expect(harness.services.sendRoomIntentWithLobbyRetry).toHaveBeenCalledWith(
      "room",
      7,
      { type: "leave-seat" },
      harness.input.session,
    );
    expect(harness.state.isLeavingSeat.history).toEqual([true, false]);
  });

  it("starts the game only for the host when the table can start", async () => {
    const notHost = actionHarness({ isHost: false });
    const notReady = actionHarness({ canStartGame: false });
    const allowed = actionHarness();

    await notHost.handlers.handleStartGame();
    await notReady.handlers.handleStartGame();
    await allowed.handlers.handleStartGame();

    expect(notHost.services.sendRoomIntent).not.toHaveBeenCalled();
    expect(notReady.services.sendRoomIntent).not.toHaveBeenCalled();
    expect(allowed.services.sendRoomIntent).toHaveBeenCalledWith(
      "room",
      7,
      { type: "start-game" },
      allowed.input.session,
    );
    expect(allowed.state.isStartingGame.history).toEqual([true, false]);
  });

  it("updates rules only in the lobby and closes the dialog after success", async () => {
    const playingRoom = roomView(7, "playing");
    const blocked = actionHarness({ roomWithPlayers: playingRoom });
    const allowed = actionHarness();

    await blocked.handlers.handleUpdateRules();
    await allowed.handlers.handleUpdateRules();

    expect(blocked.services.sendRoomIntentWithLobbyRetry).not.toHaveBeenCalled();
    expect(allowed.services.sendRoomIntentWithLobbyRetry).toHaveBeenCalledWith(
      "room",
      7,
      { type: "update-room-rules", rules: { presetId: "contree-kffr" } },
      allowed.input.session,
    );
    expect(allowed.state.isRulesOpen.value).toBe(false);
    expect(allowed.state.isUpdatingRules.history).toEqual([true, false]);
  });

  it("updates shared table preferences with update-room-presentation", async () => {
    const harness = actionHarness();
    const settings = { gameSpeed: "fast" as const, autoCollectTricks: false, trickDisplayMs: 700 };

    await harness.handlers.handleUpdateTablePreferences(settings);

    expect(harness.services.sendRoomIntent).toHaveBeenCalledWith(
      "room",
      7,
      { type: "update-room-presentation", settings },
      harness.input.session,
    );
    expect(harness.state.isUpdatingTablePreferences.history).toEqual([true, false]);
  });

  it("enables bot takeover for the requested seat", async () => {
    const harness = actionHarness();

    await harness.handlers.handleEnableBotTakeover(3);

    expect(harness.services.sendRoomIntent).toHaveBeenCalledWith(
      "room",
      7,
      { type: "enable-bot-takeover", seatIndex: 3 },
      harness.input.session,
    );
    expect(harness.state.takeoverSeatInFlight.history).toEqual([3, null]);
  });

  it("transfers host to the selected seat and closes and resets the dialog", async () => {
    const harness = actionHarness({ hostTransferSeat: 2 });

    await harness.handlers.handleTransferHost();

    expect(harness.services.sendRoomIntent).toHaveBeenCalledWith(
      "room",
      7,
      { type: "transfer-host", targetSeatIndex: 2 },
      harness.input.session,
    );
    expect(harness.state.isHostTransferOpen.value).toBe(false);
    expect(harness.state.hostTransferSeat.value).toBeNull();
    expect(harness.state.isTransferringHost.history).toEqual([true, false]);
  });

  it("always closes the forfeit confirmation", async () => {
    const sendRoomIntent = vi.fn<MultiplayerRoomActionServices["sendRoomIntent"]>(async () => {
      throw new Error("Abandon refusé");
    });
    const harness = actionHarness({}, { sendRoomIntent });

    await harness.handlers.handleForfeitGame();

    expect(harness.state.isForfeitConfirmationOpen.value).toBe(false);
    expect(harness.state.isForfeiting.history).toEqual([true, false]);
    expect(harness.state.error.value).toBe("Abandon refusé");
  });

  it("requests a rematch", async () => {
    const harness = actionHarness();

    await harness.handlers.handleRematch();

    expect(harness.services.sendRoomIntent).toHaveBeenCalledWith(
      "room",
      7,
      { type: "rematch" },
      harness.input.session,
    );
    expect(harness.state.isResettingRoom.history).toEqual([true, false]);
  });

  it("starts the next round only when the action is available", async () => {
    const blocked = actionHarness({ canShowNextRoundButton: false });
    const allowed = actionHarness();

    await blocked.handlers.handleStartNextRound();
    await allowed.handlers.handleStartNextRound();

    expect(blocked.services.sendRoomIntent).not.toHaveBeenCalled();
    expect(allowed.services.sendRoomIntent).toHaveBeenCalledWith(
      "room",
      7,
      { type: "next-round" },
      allowed.input.session,
    );
    expect(allowed.state.isStartingNextRound.history).toEqual([true, false]);
  });

  it("surfaces an API error and resets the associated in-flight flag", async () => {
    const sendRoomIntentWithLobbyRetry = vi.fn<MultiplayerRoomActionServices["sendRoomIntentWithLobbyRetry"]>(async () => {
      throw new Error("Place indisponible");
    });
    const harness = actionHarness({}, { sendRoomIntentWithLobbyRetry });

    await harness.handlers.handleJoinSeat(1);

    expect(harness.state.error.history).toEqual([null, "Place indisponible"]);
    expect(harness.state.isJoiningSeat.history).toEqual([true, false]);
  });
});
