import type { ScoringMode } from "@/engine/types";
import type { MultiplayerRoomView, RoomIntent } from "@/lib/roomTypes";

type AccessTokenSource = { access_token: string };

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
  const body = (await response.json()) as { data?: T; error?: string };
  if (!response.ok || !body.data) throw new Error(body.error ?? "Action impossible.");
  return body.data;
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

export function createMultiplayerRoom(
  input: { displayName: string; scoringMode: ScoringMode; targetScore: number },
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
