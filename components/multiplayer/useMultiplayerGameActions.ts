"use client";

import { useRef, useState, type Dispatch, type SetStateAction } from "react";
import type { Session } from "@supabase/supabase-js";
import {
  errorMessage,
  type LoadRoomOptions,
  type MultiplayerRoomPageState,
} from "@/components/multiplayer/useMultiplayerRoomSync";
import type { BidValue, Card, ContractMode } from "@/engine/types";
import { MultiplayerApiError, sendRoomIntent } from "@/lib/multiplayerApi";
import type { PendingLocalPlay } from "@/lib/multiplayerOptimisticPlay";
import type { MultiplayerRoomView, RoomPlayerAction } from "@/lib/roomTypes";
import { getSupabaseClient } from "@/lib/supabaseClient";

type RoomSetter = Dispatch<SetStateAction<MultiplayerRoomView | null>>;
type ActionInFlightRef = { current: boolean };

export type MultiplayerGameActionServices = {
  getSupabaseClient: typeof getSupabaseClient;
  sendRoomIntent: typeof sendRoomIntent;
};

const DEFAULT_SERVICES: MultiplayerGameActionServices = {
  getSupabaseClient,
  sendRoomIntent,
};

export type UseMultiplayerGameActionsInput = {
  canBid: boolean;
  canPlayCard: boolean;
  loadRoom: (options?: LoadRoomOptions) => Promise<void>;
  roomWithPlayers: MultiplayerRoomView | null;
  session: Session | null;
  setError: Dispatch<SetStateAction<string | null>>;
  setPageState: Dispatch<SetStateAction<MultiplayerRoomPageState>>;
  setRoomWithPlayers: RoomSetter;
};

type CreateMultiplayerGameActionHandlersInput = UseMultiplayerGameActionsInput & {
  actionInFlightRef: ActionInFlightRef;
  services: MultiplayerGameActionServices;
  setIsPlayingCard: Dispatch<SetStateAction<boolean>>;
  setPendingLocalPlay: Dispatch<SetStateAction<PendingLocalPlay | null>>;
};

export function createMultiplayerGameActionHandlers({
  actionInFlightRef,
  canBid,
  canPlayCard,
  loadRoom,
  roomWithPlayers,
  services,
  session,
  setError,
  setIsPlayingCard,
  setPageState,
  setPendingLocalPlay,
  setRoomWithPlayers,
}: CreateMultiplayerGameActionHandlersInput) {
  async function handleRoomPlayerAction(action: RoomPlayerAction) {
    const supabase = services.getSupabaseClient();
    const isCardAction = action.type === "play-card";

    if (
      !supabase ||
      !roomWithPlayers ||
      !session ||
      (isCardAction ? !canPlayCard : !canBid) || actionInFlightRef.current
    ) {
      return;
    }

    actionInFlightRef.current = true;
    setIsPlayingCard(true);
    if (isCardAction) setPendingLocalPlay({ card: action.card, version: roomWithPlayers.room.state_version });
    setError(null);

    try {
      const nextRoom = await services.sendRoomIntent(
        roomWithPlayers.room.id,
        roomWithPlayers.room.state_version,
        { type: "game-action", action },
        session,
      );
      setRoomWithPlayers((current) => current && current.room.state_version > nextRoom.room.state_version ? current : nextRoom);
      setPageState("ready");
    } catch (playError) {
      setError(errorMessage(playError));
      if (playError instanceof MultiplayerApiError && playError.status === 409) void loadRoom({ silent: true });
    } finally {
      actionInFlightRef.current = false;
      setPendingLocalPlay(null);
      setIsPlayingCard(false);
    }
  }

  function handlePlayCard(card: Card) {
    void handleRoomPlayerAction({ type: "play-card", card });
  }

  function handleBid(value: BidValue, contractMode: ContractMode) {
    void handleRoomPlayerAction({ type: "bid", value, contractMode });
  }

  function handleCapot(contractMode: ContractMode) {
    void handleRoomPlayerAction({ type: "capot", contractMode });
  }

  function handleGenerale(contractMode: ContractMode) {
    void handleRoomPlayerAction({ type: "generale", contractMode });
  }

  function handlePass() {
    void handleRoomPlayerAction({ type: "pass" });
  }

  function handleCoinche() {
    void handleRoomPlayerAction({ type: "coinche" });
  }

  function handleSurcoinche() {
    void handleRoomPlayerAction({ type: "surcoinche" });
  }

  return {
    handleBid,
    handleCapot,
    handleCoinche,
    handleGenerale,
    handlePass,
    handlePlayCard,
    handleRoomPlayerAction,
    handleSurcoinche,
  };
}

export function useMultiplayerGameActions(
  input: UseMultiplayerGameActionsInput,
  services: MultiplayerGameActionServices = DEFAULT_SERVICES,
) {
  const [isPlayingCard, setIsPlayingCard] = useState(false);
  const [pendingLocalPlay, setPendingLocalPlay] = useState<PendingLocalPlay | null>(null);
  const actionInFlightRef = useRef(false);
  const handlers = createMultiplayerGameActionHandlers({
    ...input,
    actionInFlightRef,
    services,
    setIsPlayingCard,
    setPendingLocalPlay,
  });

  return {
    ...handlers,
    isPlayingCard,
    pendingLocalPlay,
  };
}
