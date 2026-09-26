import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ client: vi.fn(), getSession: vi.fn(), from: vi.fn(), select: vi.fn() }));
vi.mock("@/lib/supabaseClient", () => ({ getSupabaseClient: mocks.client }));
import { submitCompletedPuzzleSeries } from "@/lib/trainingApi";
import { readAccountTrainingRecords } from "@/lib/trainingRecordsClient";

const completed = { axisId: "trick-value" as const, level: 1, seed: 480_000,
  answers: Array.from({ length: 10 }, () => ({ kind: "number" as const, value: 0 })), durationMs: 12_345 };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.client.mockReturnValue({ auth: { getSession: mocks.getSession }, from: mocks.from });
  mocks.from.mockReturnValue({ select: mocks.select });
});

describe("training account client", () => {
  it("never posts a series without a session", async () => {
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    mocks.getSession.mockResolvedValue({ data: { session: null } });
    expect(await submitCompletedPuzzleSeries(completed)).toBe("signed-out");
    expect(fetcher).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it("sends raw answers and reproduction metadata, without score or expected values", async () => {
    mocks.getSession.mockResolvedValue({ data: { session: { access_token: "test-jwt" } } });
    const fetcher = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetcher);
    expect(await submitCompletedPuzzleSeries(completed)).toBe("saved");
    const [url, init] = fetcher.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/training/series");
    expect(init.headers).toMatchObject({ Authorization: "Bearer test-jwt" });
    const body = JSON.parse(init.body as string);
    expect(body).toMatchObject({ axisId: "trick-value", axisVersion: 1, rulesetId: "contree-kffr",
      rulesetVersion: 1, generatorVersion: 1, seed: 480_000, durationMs: 12_345, timed: true });
    expect(body.answers).toHaveLength(10);
    expect(body).not.toHaveProperty("score");
    expect(JSON.stringify(body)).not.toMatch(/expectedIds|expectedCells|hands|gameState/i);
    vi.unstubAllGlobals();
  });

  it("reads account records through the ordinary authenticated Supabase client", async () => {
    mocks.getSession.mockResolvedValue({ data: { session: { access_token: "test-jwt" } } });
    mocks.select.mockResolvedValue({ data: [{ axis_id: "trick-value", level: 1, best_score: 10, best_duration_ms: 42_300 }], error: null });
    expect(await readAccountTrainingRecords()).toEqual({ signedIn: true, failed: false,
      records: [{ axisId: "trick-value", level: 1, bestScore: 10, bestDurationMs: 42_300 }] });
    expect(mocks.from).toHaveBeenCalledWith("training_records");
    expect(mocks.select).toHaveBeenCalledWith("axis_id,level,best_score,best_duration_ms");
  });
});
