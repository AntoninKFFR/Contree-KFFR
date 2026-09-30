import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { applyProgressionAfterFinish } from "@/lib/server/progressionService";

const rpc = vi.hoisted(() => vi.fn());
vi.mock("server-only", () => ({}));
vi.mock("@/lib/server/supabaseAdmin", () => ({ getSupabaseAdmin: () => ({ rpc }) }));
beforeEach(() => { vi.clearAllMocks(); });
describe("multiplayer progression finish hook", () => {
  it("sends only the canonical game identity; SQL derives all recipients and rewards", async () => {
    rpc.mockResolvedValue({ data: "applied", error: null });
    await applyProgressionAfterFinish("canonical-game");
    expect(rpc).toHaveBeenCalledWith("apply_progression_multiplayer_game", { p_game_id: "canonical-game" });
  });
  it.each(["database", "network"])("isolates an XP %s failure from the game/archive/rating", async (failure) => {
    if (failure === "network") rpc.mockRejectedValue(new Error("private state"));
    else rpc.mockResolvedValue({ error: { code: "23514", message: "private state" } });
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(applyProgressionAfterFinish("game")).resolves.toBeUndefined();
    expect(JSON.stringify(log.mock.calls)).not.toContain("private state");
    log.mockRestore();
  });
  it("covers ordinary, bot, timer, takeover and forfeit archive paths through the shared hook", () => {
    const source = readFileSync("lib/server/multiplayerService.ts", "utf8");
    expect(source.match(/await applyRatingAfterFinish\(/g)).toHaveLength(3);
    expect(source).toContain("await applyProgressionAfterFinish(gameId)");
    expect(source).toContain("await applyProgressionAfterFinish(result.room.active_game_id)");
    const sql = readFileSync("supabase/migrations/20260930200000_progression_game_xp.sql", "utf8");
    expect(sql).toContain("after insert on public.multiplayer_games");
    expect(sql).not.toMatch(/insert into public.progression_multiplayer_jobs[^;]*select/i);
  });
});
