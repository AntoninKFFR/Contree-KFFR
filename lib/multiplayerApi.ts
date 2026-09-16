import type { MultiplayerRoomView, RoomIntent } from "@/lib/roomTypes";
import type { CustomRulesetInput } from "@/engine/rulesets/custom";

type AccessTokenSource = { access_token: string };

type ErrorResponse = { data?: unknown; error?: string; code?: string };

export class MultiplayerApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
  ) {
    super(message);
    this.name = "MultiplayerApiError";
  }
}

async function request<T>(url: string, token: AccessTokenSource, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token.access_token}`,
      ...init?.headers,
    },
  });
  let body: ErrorResponse = {};
  try {
    body = await response.json() as ErrorResponse;
  } catch {
    // Preserve the HTTP status even when a proxy returns a non-JSON body.
  }
  if (!response.ok || body.data === undefined) {
    throw new MultiplayerApiError(
      body.error ?? "Action impossible.",
      response.status,
      body.code ?? "unknown_error",
    );
  }
  return body.data as T;
}

export function fetchRoomView(roomId: string, token: AccessTokenSource) {
  return request<MultiplayerRoomView>(`/api/multiplayer/rooms/${encodeURIComponent(roomId)}`, token);
}

export function sendPresenceHeartbeat(roomId: string, token: AccessTokenSource) {
  return request<MultiplayerRoomView>(
    `/api/multiplayer/rooms/${encodeURIComponent(roomId)}/presence`,
    token,
    { method: "POST" },
  );
}

export function sendRoomTick(roomId: string, token: AccessTokenSource) {
  return request<MultiplayerRoomView>(
    `/api/multiplayer/rooms/${encodeURIComponent(roomId)}/tick`,
    token,
    { method: "POST" },
  );
}

export function sendRoomIntent(
  roomId: string,
  expectedVersion: number,
  intent: RoomIntent,
  token: AccessTokenSource,
) {
  return request<MultiplayerRoomView>(
    `/api/multiplayer/rooms/${encodeURIComponent(roomId)}`,
    token,
    { method: "POST", body: JSON.stringify({ expectedVersion, intent }) },
  );
}

const RETRYABLE_LOBBY_INTENTS = new Set<RoomIntent["type"]>([
  "join-seat", "leave-seat", "set-ready", "update-room-rules",
]);

function lobbyRetryDecision(
  intent: RoomIntent,
  room: MultiplayerRoomView,
): "retry" | "complete" {
  if (room.room.status !== "lobby") {
    throw new MultiplayerApiError("La table n'est plus dans le lobby.", 409, "wrong_room_status");
  }
  if (intent.type === "join-seat") {
    if (room.viewerSeatIndex === intent.seatIndex) return "complete";
    const target = room.players.find((player) => player.seat_index === intent.seatIndex);
    if (!target || target.kind !== "empty") {
      throw new MultiplayerApiError("Cette place vient d'être prise.", 409, "seat_taken");
    }
  } else if (intent.type === "leave-seat") {
    if (room.viewerSeatIndex === null) return "complete";
  } else if (intent.type === "set-ready") {
    if (room.viewerSeatIndex === null) {
      throw new MultiplayerApiError("Tu n'es plus assis à cette table.", 409, "not_seated");
    }
    const seat = room.players.find((player) => player.seat_index === room.viewerSeatIndex);
    if (seat?.is_ready === intent.ready) return "complete";
  } else if (intent.type === "update-room-rules" && !room.isHost) {
    throw new MultiplayerApiError("Tu n'es plus l'hôte de cette table.", 403, "host_required");
  }
  return "retry";
}

export async function sendRoomIntentWithLobbyRetry(
  roomId: string,
  expectedVersion: number,
  intent: RoomIntent,
  token: AccessTokenSource,
): Promise<MultiplayerRoomView> {
  try {
    return await sendRoomIntent(roomId, expectedVersion, intent, token);
  } catch (error) {
    if (
      !(error instanceof MultiplayerApiError) ||
      error.code !== "version_conflict" ||
      !RETRYABLE_LOBBY_INTENTS.has(intent.type)
    ) {
      throw error;
    }
  }

  const latest = await fetchRoomView(roomId, token);
  if (lobbyRetryDecision(intent, latest) === "complete") return latest;
  try {
    return await sendRoomIntent(roomId, latest.room.state_version, intent, token);
  } catch (error) {
    if (error instanceof MultiplayerApiError && error.code === "version_conflict") {
      throw new MultiplayerApiError("La table vient encore de changer. Réessaie.", 409, "version_conflict");
    }
    throw error;
  }
}

export function createMultiplayerRoom(
  input: { rules: CustomRulesetInput },
  token: AccessTokenSource,
) {
  return request<MultiplayerRoomView>("/api/multiplayer/rooms", token, {
    method: "POST",
    body: JSON.stringify({ type: "create", ...input }),
  });
}

export function findMultiplayerRoom(code: string, token: AccessTokenSource) {
  return request<MultiplayerRoomView>("/api/multiplayer/rooms", token, {
    method: "POST",
    body: JSON.stringify({ type: "find", code }),
  });
}
