import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { assertDuoCanStart } from "@/lib/server/trainingDuoStart";
import type { TrainingDuoParticipantRow, TrainingDuoSessionRow } from "@/lib/server/trainingDuoProjection";

const NOW = Date.parse("2026-09-27T12:00:00Z");
const SESSION = { host_user_id: "a", status: "lobby" } as TrainingDuoSessionRow;
const PLAYERS = [
  { user_id: "a", is_ready: true, last_seen_at: new Date(NOW).toISOString(), left_at: null },
  { user_id: "b", is_ready: true, last_seen_at: new Date(NOW).toISOString(), left_at: null },
] as TrainingDuoParticipantRow[];

describe("duo start presence preflight", () => {
  it("accepts two ready online players and accepts again after reconnect", () => {
    expect(() => assertDuoCanStart(SESSION, PLAYERS, "a", NOW)).not.toThrow();
    const offline = PLAYERS.map((player) => player.user_id === "b"
      ? { ...player, last_seen_at: new Date(NOW - 61_000).toISOString() } : player);
    expect(() => assertDuoCanStart(SESSION, offline, "a", NOW)).toThrowError(
      "Ton partenaire doit être connecté pour démarrer.",
    );
    expect(() => assertDuoCanStart(SESSION, PLAYERS, "a", NOW)).not.toThrow();
  });

  it("rejects missing, unready, non-host and already-active starts", () => {
    expect(() => assertDuoCanStart(SESSION, PLAYERS.slice(0, 1), "a", NOW)).toThrow();
    expect(() => assertDuoCanStart(SESSION, [{ ...PLAYERS[0], is_ready: false }, PLAYERS[1]], "a", NOW)).toThrow();
    expect(() => assertDuoCanStart(SESSION, PLAYERS, "b", NOW)).toThrow();
    expect(() => assertDuoCanStart({ ...SESSION, status: "active" }, PLAYERS, "a", NOW)).toThrow();
  });
});
