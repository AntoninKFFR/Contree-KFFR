import { describe, expect, it, vi } from "vitest";
import { getMyProgression } from "@/lib/progression/queries";
import { getProgression } from "@/lib/progression/formulaV1";

describe("canonical own progression query", () => {
  it.each([0, 100, 550, 700, 1800, Number.MAX_SAFE_INTEGER])(
    "reads %i XP without accepting a user ID and uses the canonical helper", async (xp) => {
      const rpc = vi.fn().mockResolvedValue({ data: { total_xp: xp }, error: null });
      expect(await getMyProgression({ rpc } as never)).toEqual(getProgression(xp));
      expect(rpc).toHaveBeenCalledExactlyOnceWith("get_my_progression");
    },
  );
  it("returns level 1 for the database virtual state without writing", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: { total_xp: 0 }, error: null });
    expect(await getMyProgression({ rpc } as never)).toMatchObject({ totalXp: 0, level: 1 });
  });
  it.each([null, [], {}, { total_xp: "100" }, { total_xp: -1 }, { total_xp: 0.1 },
    { total_xp: Number.MAX_SAFE_INTEGER + 1 }])("rejects malformed data %j", async (data) => {
    const rpc = vi.fn().mockResolvedValue({ data, error: null });
    await expect(getMyProgression({ rpc } as never)).rejects.toThrow();
  });
  it("propagates errors instead of presenting failed reads as 0 XP", async () => {
    const error = new Error("permission denied");
    const rpc = vi.fn().mockResolvedValue({ data: null, error });
    await expect(getMyProgression({ rpc } as never)).rejects.toBe(error);
  });
});
