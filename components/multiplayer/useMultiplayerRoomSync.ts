"use client";

import { useCallback, useEffect, useState, type Dispatch, type SetStateAction } from "react";
import type { Session, SupabaseClient } from "@supabase/supabase-js";
import { PRESENCE_HEARTBEAT_INTERVAL_MS } from "@/lib/multiplayerPresence";
import { ensureProfile } from "@/lib/profiles";
import { fetchRoomView, sendPresenceHeartbeat } from "@/lib/multiplayerApi";
import type { MultiplayerRoomView } from "@/lib/roomTypes";
import { subscribeToRoomRealtime } from "@/lib/roomRealtime";
import { getSupabaseClient } from "@/lib/supabaseClient";

export type MultiplayerRoomPageState = "loading" | "ready" | "signed-out" | "unavailable" | "missing";

export type LoadRoomOptions = {
  silent?: boolean;
};

type RoomSetter = Dispatch<SetStateAction<MultiplayerRoomView | null>>;

export type MultiplayerRoomSyncServices = {
  ensureProfile: typeof ensureProfile;
  fetchRoomView: (roomId: string, session: Session) => Promise<MultiplayerRoomView>;
  getSupabaseClient: () => SupabaseClient | null;
  sendPresenceHeartbeat: (
    roomId: string,
    token: { access_token: string },
  ) => Promise<MultiplayerRoomView>;
  subscribeToRoomRealtime: typeof subscribeToRoomRealtime;
};

const DEFAULT_SERVICES: MultiplayerRoomSyncServices = {
  ensureProfile,
  fetchRoomView,
  getSupabaseClient,
  sendPresenceHeartbeat,
  subscribeToRoomRealtime,
};

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Action impossible pour le moment.";
}

export function roomViewAfterLoad(
  current: MultiplayerRoomView | null,
  nextRoom: MultiplayerRoomView,
): MultiplayerRoomView {
  return current &&
    current.room.id === nextRoom.room.id &&
    current.room.state_version > nextRoom.room.state_version
    ? current
    : nextRoom;
}

export function roomViewAfterPresence(
  current: MultiplayerRoomView | null,
  nextRoom: MultiplayerRoomView,
): MultiplayerRoomView {
  return current && current.room.state_version > nextRoom.room.state_version
    ? current
    : nextRoom;
}

type LoadMultiplayerRoomInput = {
  options?: LoadRoomOptions;
  roomId: string | null;
  services: MultiplayerRoomSyncServices;
  setError: Dispatch<SetStateAction<string | null>>;
  setLocalDisplayName: Dispatch<SetStateAction<string>>;
  setPageState: Dispatch<SetStateAction<MultiplayerRoomPageState>>;
  setProfileUsername: Dispatch<SetStateAction<string | null>>;
  setRoomWithPlayers: RoomSetter;
  setSession: Dispatch<SetStateAction<Session | null>>;
};

export async function loadMultiplayerRoom({
  options = {},
  roomId,
  services,
  setError,
  setLocalDisplayName,
  setPageState,
  setProfileUsername,
  setRoomWithPlayers,
  setSession,
}: LoadMultiplayerRoomInput): Promise<void> {
  const supabase = services.getSupabaseClient();

  if (!supabase) {
    setPageState("unavailable");
    return;
  }

  if (!roomId) {
    setPageState("missing");
    return;
  }

  if (!options.silent) {
    setPageState("loading");
    setError(null);
  }

  const { data } = await supabase.auth.getSession();
  const nextSession = data.session;
  setSession(nextSession);

  if (!nextSession) {
    setPageState("signed-out");
    return;
  }

  const profileName = await services.ensureProfile(supabase, nextSession.user);
  setProfileUsername(profileName);
  setLocalDisplayName(profileName ?? "Profil sans pseudo");

  try {
    const nextRoom = await services.fetchRoomView(roomId, nextSession);
    setRoomWithPlayers((current) => roomViewAfterLoad(current, nextRoom));
    setError(null);
    setPageState("ready");
  } catch (loadError) {
    setRoomWithPlayers(null);
    setError(errorMessage(loadError));
    setPageState("missing");
  }
}

export function subscribeToMultiplayerRoomSync(
  supabase: SupabaseClient | null,
  roomId: string | null,
  loadRoom: (options?: LoadRoomOptions) => Promise<void>,
  subscribe: typeof subscribeToRoomRealtime = subscribeToRoomRealtime,
): (() => void) | undefined {
  if (!supabase || !roomId) return;
  return subscribe(supabase, roomId, () => loadRoom({ silent: true }));
}

export type PresenceEnvironment = {
  addDocumentListener: (listener: () => void) => void;
  addWindowListener: (type: "focus" | "online", listener: () => void) => void;
  clearInterval: (intervalId: number) => void;
  isVisible: () => boolean;
  removeDocumentListener: (listener: () => void) => void;
  removeWindowListener: (type: "focus" | "online", listener: () => void) => void;
  setInterval: (listener: () => void, delayMs: number) => number;
};

function browserPresenceEnvironment(): PresenceEnvironment {
  return {
    addDocumentListener: (listener) => document.addEventListener("visibilitychange", listener),
    addWindowListener: (type, listener) => window.addEventListener(type, listener),
    clearInterval: (intervalId) => window.clearInterval(intervalId),
    isVisible: () => document.visibilityState === "visible",
    removeDocumentListener: (listener) => document.removeEventListener("visibilitychange", listener),
    removeWindowListener: (type, listener) => window.removeEventListener(type, listener),
    setInterval: (listener, delayMs) => window.setInterval(listener, delayMs),
  };
}

type StartPresenceHeartbeatInput = {
  accessToken: string | null;
  environment: PresenceEnvironment;
  roomId: string | null;
  sendHeartbeat: MultiplayerRoomSyncServices["sendPresenceHeartbeat"];
  setPageState: Dispatch<SetStateAction<MultiplayerRoomPageState>>;
  setRoomWithPlayers: RoomSetter;
  viewerSeatIndex: MultiplayerRoomView["viewerSeatIndex"];
};

export function startPresenceHeartbeat({
  accessToken,
  environment,
  roomId,
  sendHeartbeat,
  setPageState,
  setRoomWithPlayers,
  viewerSeatIndex,
}: StartPresenceHeartbeatInput): (() => void) | undefined {
  if (!roomId || !accessToken || viewerSeatIndex === null) return;

  let active = true;
  let inFlight = false;
  const heartbeat = async () => {
    if (inFlight) return;
    inFlight = true;
    try {
      const nextRoom = await sendHeartbeat(roomId, { access_token: accessToken });
      if (active) {
        setRoomWithPlayers((current) => roomViewAfterPresence(current, nextRoom));
        setPageState("ready");
      }
    } catch {
      // A later heartbeat or visibility event will retry after transient connectivity failures.
    } finally {
      inFlight = false;
    }
  };

  void heartbeat();
  const intervalId = environment.setInterval(heartbeat, PRESENCE_HEARTBEAT_INTERVAL_MS);
  const handleVisibilityChange = () => {
    if (environment.isVisible()) void heartbeat();
  };
  const handleReturn = () => void heartbeat();
  environment.addDocumentListener(handleVisibilityChange);
  environment.addWindowListener("focus", handleReturn);
  environment.addWindowListener("online", handleReturn);

  return () => {
    active = false;
    environment.clearInterval(intervalId);
    environment.removeDocumentListener(handleVisibilityChange);
    environment.removeWindowListener("focus", handleReturn);
    environment.removeWindowListener("online", handleReturn);
  };
}

export function useMultiplayerRoomSync(
  roomId: string | null,
  services: MultiplayerRoomSyncServices = DEFAULT_SERVICES,
) {
  const [error, setError] = useState<string | null>(null);
  const [pageState, setPageState] = useState<MultiplayerRoomPageState>("loading");
  const [localDisplayName, setLocalDisplayName] = useState("Joueur");
  const [profileUsername, setProfileUsername] = useState<string | null>(null);
  const [roomWithPlayers, setRoomWithPlayers] = useState<MultiplayerRoomView | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const accessToken = session?.access_token ?? null;
  const viewerSeatIndex = roomWithPlayers?.viewerSeatIndex ?? null;

  const loadRoom = useCallback((options: LoadRoomOptions = {}) => loadMultiplayerRoom({
    options,
    roomId,
    services,
    setError,
    setLocalDisplayName,
    setPageState,
    setProfileUsername,
    setRoomWithPlayers,
    setSession,
  }), [roomId, services]);

  useEffect(() => {
    const supabase = services.getSupabaseClient();

    void loadRoom();

    if (!supabase) return;

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(() => {
      void loadRoom();
    });

    return () => subscription.unsubscribe();
  }, [loadRoom, services]);

  useEffect(() => subscribeToMultiplayerRoomSync(
    services.getSupabaseClient(),
    roomId,
    loadRoom,
    services.subscribeToRoomRealtime,
  ), [loadRoom, roomId, services]);

  useEffect(() => startPresenceHeartbeat({
    accessToken,
    environment: browserPresenceEnvironment(),
    roomId,
    sendHeartbeat: services.sendPresenceHeartbeat,
    setPageState,
    setRoomWithPlayers,
    viewerSeatIndex,
  }), [accessToken, roomId, services, viewerSeatIndex]);

  return {
    accessToken,
    error,
    loadRoom,
    localDisplayName,
    pageState,
    profileUsername,
    roomWithPlayers,
    session,
    setError,
    setPageState,
    setRoomWithPlayers,
    viewerSeatIndex,
  };
}
