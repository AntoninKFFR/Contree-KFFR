import type { Dispatch, SetStateAction } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  startRoomTickTimer,
  startTurnCountdown,
  turnSecondsRemainingForRoom,
  type MultiplayerRoomTimerEnvironment,
} from "@/components/multiplayer/useMultiplayerRoomTimers";
import { createInitialGame } from "@/engine/game";
import { toPlayerGameView } from "@/engine/views";
import { DEFAULT_MULTIPLAYER_TABLE_PREFERENCES } from "@/lib/multiplayerTablePreferences";
import { MULTIPLAYER_TICK_INTERVAL_MS, botPacingDelayMs } from "@/lib/multiplayerTurnTimer";
import type { MultiplayerRoomView, RoomPlayerView } from "@/lib/roomTypes";

const NOW_MS = Date.parse("2026-09-20T12:00:00.000Z");

function player(
  seat: 0 | 1 | 2 | 3,
  kind: RoomPlayerView["kind"] = "human",
  botTakeover = false,
): RoomPlayerView {
  return {
    seat_index: seat,
    kind,
    display_name: `P${seat}`,
    is_ready: true,
    is_connected: true,
    bot_takeover: botTakeover,
    is_host: seat === 0,
  };
}

function roomView({
  deadlineAt = new Date(NOW_MS + 45_000).toISOString(),
  currentKind = "human",
  botTakeover = false,
  status = "playing",
  version = 1,
}: {
  deadlineAt?: string | null;
  currentKind?: RoomPlayerView["kind"];
  botTakeover?: boolean;
  status?: MultiplayerRoomView["room"]["status"];
  version?: number;
} = {}): MultiplayerRoomView {
  const game = toPlayerGameView(createInitialGame(() => 0.1), 0);
  return {
    room: {
      id: "room",
      code: "ABC123",
      status,
      scoring_mode: "ffb",
      target_score: 1_000,
      game_phase: "bidding",
      state_version: version,
      turn_deadline_at: deadlineAt,
      created_at: "",
      updated_at: new Date(NOW_MS).toISOString(),
      started_at: "",
      finished_at: null,
    },
    players: [
      player(0, currentKind, botTakeover),
      player(1),
      player(2),
      player(3),
    ],
    isHost: true,
    canClaimHost: false,
    viewerSeatIndex: 0,
    game,
  };
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

function timerEnvironment(initialNowMs = NOW_MS) {
  let nowMs = initialNowMs;
  let nextId = 1;
  const timeouts = new Map<number, { listener: () => unknown; delayMs: number }>();
  const intervals = new Map<number, { listener: () => unknown; delayMs: number }>();
  const environment: MultiplayerRoomTimerEnvironment = {
    clearInterval: vi.fn((intervalId) => { intervals.delete(intervalId); }),
    clearTimeout: vi.fn((timeoutId) => { timeouts.delete(timeoutId); }),
    now: vi.fn(() => nowMs),
    setInterval: vi.fn((listener, delayMs) => {
      const id = nextId++;
      intervals.set(id, { listener, delayMs });
      return id;
    }),
    setTimeout: vi.fn((listener, delayMs) => {
      const id = nextId++;
      timeouts.set(id, { listener, delayMs });
      return id;
    }),
  };
  return {
    environment,
    intervals,
    setNow: (nextNowMs: number) => { nowMs = nextNowMs; },
    timeouts,
    invokeNextInterval: () => {
      const task = intervals.values().next().value as { listener: () => unknown } | undefined;
      if (!task) throw new Error("No interval scheduled");
      return task.listener();
    },
    invokeNextTimeout: () => {
      const entry = timeouts.entries().next().value as [number, { listener: () => unknown }] | undefined;
      if (!entry) throw new Error("No timeout scheduled");
      timeouts.delete(entry[0]);
      return entry[1].listener();
    },
  };
}

function tickInput(
  currentRoom: MultiplayerRoomView | null,
  environment: MultiplayerRoomTimerEnvironment,
  sendTick = vi.fn(async () => roomView({ version: 2 })),
) {
  const roomState = stateCell<MultiplayerRoomView | null>(currentRoom);
  return {
    input: {
      accessToken: "test-token",
      environment,
      roomId: "room",
      roomWithPlayers: currentRoom,
      sendTick,
      setRoomWithPlayers: roomState.set,
      tablePreferences: { ...DEFAULT_MULTIPLAYER_TABLE_PREFERENCES },
      viewerSeatIndex: currentRoom?.viewerSeatIndex ?? null,
    },
    roomState,
    sendTick,
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("multiplayer room timers", () => {
  it("does not schedule a tick outside playing status", () => {
    const { environment } = timerEnvironment();
    const { input, sendTick } = tickInput(roomView({ status: "lobby" }), environment);

    expect(startRoomTickTimer(input)).toBeUndefined();
    expect(environment.setTimeout).not.toHaveBeenCalled();
    expect(sendTick).not.toHaveBeenCalled();
  });

  it("does not schedule a tick without room id, token, room, or viewer seat", () => {
    const cases = [
      { roomId: null },
      { accessToken: null },
      { roomWithPlayers: null },
      { viewerSeatIndex: null },
    ];

    for (const missing of cases) {
      const { environment } = timerEnvironment();
      const { input, sendTick } = tickInput(roomView(), environment);
      expect(startRoomTickTimer({ ...input, ...missing })).toBeUndefined();
      expect(environment.setTimeout).not.toHaveBeenCalled();
      expect(sendTick).not.toHaveBeenCalled();
    }
  });

  it("uses the normal interval for a human turn", async () => {
    const timers = timerEnvironment();
    const { input, sendTick } = tickInput(roomView(), timers.environment);

    startRoomTickTimer(input);
    expect(timers.environment.setTimeout).toHaveBeenLastCalledWith(
      expect.any(Function),
      MULTIPLAYER_TICK_INTERVAL_MS,
    );

    await timers.invokeNextTimeout();
    expect(sendTick).toHaveBeenCalledOnce();
    expect(timers.environment.setTimeout).toHaveBeenLastCalledWith(
      expect.any(Function),
      MULTIPLAYER_TICK_INTERVAL_MS,
    );
  });

  it("uses botPacingDelayMs with the existing offset and resumes bot ticks after 500 ms", async () => {
    const timers = timerEnvironment();
    const currentRoom = roomView({ currentKind: "bot" });
    const { input, sendTick } = tickInput(currentRoom, timers.environment);
    const expectedPacing = botPacingDelayMs(
      "bidding",
      currentRoom.game?.currentTrick.cards.length ?? 0,
      currentRoom.game?.completedTricks.length ?? 0,
      input.tablePreferences,
    );

    startRoomTickTimer(input);
    expect(timers.environment.setTimeout).toHaveBeenLastCalledWith(
      expect.any(Function),
      expectedPacing + 30,
    );

    await timers.invokeNextTimeout();
    expect(sendTick).toHaveBeenCalledOnce();
    expect(timers.environment.setTimeout).toHaveBeenLastCalledWith(expect.any(Function), 500);
  });

  it("does not replace the current room with an older tick response", async () => {
    const timers = timerEnvironment();
    const currentRoom = roomView({ version: 5 });
    const sendTick = vi.fn(async () => roomView({ version: 4 }));
    const { input, roomState } = tickInput(currentRoom, timers.environment, sendTick);

    startRoomTickTimer(input);
    await timers.invokeNextTimeout();

    expect(roomState.value).toBe(currentRoom);
  });

  it("applies a strictly newer tick response", async () => {
    const timers = timerEnvironment();
    const currentRoom = roomView({ version: 5 });
    const nextRoom = roomView({ version: 6 });
    const sendTick = vi.fn(async () => nextRoom);
    const { input, roomState } = tickInput(currentRoom, timers.environment, sendTick);

    startRoomTickTimer(input);
    await timers.invokeNextTimeout();

    expect(roomState.value).toBe(nextRoom);
  });

  it("prevents a late tick response from updating after cleanup", async () => {
    const timers = timerEnvironment();
    const currentRoom = roomView({ version: 5 });
    let resolveTick: (room: MultiplayerRoomView) => void = () => undefined;
    const sendTick = vi.fn(() => new Promise<MultiplayerRoomView>((resolve) => {
      resolveTick = resolve;
    }));
    const { input, roomState } = tickInput(currentRoom, timers.environment, sendTick);

    const cleanup = startRoomTickTimer(input);
    const pendingTick = Promise.resolve(timers.invokeNextTimeout());
    cleanup?.();
    resolveTick(roomView({ version: 6 }));
    await pendingTick;

    expect(roomState.value).toBe(currentRoom);
    expect(timers.timeouts).toHaveLength(0);
    expect(timers.environment.clearTimeout).toHaveBeenCalledOnce();
  });

  it("returns null without a deadline", () => {
    expect(turnSecondsRemainingForRoom(roomView({ deadlineAt: null }), NOW_MS)).toBeNull();
  });

  it("returns null for a bot or takeover turn", () => {
    expect(turnSecondsRemainingForRoom(roomView({ currentKind: "bot" }), NOW_MS)).toBeNull();
    expect(turnSecondsRemainingForRoom(roomView({ botTakeover: true }), NOW_MS)).toBeNull();
  });

  it("rounds a human countdown upward with Math.ceil", () => {
    const currentRoom = roomView({ deadlineAt: new Date(NOW_MS + 5_001).toISOString() });
    expect(turnSecondsRemainingForRoom(currentRoom, NOW_MS)).toBe(6);
  });

  it("never returns a countdown below zero", () => {
    const currentRoom = roomView({ deadlineAt: new Date(NOW_MS - 1).toISOString() });
    expect(turnSecondsRemainingForRoom(currentRoom, NOW_MS)).toBe(0);
  });

  it("updates the countdown immediately and every second", () => {
    const timers = timerEnvironment();
    const nowState = stateCell<number | null>(null);
    const cleanup = startTurnCountdown(
      new Date(NOW_MS + 45_000).toISOString(),
      nowState.set,
      timers.environment,
    );

    expect(nowState.value).toBe(NOW_MS);
    expect(timers.environment.setInterval).toHaveBeenCalledWith(expect.any(Function), 1_000);
    timers.setNow(NOW_MS + 1_000);
    timers.invokeNextInterval();
    expect(nowState.value).toBe(NOW_MS + 1_000);
    cleanup?.();
    expect(timers.environment.clearInterval).toHaveBeenCalledOnce();
  });
});
