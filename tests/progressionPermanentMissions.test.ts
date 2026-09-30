import { describe, expect, it, vi } from "vitest";
import { getMyPermanentMissions } from "@/lib/progression/queries";
import { permanentMissionKeys } from "@/lib/progression/permanentMissions";
import { xpSourceLabel } from "@/lib/progression/format";
const rows = permanentMissionKeys.map((key,index) => ({key,rewardXp:[100,150,100,150,100][index],completed:false,completedAt:null}));
describe("own permanent missions query", () => {
  it("uses no account argument, server rewards and excludes audit fields", async () => {
    const rpc = vi.fn().mockResolvedValue({data:rows.map(r => ({...r,source_id:"private"})),error:null});
    expect(await getMyPermanentMissions({rpc} as never)).toEqual(rows);
    expect(rpc).toHaveBeenCalledExactlyOnceWith("get_my_permanent_missions");
    expect(xpSourceLabel("permanent_mission")).toBe("Mission");
  });
  it.each([null,[],[...rows].reverse(),rows.map(r => ({...r,rewardXp:-1})),rows.map(r => ({...r,completed:true})),
    rows.map(r => ({...r,completedAt:"2026-10-01"}))])("rejects broken contracts %j", async data => {
    await expect(getMyPermanentMissions({rpc:vi.fn().mockResolvedValue({data,error:null})} as never)).rejects.toThrow();
  });
  it("propagates read failures", async () => {
    await expect(getMyPermanentMissions({rpc:vi.fn().mockResolvedValue({data:null,error:new Error("DB")})} as never)).rejects.toThrow("DB");
  });
});
