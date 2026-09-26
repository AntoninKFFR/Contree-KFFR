import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { generatorVersion } from "@/engine/training/generator";
import { generateTrickValueSeries } from "@/engine/training/trickValue";

const mocks = vi.hoisted(() => ({ auth: vi.fn(), admin: vi.fn(), rpc: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/server/supabaseAdmin", () => ({ authenticatedUserId: mocks.auth, getSupabaseAdmin: mocks.admin }));

import { POST } from "@/app/api/training/series/route";

const userId = "11111111-1111-4111-8111-111111111111";
let payload: Record<string, unknown>;

beforeAll(() => {
  const seed = 480_000;
  payload = { axisId: "trick-value", axisVersion: 1, level: 1, rulesetId: "contree-kffr",
    rulesetVersion: 1, generatorVersion, seed, durationMs: 20_000, timed: true,
    answers: generateTrickValueSeries({ seed, level: 1, generatorVersion })
      .map((exercise) => ({ kind: "number", value: exercise.answer })) };
});

function request(body: unknown, token = "valid-user-jwt") {
  return new Request("http://localhost/api/training/series", { method: "POST",
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body) });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.auth.mockImplementation(async (incoming: Request) => {
    if (incoming.headers.get("authorization") !== "Bearer valid-user-jwt") throw new Error("Authentication required.");
    return userId;
  });
  mocks.admin.mockReturnValue({ rpc: mocks.rpc });
  mocks.rpc.mockImplementation(async (_name: string, args: Record<string, unknown>) => ({ error: null, data: {
    series: { id: "series-id", axis_id: args.p_axis_id, level: args.p_level, score: args.p_score,
      question_count: args.p_question_count, duration_ms: args.p_duration_ms, timed: args.p_timed,
      created_at: "2026-09-26T00:00:00Z" },
    record: { axis_id: args.p_axis_id, level: args.p_level, best_score: args.p_score,
      best_duration_ms: args.p_duration_ms, updated_at: "2026-09-26T00:00:00Z" },
  } }));
});

describe("POST /api/training/series", () => {
  it.each(["", "expired-jwt"])("returns 401 for missing or invalid Bearer token (%s)", async (token) => {
    const response = await POST(request(payload, token));
    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({ code: "authentication_required" });
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  });

  it("rejects malformed and oversized bodies before replay", async () => {
    const invalid = new Request("http://localhost/api/training/series", { method: "POST",
      headers: { Authorization: "Bearer valid-user-jwt", "Content-Type": "application/json" }, body: "{" });
    expect((await POST(invalid)).status).toBe(400);
    const oversized = await POST(request({ ...payload, filler: "x".repeat(70_000) }));
    expect(oversized.status).toBe(400);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("ignores a forged score and writes only the replayed score for the JWT user", async () => {
    const response = await POST(request({ ...payload, score: 999 }));
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    await expect(response.json()).resolves.toMatchObject({ data: { series: { score: 10, questionCount: 10 },
      record: { bestScore: 10 } } });
    expect(mocks.rpc).toHaveBeenCalledWith("record_verified_training_series", expect.objectContaining({
      p_user_id: userId, p_score: 10, p_question_count: 10,
    }));
    const sent = mocks.rpc.mock.calls[0][1] as Record<string, unknown>;
    expect(sent).not.toHaveProperty("score");
    expect(sent).not.toHaveProperty("userId");
    expect(JSON.stringify(sent)).not.toContain("999");
  });

  it("sanitizes internal database errors", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.rpc.mockResolvedValue({ data: null, error: { code: "XX000", message: "sb_secret_password SQL failure" } });
    const response = await POST(request(payload));
    expect(response.status).toBe(500);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    const body = await response.json();
    expect(body).toEqual({ error: "Erreur serveur.", code: "server_error" });
    expect(JSON.stringify(body)).not.toMatch(/secret|SQL|password/i);
    spy.mockRestore();
  });
});
