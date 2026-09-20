"use client";

import { useState, type Dispatch, type SetStateAction } from "react";
import type { Session } from "@supabase/supabase-js";
import { errorMessage, type MultiplayerRoomPageState } from "@/components/multiplayer/useMultiplayerRoomSync";
import type { CustomRulesetInput } from "@/engine/rulesets/custom";
import { sendRoomIntent, sendRoomIntentWithLobbyRetry } from "@/lib/multiplayerApi";
import type { MultiplayerTablePreferences } from "@/lib/multiplayerTablePreferences";
import type { MultiplayerRoomView, RoomPlayerRow, RoomPlayerView } from "@/lib/roomTypes";
import { getSupabaseClient } from "@/lib/supabaseClient";

type RoomSetter = Dispatch<SetStateAction<MultiplayerRoomView | null>>;
type SeatIndex = RoomPlayerRow["seat_index"];

export type MultiplayerRoomActionServices = {
  getSupabaseClient: typeof getSupabaseClient;
  sendRoomIntent: typeof sendRoomIntent;
  sendRoomIntentWithLobbyRetry: typeof sendRoomIntentWithLobbyRetry;
};

const DEFAULT_SERVICES: MultiplayerRoomActionServices = {
  getSupabaseClient,
  sendRoomIntent,
  sendRoomIntentWithLobbyRetry,
};

export type UseMultiplayerRoomActionsInput = {
  canShowNextRoundButton: boolean;
  canStartGame: boolean;
  currentSeat: RoomPlayerView | null;
  hostTransferSeat: SeatIndex | null;
  isHost: boolean;
  profileUsername: string | null;
  roomWithPlayers: MultiplayerRoomView | null;
  rulesDraft: CustomRulesetInput;
  session: Session | null;
  setError: Dispatch<SetStateAction<string | null>>;
  setHostTransferSeat: Dispatch<SetStateAction<SeatIndex | null>>;
  setIsForfeitConfirmationOpen: Dispatch<SetStateAction<boolean>>;
  setIsHostTransferOpen: Dispatch<SetStateAction<boolean>>;
  setIsRulesOpen: Dispatch<SetStateAction<boolean>>;
  setPageState: Dispatch<SetStateAction<MultiplayerRoomPageState>>;
  setRoomWithPlayers: RoomSetter;
};

type CreateMultiplayerRoomActionHandlersInput = UseMultiplayerRoomActionsInput & {
  isForfeiting: boolean;
  isJoiningSeat: boolean;
  isLeavingSeat: boolean;
  isResettingRoom: boolean;
  isStartingNextRound: boolean;
  isTransferringHost: boolean;
  isUpdatingTablePreferences: boolean;
  services: MultiplayerRoomActionServices;
  setIsForfeiting: Dispatch<SetStateAction<boolean>>;
  setIsJoiningSeat: Dispatch<SetStateAction<boolean>>;
  setIsLeavingSeat: Dispatch<SetStateAction<boolean>>;
  setIsResettingRoom: Dispatch<SetStateAction<boolean>>;
  setIsStartingGame: Dispatch<SetStateAction<boolean>>;
  setIsStartingNextRound: Dispatch<SetStateAction<boolean>>;
  setIsTransferringHost: Dispatch<SetStateAction<boolean>>;
  setIsUpdatingReady: Dispatch<SetStateAction<boolean>>;
  setIsUpdatingRules: Dispatch<SetStateAction<boolean>>;
  setIsUpdatingTablePreferences: Dispatch<SetStateAction<boolean>>;
  setTakeoverSeatInFlight: Dispatch<SetStateAction<SeatIndex | null>>;
  takeoverSeatInFlight: SeatIndex | null;
};

export function createMultiplayerRoomActionHandlers({
  canShowNextRoundButton,
  canStartGame,
  currentSeat,
  hostTransferSeat,
  isForfeiting,
  isHost,
  isJoiningSeat,
  isLeavingSeat,
  isResettingRoom,
  isStartingNextRound,
  isTransferringHost,
  isUpdatingTablePreferences,
  profileUsername,
  roomWithPlayers,
  rulesDraft,
  services,
  session,
  setError,
  setHostTransferSeat,
  setIsForfeitConfirmationOpen,
  setIsForfeiting,
  setIsHostTransferOpen,
  setIsJoiningSeat,
  setIsLeavingSeat,
  setIsResettingRoom,
  setIsRulesOpen,
  setIsStartingGame,
  setIsStartingNextRound,
  setIsTransferringHost,
  setIsUpdatingReady,
  setIsUpdatingRules,
  setIsUpdatingTablePreferences,
  setPageState,
  setRoomWithPlayers,
  setTakeoverSeatInFlight,
  takeoverSeatInFlight,
}: CreateMultiplayerRoomActionHandlersInput) {
  async function handleToggleReady() {
    const supabase = services.getSupabaseClient();

    if (!supabase || !roomWithPlayers || !session || !currentSeat) return;

    setIsUpdatingReady(true);
    setError(null);

    try {
      const nextRoom = await services.sendRoomIntentWithLobbyRetry(
        roomWithPlayers.room.id,
        roomWithPlayers.room.state_version,
        { type: "set-ready", ready: !currentSeat.is_ready },
        session,
      );
      setRoomWithPlayers(nextRoom);
      setPageState("ready");
    } catch (readyError) {
      setError(errorMessage(readyError));
    } finally {
      setIsUpdatingReady(false);
    }
  }

  async function handleJoinSeat(seatIndex: SeatIndex) {
    const supabase = services.getSupabaseClient();

    if (!supabase || !roomWithPlayers || !session || !profileUsername || isJoiningSeat) return;

    setIsJoiningSeat(true);
    setError(null);

    try {
      const nextRoom = await services.sendRoomIntentWithLobbyRetry(
        roomWithPlayers.room.id,
        roomWithPlayers.room.state_version,
        { type: "join-seat", seatIndex },
        session,
      );

      setRoomWithPlayers(nextRoom);
      setPageState("ready");
    } catch (joinError) {
      setError(errorMessage(joinError));
    } finally {
      setIsJoiningSeat(false);
    }
  }

  async function handleLeaveSeat() {
    const supabase = services.getSupabaseClient();

    if (!supabase || !roomWithPlayers || !session || !currentSeat || isLeavingSeat) return;

    setIsLeavingSeat(true);
    setError(null);

    try {
      const nextRoom = await services.sendRoomIntentWithLobbyRetry(
        roomWithPlayers.room.id,
        roomWithPlayers.room.state_version,
        { type: "leave-seat" },
        session,
      );

      setRoomWithPlayers(nextRoom);
      setPageState("ready");
    } catch (leaveError) {
      setError(errorMessage(leaveError));
    } finally {
      setIsLeavingSeat(false);
    }
  }

  async function handleStartGame() {
    const supabase = services.getSupabaseClient();

    if (!supabase || !roomWithPlayers || !isHost || !canStartGame) return;

    setIsStartingGame(true);
    setError(null);

    try {
      if (!session) return;
      const nextRoom = await services.sendRoomIntent(
        roomWithPlayers.room.id,
        roomWithPlayers.room.state_version,
        { type: "start-game" },
        session,
      );
      setRoomWithPlayers(nextRoom);
      setPageState("ready");
    } catch (startError) {
      setError(errorMessage(startError));
    } finally {
      setIsStartingGame(false);
    }
  }

  async function handleUpdateRules() {
    if (!roomWithPlayers || !session || !isHost || roomWithPlayers.room.status !== "lobby") return;
    setIsUpdatingRules(true);
    setError(null);
    try {
      const nextRoom = await services.sendRoomIntentWithLobbyRetry(roomWithPlayers.room.id, roomWithPlayers.room.state_version, { type: "update-room-rules", rules: rulesDraft }, session);
      setRoomWithPlayers(nextRoom);
      setIsRulesOpen(false);
    } catch (rulesError) {
      setError(errorMessage(rulesError));
    } finally {
      setIsUpdatingRules(false);
    }
  }

  async function handleUpdateTablePreferences(settings: MultiplayerTablePreferences) {
    if (!roomWithPlayers || !session || !isHost || isUpdatingTablePreferences) return;
    setIsUpdatingTablePreferences(true);
    setError(null);
    try {
      const nextRoom = await services.sendRoomIntent(
        roomWithPlayers.room.id,
        roomWithPlayers.room.state_version,
        { type: "update-room-presentation", settings },
        session,
      );
      setRoomWithPlayers(nextRoom);
    } catch (preferencesError) {
      setError(errorMessage(preferencesError));
    } finally {
      setIsUpdatingTablePreferences(false);
    }
  }

  async function handleEnableBotTakeover(seatIndex: SeatIndex) {
    if (!roomWithPlayers || !session || !isHost || takeoverSeatInFlight !== null) return;

    setTakeoverSeatInFlight(seatIndex);
    setError(null);
    try {
      const nextRoom = await services.sendRoomIntent(
        roomWithPlayers.room.id,
        roomWithPlayers.room.state_version,
        { type: "enable-bot-takeover", seatIndex },
        session,
      );
      setRoomWithPlayers(nextRoom);
      setPageState("ready");
    } catch (takeoverError) {
      setError(errorMessage(takeoverError));
    } finally {
      setTakeoverSeatInFlight(null);
    }
  }

  async function handleTransferHost() {
    if (!roomWithPlayers || !session || !isHost || hostTransferSeat === null || isTransferringHost) return;
    setIsTransferringHost(true);
    setError(null);
    try {
      const nextRoom = await services.sendRoomIntent(
        roomWithPlayers.room.id,
        roomWithPlayers.room.state_version,
        { type: "transfer-host", targetSeatIndex: hostTransferSeat },
        session,
      );
      setRoomWithPlayers(nextRoom);
      setPageState("ready");
      setIsHostTransferOpen(false);
      setHostTransferSeat(null);
    } catch (transferError) {
      setError(errorMessage(transferError));
    } finally {
      setIsTransferringHost(false);
    }
  }

  async function handleForfeitGame() {
    if (!roomWithPlayers || !session || isForfeiting) return;
    setIsForfeiting(true);
    setError(null);
    try {
      const nextRoom = await services.sendRoomIntent(
        roomWithPlayers.room.id,
        roomWithPlayers.room.state_version,
        { type: "forfeit-game" },
        session,
      );
      setRoomWithPlayers(nextRoom);
      setPageState("ready");
    } catch (forfeitError) {
      setError(errorMessage(forfeitError));
    } finally {
      setIsForfeiting(false);
      setIsForfeitConfirmationOpen(false);
    }
  }

  async function handleRematch() {
    const supabase = services.getSupabaseClient();

    if (!supabase || !roomWithPlayers || !session || isResettingRoom) return;

    setIsResettingRoom(true);
    setError(null);

    try {
      const nextRoom = await services.sendRoomIntent(
        roomWithPlayers.room.id,
        roomWithPlayers.room.state_version,
        { type: "rematch" },
        session,
      );
      setRoomWithPlayers(nextRoom);
      setPageState("ready");
    } catch (resetError) {
      setError(errorMessage(resetError));
    } finally {
      setIsResettingRoom(false);
    }
  }

  async function handleStartNextRound() {
    const supabase = services.getSupabaseClient();

    if (
      !supabase ||
      !roomWithPlayers ||
      !session ||
      !currentSeat ||
      !canShowNextRoundButton ||
      isStartingNextRound
    ) {
      return;
    }

    setIsStartingNextRound(true);
    setError(null);

    try {
      const nextRoom = await services.sendRoomIntent(
        roomWithPlayers.room.id,
        roomWithPlayers.room.state_version,
        { type: "next-round" },
        session,
      );
      setRoomWithPlayers(nextRoom);
      setPageState("ready");
    } catch (nextRoundError) {
      setError(errorMessage(nextRoundError));
    } finally {
      setIsStartingNextRound(false);
    }
  }

  return {
    handleEnableBotTakeover,
    handleForfeitGame,
    handleJoinSeat,
    handleLeaveSeat,
    handleRematch,
    handleStartGame,
    handleStartNextRound,
    handleToggleReady,
    handleTransferHost,
    handleUpdateRules,
    handleUpdateTablePreferences,
  };
}

export function useMultiplayerRoomActions(
  input: UseMultiplayerRoomActionsInput,
  services: MultiplayerRoomActionServices = DEFAULT_SERVICES,
) {
  const [isJoiningSeat, setIsJoiningSeat] = useState(false);
  const [isLeavingSeat, setIsLeavingSeat] = useState(false);
  const [isForfeiting, setIsForfeiting] = useState(false);
  const [isTransferringHost, setIsTransferringHost] = useState(false);
  const [takeoverSeatInFlight, setTakeoverSeatInFlight] = useState<SeatIndex | null>(null);
  const [isStartingNextRound, setIsStartingNextRound] = useState(false);
  const [isResettingRoom, setIsResettingRoom] = useState(false);
  const [isStartingGame, setIsStartingGame] = useState(false);
  const [isUpdatingReady, setIsUpdatingReady] = useState(false);
  const [isUpdatingRules, setIsUpdatingRules] = useState(false);
  const [isUpdatingTablePreferences, setIsUpdatingTablePreferences] = useState(false);

  const handlers = createMultiplayerRoomActionHandlers({
    ...input,
    isForfeiting,
    isJoiningSeat,
    isLeavingSeat,
    isResettingRoom,
    isStartingNextRound,
    isTransferringHost,
    isUpdatingTablePreferences,
    services,
    setIsForfeiting,
    setIsJoiningSeat,
    setIsLeavingSeat,
    setIsResettingRoom,
    setIsStartingGame,
    setIsStartingNextRound,
    setIsTransferringHost,
    setIsUpdatingReady,
    setIsUpdatingRules,
    setIsUpdatingTablePreferences,
    setTakeoverSeatInFlight,
    takeoverSeatInFlight,
  });

  return {
    ...handlers,
    isForfeiting,
    isJoiningSeat,
    isLeavingSeat,
    isResettingRoom,
    isStartingGame,
    isStartingNextRound,
    isTransferringHost,
    isUpdatingReady,
    isUpdatingRules,
    isUpdatingTablePreferences,
    takeoverSeatInFlight,
  };
}
