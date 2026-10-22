// Temporary development diagnostics. The schema deliberately excludes identities,
// URLs, headers, tokens, player names, response bodies and game data.
declare const __DEV__: boolean;
export type SeatTrace = {
  event: "touch" | "blocked" | "sync" | "post" | "http-send" | "http-response" | "http-failure" | "ack" | "reconcile" | "reconciled" | "confirmed" | "failed";
  seat?: number;
  active?: boolean;
  busy?: boolean;
  requiresSync?: boolean;
  expectedVersion?: number;
  receivedVersion?: number;
  viewerBefore?: number | null;
  viewerAfter?: number | null;
  httpStatus?: number;
  code?: string;
};
export function seatErrorCode(value: unknown): string {
  return typeof value === "string" && ["inactive", "busy", "session", "expired", "sync_required", "seat_occupied", "seat_not_confirmed", "wrong_room_status", "version_conflict", "invalid_response", "network", "http", "unauthorized", "forbidden", "not_found", "not_a_member", "rate_limited"].includes(value) ? value : "other";
}
export function traceSeat(value: SeatTrace) {
  if (typeof __DEV__ !== "undefined" && __DEV__) console.debug("[lobby-seat]", value);
}
