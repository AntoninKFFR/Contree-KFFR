"use client";

import { useEffect, useState, type Dispatch, type SetStateAction } from "react";
import { sendRoomTick } from "@/lib/multiplayerApi";
import type { MultiplayerRoomView } from "@/lib/roomTypes";
import type { MultiplayerTablePreferences } from "@/lib/multiplayerTablePreferences";
import { MULTIPLAYER_TICK_INTERVAL_MS, botPacingDelayMs } from "@/lib/multiplayerTurnTimer";

type RoomSetter = Dispatch<SetStateAction<MultiplayerRoomView | null>>;

export type MultiplayerRoomTimerEnvironment = {
  clearInterval: (intervalId: number) => void;
  clearTimeout: (timeoutId: number) => void;
  now: () => number;
  setInterval: (listener: () => void, delayMs: number) => number;
  setTimeout: (listener: () => void, delayMs: number) => number;
};

export type MultiplayerRoomTimerServices = {
  environment: MultiplayerRoomTimerEnvironment;
  sendRoomTick: typeof sendRoomTick;
};

const BROWSER_TIMER_ENVIRONMENT: MultiplayerRoomTimerEnvironment = {
  clearInterval: (intervalId) => window.clearInterval(intervalId),
  clearTimeout: (timeoutId) => window.clearTimeout(timeoutId),
  now: () => Date.now(),
  setInterval: (listener, delayMs) => window.setInterval(listener, delayMs),
  setTimeout: (listener, delayMs) => window.setTimeout(listener, delayMs),
};

const DEFAULT_SERVICES: MultiplayerRoomTimerServices = {
  environment: BROWSER_TIMER_ENVIRONMENT,
  sendRoomTick,
};

export function roomViewAfterTick(
  current: MultiplayerRoomView | null,
  nextRoom: MultiplayerRoomView,
): MultiplayerRoomView {
  return current && current.room.state_version >= nextRoom.room.state_version
    ? current
    : nextRoom;
}

type StartRoomTickTimerInput = {
  accessToken: string | null;
  environment: MultiplayerRoomTimerEnvironment;
  roomId: string | null;
  roomWithPlayers: MultiplayerRoomView | null;
  sendTick: typeof sendRoomTick;
  setRoomWithPlayers: RoomSetter;
  tablePreferences: MultiplayerTablePreferences;
  viewerSeatIndex: MultiplayerRoomView["viewerSeatIndex"];
};

export function startRoomTickTimer({
  accessToken,
  environment,
  roomId,
  roomWithPlayers,
  sendTick,
  setRoomWithPlayers,
  tablePreferences,
  viewerSeatIndex,
}: StartRoomTickTimerInput): (() => void) | undefined {
  if (
    !roomId ||
    !accessToken ||
    viewerSeatIndex === null ||
    roomWithPlayers?.room.status !== "playing"
  ) return;

  let active = true;
  let timerId: number;
  const game = roomWithPlayers.game;
  const seat = game
    ? roomWithPlayers.players.find((player) => player.seat_index === game.currentPlayerId)
    : null;
  const botTurn = game && (game.phase === "bidding" || game.phase === "playing")
    && (seat?.kind === "bot" || seat?.bot_takeover);
  const updatedAt = Date.parse(roomWithPlayers.room.updated_at);
  const dueAt = botTurn && Number.isFinite(updatedAt)
    ? updatedAt + botPacingDelayMs(
        game.phase as "bidding" | "playing",
        game.currentTrick.cards.length,
        game.completedTricks.length,
        tablePreferences,
      )
    : null;
  const tick = async () => {
    try {
      const nextRoom = await sendTick(roomId, { access_token: accessToken });
      if (active) {
        setRoomWithPlayers((current) => roomViewAfterTick(current, nextRoom));
      }
    } catch {
      // Another member or the next scheduled check can advance the room.
    } finally {
      if (active) {
        timerId = environment.setTimeout(
          tick,
          botTurn ? 500 : MULTIPLAYER_TICK_INTERVAL_MS,
        );
      }
    }
  };

  timerId = environment.setTimeout(
    tick,
    dueAt === null
      ? MULTIPLAYER_TICK_INTERVAL_MS
      : Math.max(0, dueAt - environment.now()) + 30,
  );
  return () => {
    active = false;
    environment.clearTimeout(timerId);
  };
}

export function turnSecondsRemainingForRoom(
  roomWithPlayers: MultiplayerRoomView | null,
  nowMs: number | null,
): number | null {
  const playerView = roomWithPlayers?.game ?? null;
  const deadlineMs = roomWithPlayers?.room.turn_deadline_at
    ? Date.parse(roomWithPlayers.room.turn_deadline_at)
    : Number.NaN;
  const timedPlayer = playerView
    ? roomWithPlayers?.players.find((player) => player.seat_index === playerView.currentPlayerId)
    : undefined;

  return nowMs !== null &&
    Number.isFinite(deadlineMs) &&
    timedPlayer?.kind === "human" &&
    !timedPlayer.bot_takeover &&
    (playerView?.phase === "bidding" || playerView?.phase === "playing")
    ? Math.max(0, Math.ceil((deadlineMs - nowMs) / 1000))
    : null;
}

export function startTurnCountdown(
  deadlineAt: string | null,
  setNowMs: Dispatch<SetStateAction<number | null>>,
  environment: MultiplayerRoomTimerEnvironment,
): (() => void) | undefined {
  if (!deadlineAt) {
    setNowMs(null);
    return;
  }

  setNowMs(environment.now());
  const intervalId = environment.setInterval(
    () => setNowMs(environment.now()),
    1_000,
  );
  return () => environment.clearInterval(intervalId);
}

type UseMultiplayerRoomTimersInput = {
  accessToken: string | null;
  roomId: string | null;
  roomWithPlayers: MultiplayerRoomView | null;
  setRoomWithPlayers: RoomSetter;
  tablePreferences: MultiplayerTablePreferences;
  viewerSeatIndex: MultiplayerRoomView["viewerSeatIndex"];
};

export function useMultiplayerRoomTimers(
  {
    accessToken,
    roomId,
    roomWithPlayers,
    setRoomWithPlayers,
    tablePreferences,
    viewerSeatIndex,
  }: UseMultiplayerRoomTimersInput,
  services: MultiplayerRoomTimerServices = DEFAULT_SERVICES,
) {
  const [countdownNowMs, setCountdownNowMs] = useState<number | null>(null);

  useEffect(() => startRoomTickTimer({
    accessToken,
    environment: services.environment,
    roomId,
    roomWithPlayers,
    sendTick: services.sendRoomTick,
    setRoomWithPlayers,
    tablePreferences,
    viewerSeatIndex,
  }), [
    accessToken,
    roomId,
    roomWithPlayers,
    services,
    setRoomWithPlayers,
    tablePreferences,
    viewerSeatIndex,
  ]);

  useEffect(() => startTurnCountdown(
    roomWithPlayers?.room.turn_deadline_at ?? null,
    setCountdownNowMs,
    services.environment,
  ), [roomWithPlayers?.room.turn_deadline_at, services]);

  return {
    turnSecondsRemaining: turnSecondsRemainingForRoom(roomWithPlayers, countdownNowMs),
  };
}
