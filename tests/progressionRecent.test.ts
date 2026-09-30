import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getMyRecentXpEvents } from "@/lib/progression/queries";
import { formatXp } from "@/lib/progression/format";

describe("recent owner XP query", () => {
  it("selects five ordered public presentation fields, with no source identity", async () => {
    const query = {select:vi.fn().mockReturnThis(),order:vi.fn().mockReturnThis(),limit:vi.fn().mockResolvedValue({data:[{amount:30,source_type:"solo_game",created_at:"2026-09-30T12:00:00Z"}],error:null})};
    const from = vi.fn().mockReturnValue(query);
    expect(await getMyRecentXpEvents({from} as unknown as SupabaseClient)).toEqual([{amount:30,sourceType:"solo_game",createdAt:"2026-09-30T12:00:00Z"}]);
    expect(from).toHaveBeenCalledWith("progression_xp_events");
    expect(query.select).toHaveBeenCalledWith("amount,source_type,created_at");
    expect(query.limit).toHaveBeenCalledWith(5);
  });
  it("formats French integers without decimals", () => {
    expect(formatXp(1540).replace(/\s/g," ")).toBe("1 540 XP");
  });
});
