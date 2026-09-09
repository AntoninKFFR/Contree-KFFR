import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("atomic multiplayer seat moves", () => {
  const sql = readFileSync(
    "supabase/migrations/20260909050000_atomic_room_seat_moves.sql",
    "utf8",
  );

  it("serializes the room and its seats before moving a player", () => {
    expect(sql).toContain("where room.id = p_room_id\n   for update");
    expect(sql).toContain("order by player.seat_index\n   for update");
  });

  it("checks lobby and CAS state_version before any seat write", () => {
    const firstSeatWrite = sql.indexOf("update public.room_players");
    expect(sql.indexOf("current_room_status <> 'lobby'")).toBeLessThan(firstSeatWrite);
    expect(sql.indexOf("current_room_version <> p_expected_version")).toBeLessThan(firstSeatWrite);
    expect(sql).toContain("set state_version = state_version + 1");
  });

  it("clears the former seat before assigning the free target in one transaction", () => {
    const clear = sql.indexOf("set kind = 'empty'");
    const assign = sql.indexOf("set kind = 'human'");
    expect(clear).toBeGreaterThan(0);
    expect(assign).toBeGreaterThan(clear);
    expect(sql).toContain("kind = 'human' and user_id = p_actor_user_id");
    expect(sql).toContain("room_id = p_room_id and kind = 'empty'");
  });

  it("keeps the database uniqueness guard for users and seat rows", () => {
    const base = readFileSync(
      "supabase/migrations/20260908000000_server_authoritative_multiplayer.sql",
      "utf8",
    );
    expect(base).toContain("unique (room_id, seat_index)");
    expect(base).toContain("room_players_one_active_seat_per_user");
  });
});
