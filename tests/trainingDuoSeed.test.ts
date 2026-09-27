import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { secureDuoSeed } from "@/lib/server/trainingDuoService";

describe("training duo seed", () => {
  it("produces safe cryptographic-sized integers with room for all generator offsets", () => {
    const values = Array.from({ length: 64 }, secureDuoSeed);
    expect(new Set(values).size).toBeGreaterThan(1);
    for (const value of values) {
      expect(Number.isSafeInteger(value)).toBe(true);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(Number.isSafeInteger(value + 9_000)).toBe(true);
    }
  });
});
