import { beforeEach, describe, expect, it, vi } from "vitest";
import { assertProgressionArchiveReady, assertProgressionGameXpReady } from "@/lib/server/progressionReadiness";

const rpc = vi.hoisted(() => vi.fn());
vi.mock("server-only", () => ({}));
vi.mock("@/lib/server/supabaseAdmin", () => ({ getSupabaseAdmin: () => ({ rpc }) }));
beforeEach(() => { vi.clearAllMocks(); });
describe("Game XP rollout readiness", () => {
  it("accepts only the expected schema version", async () => {
    rpc.mockResolvedValue({data:"20260930200000",error:null});
    await expect(assertProgressionGameXpReady()).resolves.toBeUndefined();
    expect(rpc).toHaveBeenCalledWith("progression_game_xp_schema_version");
  });
  it.each([
    {data:null,error:{code:"PGRST202"}}, {data:"old",error:null}, {data:null,error:null},
  ])("fails closed for unavailable/incompatible schema %j", async (result) => {
    rpc.mockResolvedValue(result);
    await expect(assertProgressionGameXpReady()).rejects.toMatchObject({status:503,code:"progression_schema_not_ready"});
  });
  it("does not check schema for a nonterminal move", async () => {
    await assertProgressionArchiveReady(null);
    expect(rpc).not.toHaveBeenCalled();
  });
  it("does not cache failure or success across rollout retries", async () => {
    rpc.mockResolvedValueOnce({error:{code:"PGRST202"}}).mockResolvedValueOnce({data:"20260930200000",error:null});
    await expect(assertProgressionArchiveReady({game:{id:"game"}})).rejects.toMatchObject({status:503});
    await expect(assertProgressionArchiveReady({game:{id:"game"}})).resolves.toBeUndefined();
    expect(rpc).toHaveBeenCalledTimes(2);
  });
});
