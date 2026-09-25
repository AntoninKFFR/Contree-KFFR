import type { Dispatch, SetStateAction } from "react";
import type { Session, SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import {
  createMultiplayerGameActionHandlers,
  type MultiplayerGameActionServices,
} from "@/components/multiplayer/useMultiplayerGameActions";
import type { MultiplayerRoomPageState } from "@/components/multiplayer/useMultiplayerRoomSync";
import type { Card, ContractMode } from "@/engine/types";
import { MultiplayerApiError } from "@/lib/multiplayerApi";
import type { PendingLocalPlay } from "@/lib/multiplayerOptimisticPlay";
import type { MultiplayerRoomView, RoomPlayerAction } from "@/lib/roomTypes";

type ActionInput = Parameters<typeof createMultiplayerGameActionHandlers>[0];

const card: Card = { suit: "hearts", rank: "A" };
const suitMode: ContractMode = { kind: "suit", suit: "hearts" };

function roomView(version = 7): MultiplayerRoomView {
  return {
    gameId: "00000000-0000-4000-8000-000000000001",
    room: {
      id: "room",
      code: "ABC123",
      status: "playing",
      scoring_mode: "ffb",
      target_score: 1_000,
      game_phase: "playing",
      state_version: version,
      turn_deadline_at: null,
      created_at: "",
      updated_at: "",
      started_at: "",
      finished_at: null,
    },
    players: [],
    isHost: false,
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
  serviceOverrides: Partial<MultiplayerGameActionServices> = {},
) {
  const currentRoom = roomView();
  const nextRoom = roomView(8);
  const state = {
    error: stateCell<string | null>("old error"),
    isPlayingCard: stateCell(false),
    pageState: stateCell<MultiplayerRoomPageState>("loading"),
    pendingLocalPlay: stateCell<PendingLocalPlay | null>(null),
    roomWithPlayers: stateCell<MultiplayerRoomView | null>(currentRoom),
  };
  const actionInFlightRef = { current: false };
  const loadRoom = vi.fn(async () => undefined);
  const services: MultiplayerGameActionServices = {
    getSupabaseClient: vi.fn(() => ({} as SupabaseClient)),
    sendRoomIntent: vi.fn(async () => nextRoom),
    ...serviceOverrides,
  };
  const input: ActionInput = {
    actionInFlightRef,
    canBid: true,
    canPlayCard: true,
    loadRoom,
    roomWithPlayers: currentRoom,
    services,
    session: session(),
    setError: state.error.set,
    setIsPlayingCard: state.isPlayingCard.set,
    setPageState: state.pageState.set,
    setPendingLocalPlay: state.pendingLocalPlay.set,
    setRoomWithPlayers: state.roomWithPlayers.set,
    ...overrides,
  };

  return {
    actionInFlightRef,
    handlers: createMultiplayerGameActionHandlers(input),
    input,
    loadRoom,
    nextRoom,
    services,
    state,
  };
}

describe("multiplayer game actions", () => {
  it("ignores actions when Supabase is unavailable", async () => {
    const harness = actionHarness({}, { getSupabaseClient: vi.fn(() => null) });

    await harness.handlers.handleRoomPlayerAction({ type: "pass" });

    expect(harness.services.sendRoomIntent).not.toHaveBeenCalled();
  });

  it("ignores actions when the room is missing", async () => {
    const harness = actionHarness({ roomWithPlayers: null });

    await harness.handlers.handleRoomPlayerAction({ type: "pass" });

    expect(harness.services.sendRoomIntent).not.toHaveBeenCalled();
  });

  it("ignores actions when the session is missing", async () => {
    const harness = actionHarness({ session: null });

    await harness.handlers.handleRoomPlayerAction({ type: "pass" });

    expect(harness.services.sendRoomIntent).not.toHaveBeenCalled();
  });

  it("requires canPlayCard for a card action", async () => {
    const harness = actionHarness({ canPlayCard: false });

    await harness.handlers.handleRoomPlayerAction({ type: "play-card", card });

    expect(harness.services.sendRoomIntent).not.toHaveBeenCalled();
  });

  it("requires canBid for a bidding action", async () => {
    const harness = actionHarness({ canBid: false });

    await harness.handlers.handleRoomPlayerAction({ type: "pass" });

    expect(harness.services.sendRoomIntent).not.toHaveBeenCalled();
  });

  it("ignores a second action while the ref lock is active", async () => {
    const harness = actionHarness();
    harness.actionInFlightRef.current = true;

    await harness.handlers.handleRoomPlayerAction({ type: "pass" });

    expect(harness.services.sendRoomIntent).not.toHaveBeenCalled();
  });

  it("sets the lock, loading state, card pending state, and clears the error before a card request", async () => {
    const harness = actionHarness();
    vi.mocked(harness.services.sendRoomIntent).mockImplementation(async () => {
      expect(harness.actionInFlightRef.current).toBe(true);
      expect(harness.state.isPlayingCard.value).toBe(true);
      expect(harness.state.pendingLocalPlay.value).toEqual({ card, version: 7 });
      expect(harness.state.error.value).toBeNull();
      return harness.nextRoom;
    });

    await harness.handlers.handleRoomPlayerAction({ type: "play-card", card });

    expect(harness.services.sendRoomIntent).toHaveBeenCalledWith(
      "room",
      7,
      { type: "game-action", action: { type: "play-card", card } },
      harness.input.session,
    );
  });

  it("does not create optimistic card state for bidding actions", async () => {
    const harness = actionHarness();
    vi.mocked(harness.services.sendRoomIntent).mockImplementation(async () => {
      expect(harness.state.pendingLocalPlay.value).toBeNull();
      return harness.nextRoom;
    });

    await harness.handlers.handleRoomPlayerAction({ type: "pass" });

    expect(harness.state.pendingLocalPlay.history).toEqual([null]);
  });

  it("keeps a current room whose version is newer than the response", async () => {
    const newerCurrent = roomView(9);
    const harness = actionHarness();
    harness.state.roomWithPlayers.set(newerCurrent);

    await harness.handlers.handleRoomPlayerAction({ type: "pass" });

    expect(harness.state.roomWithPlayers.value).toBe(newerCurrent);
  });

  it("accepts the response when its version equals the current version", async () => {
    const equalVersionResponse = roomView(7);
    const harness = actionHarness({}, { sendRoomIntent: vi.fn(async () => equalVersionResponse) });

    await harness.handlers.handleRoomPlayerAction({ type: "pass" });

    expect(harness.state.roomWithPlayers.value).toBe(equalVersionResponse);
  });

  it("sets the page state to ready after success", async () => {
    const harness = actionHarness();

    await harness.handlers.handleRoomPlayerAction({ type: "pass" });

    expect(harness.state.pageState.value).toBe("ready");
  });

  it("reports ordinary request errors without reloading the room", async () => {
    const harness = actionHarness({}, {
      sendRoomIntent: vi.fn(async () => { throw new Error("request failed"); }),
    });

    await harness.handlers.handleRoomPlayerAction({ type: "pass" });

    expect(harness.state.error.value).toBe("request failed");
    expect(harness.loadRoom).not.toHaveBeenCalled();
  });

  it("silently reloads the room after an HTTP 409", async () => {
    const conflict = new MultiplayerApiError("Version obsolète", 409, "version_conflict");
    const harness = actionHarness({}, {
      sendRoomIntent: vi.fn(async () => { throw conflict; }),
    });

    await harness.handlers.handleRoomPlayerAction({ type: "pass" });

    expect(harness.state.error.value).toBe("Version obsolète");
    expect(harness.loadRoom).toHaveBeenCalledWith({ silent: true });
  });

  it("always releases the lock and clears optimistic state after failure", async () => {
    const harness = actionHarness({}, {
      sendRoomIntent: vi.fn(async () => { throw new Error("request failed"); }),
    });

    await harness.handlers.handleRoomPlayerAction({ type: "play-card", card });

    expect(harness.actionInFlightRef.current).toBe(false);
    expect(harness.state.pendingLocalPlay.value).toBeNull();
    expect(harness.state.isPlayingCard.value).toBe(false);
  });

  it("releases the lock and clears optimistic state after success", async () => {
    const harness = actionHarness();

    await harness.handlers.handleRoomPlayerAction({ type: "play-card", card });

    expect(harness.actionInFlightRef.current).toBe(false);
    expect(harness.state.pendingLocalPlay.value).toBeNull();
    expect(harness.state.isPlayingCard.value).toBe(false);
  });

  const wrapperCases: Array<{
    name: string;
    expected: RoomPlayerAction;
    invoke: (handlers: ReturnType<typeof createMultiplayerGameActionHandlers>) => void;
  }> = [
    { name: "play-card", expected: { type: "play-card", card }, invoke: (handlers) => handlers.handlePlayCard(card) },
    { name: "bid", expected: { type: "bid", value: 100, contractMode: suitMode }, invoke: (handlers) => handlers.handleBid(100, suitMode) },
    { name: "capot", expected: { type: "capot", contractMode: suitMode }, invoke: (handlers) => handlers.handleCapot(suitMode) },
    { name: "generale", expected: { type: "generale", contractMode: suitMode }, invoke: (handlers) => handlers.handleGenerale(suitMode) },
    { name: "pass", expected: { type: "pass" }, invoke: (handlers) => handlers.handlePass() },
    { name: "coinche", expected: { type: "coinche" }, invoke: (handlers) => handlers.handleCoinche() },
    { name: "surcoinche", expected: { type: "surcoinche" }, invoke: (handlers) => handlers.handleSurcoinche() },
  ];

  it.each(wrapperCases)("keeps the exact $name wrapper payload", async ({ expected, invoke }) => {
    const harness = actionHarness();

    invoke(harness.handlers);

    await vi.waitFor(() => expect(harness.services.sendRoomIntent).toHaveBeenCalled());
    expect(harness.services.sendRoomIntent).toHaveBeenCalledWith(
      "room",
      7,
      { type: "game-action", action: expected },
      harness.input.session,
    );
  });
});
