import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("atomic multiplayer rules updates", () => {
  const sql = readFileSync(
    "supabase/migrations/20260913020000_atomic_room_rules_update.sql",
    "utf8",
  );

  it("locks and CAS-checks the room before writing", () => {
    const firstWrite = sql.indexOf("update public.rooms");
    expect(sql).toContain("where room.id = p_room_id\n   for update");
    expect(sql.indexOf("current_room.state_version <> p_expected_version")).toBeLessThan(firstWrite);
  });

  it("rechecks host membership and lobby immutability in PostgreSQL", () => {
    expect(sql).toContain("current_room.host_user_id is distinct from p_actor_user_id");
    expect(sql).toContain("current_room.status <> 'lobby'");
    expect(sql).toContain("current_room.game_phase is not null");
    expect(sql).toContain("player.kind = 'human'");
  });

  it("stores the snapshot and resets readiness in the same transaction", () => {
    expect(sql).toContain("ruleset_snapshot = p_ruleset_snapshot");
    expect(sql).toContain("state_version = state_version + 1");
    expect(sql).toContain("set is_ready = (kind = 'bot')");
  });

  it("exposes the privileged RPC only to the service role", () => {
    expect(sql).toContain("from public, anon, authenticated");
    expect(sql).toContain("to service_role");
  });
});
