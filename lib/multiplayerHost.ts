import { isPlayerConnected } from "@/lib/multiplayerPresence";
import type { RoomPlayerRow, RoomRow } from "@/lib/roomTypes";

function joinedAtMs(player: RoomPlayerRow): number {
  const value = player.joined_at ? Date.parse(player.joined_at) : Number.NaN;
  return Number.isFinite(value) ? value : Number.POSITIVE_INFINITY;
}

export function nextHostUserId(
  players: RoomPlayerRow[],
  currentHostUserId: string | null,
  nowMs: number,
): string | null {
  const remaining = players.filter(
    (player) => player.kind === "human" && player.user_id && player.user_id !== currentHostUserId,
  );
  const connected = remaining
    .filter((player) => isPlayerConnected(player, nowMs))
    .sort((first, second) => joinedAtMs(first) - joinedAtMs(second) || first.seat_index - second.seat_index);
  const selected = connected[0] ?? remaining.sort(
    (first, second) => first.seat_index - second.seat_index,
  )[0];
  return selected?.user_id ?? null;
}

export function canClaimRoomHost(
  room: RoomRow,
  players: RoomPlayerRow[],
  userId: string,
  nowMs: number,
): boolean {
  if (room.status === "cancelled" || room.host_user_id === userId) return false;
  const claimant = players.find(
    (player) => player.kind === "human" && player.user_id === userId,
  );
  if (!claimant || !isPlayerConnected(claimant, nowMs)) return false;
  const currentHost = players.find(
    (player) => player.kind === "human" && player.user_id === room.host_user_id,
  );
  return !currentHost || !isPlayerConnected(currentHost, nowMs);
}
