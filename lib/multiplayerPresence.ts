import type { RoomPlayerRow, RoomPlayerView } from "@/lib/roomTypes";

export const PRESENCE_HEARTBEAT_INTERVAL_MS = 15_000;
export const PRESENCE_OFFLINE_TIMEOUT_MS = 60_000;

export type PresenceHeartbeatWrite = {
  roomId: string;
  userId: string;
  isConnected: true;
  lastSeenAt: string;
};

export type PresenceHeartbeatWriter = (write: PresenceHeartbeatWrite) => Promise<boolean>;

export class PresenceMembershipError extends Error {
  constructor() {
    super("The user does not own a human seat in this room.");
    this.name = "PresenceMembershipError";
  }
}

export async function recordPresenceHeartbeat(
  writer: PresenceHeartbeatWriter,
  input: { roomId: string; userId: string; now: Date },
): Promise<void> {
  const updated = await writer({
    roomId: input.roomId,
    userId: input.userId,
    isConnected: true,
    lastSeenAt: input.now.toISOString(),
  });
  if (!updated) throw new PresenceMembershipError();
}

export function isPlayerConnected(
  player: RoomPlayerRow,
  nowMs: number,
  timeoutMs = PRESENCE_OFFLINE_TIMEOUT_MS,
): boolean {
  if (player.kind === "empty") return false;
  if (player.kind === "bot") return player.is_connected;
  if (!player.last_seen_at) return false;
  const lastSeenMs = Date.parse(player.last_seen_at);
  return Number.isFinite(lastSeenMs) && lastSeenMs >= nowMs - timeoutMs;
}

export function projectRoomPlayers(players: RoomPlayerRow[], nowMs: number): RoomPlayerView[] {
  return players.map((player) => ({
    seat_index: player.seat_index,
    kind: player.kind,
    display_name: player.display_name,
    is_ready: player.is_ready,
    is_connected: isPlayerConnected(player, nowMs),
  }));
}
