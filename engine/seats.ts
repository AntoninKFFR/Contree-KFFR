import type { PlayerId } from "./types";

export type PlayerKind = "human" | "bot" | "empty";

export type SeatController = {
  kind: PlayerKind;
};

export type SeatAssignments = Record<PlayerId, SeatController>;

const PLAYER_IDS: PlayerId[] = [0, 1, 2, 3];

export const SOLO_SEAT_ASSIGNMENTS: SeatAssignments = {
  0: { kind: "human" },
  1: { kind: "bot" },
  2: { kind: "bot" },
  3: { kind: "bot" },
};

export function getSeatController(
  seatAssignments: SeatAssignments,
  playerId: PlayerId,
): SeatController {
  return seatAssignments[playerId];
}

export function isHumanSeat(seatAssignments: SeatAssignments, playerId: PlayerId): boolean {
  return getSeatController(seatAssignments, playerId).kind === "human";
}

export function isBotSeat(seatAssignments: SeatAssignments, playerId: PlayerId): boolean {
  return getSeatController(seatAssignments, playerId).kind === "bot";
}

export function isEmptySeat(seatAssignments: SeatAssignments, playerId: PlayerId): boolean {
  return getSeatController(seatAssignments, playerId).kind === "empty";
}

export function firstHumanSeat(seatAssignments: SeatAssignments): PlayerId | null {
  return PLAYER_IDS.find((playerId) => isHumanSeat(seatAssignments, playerId)) ?? null;
}
