import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ client: vi.fn(), session: vi.fn(), rpc: vi.fn() }));
vi.mock("@/lib/supabaseClient", () => ({ getSupabaseClient: mocks.client }));
import { parseTrainingLeaderboardRows, readFriendsTrainingLeaderboard } from "@/lib/trainingLeaderboardClient";

const row = { username: "Alice", best_score: 9.75, best_duration_ms: null };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.client.mockReturnValue({ auth: { getSession: mocks.session }, rpc: mocks.rpc });
  mocks.session.mockResolvedValue({ data: { session: { access_token: "token" } } });
  mocks.rpc.mockResolvedValue({ data: [row], error: null });
});

describe("friends training leaderboard client", () => {
  it("reads only the selected axis and level and maps the three public fields", async () => {
    mocks.rpc.mockResolvedValue({ data: [{ ...row, hidden_user_id: "private" }], error: null });
    expect(await readFriendsTrainingLeaderboard("trick-recall", 4)).toEqual({ status: "ready", entries: [
      { username: "Alice", bestScore: 9.75, bestDurationMs: null },
    ] });
    expect(mocks.rpc).toHaveBeenCalledWith("get_friends_training_leaderboard", {
      p_axis_id: "trick-recall", p_level: 4,
    });
  });

  it("does not call the RPC without a session", async () => {
    mocks.session.mockResolvedValue({ data: { session: null } });
    expect(await readFriendsTrainingLeaderboard("trick-value", 1)).toEqual({ status: "signed-out", entries: [] });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("treats a failed RPC or malformed response as unavailable", async () => {
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { message: "failure" } })
      .mockResolvedValueOnce({ data: [{ ...row, best_score: 11 }], error: null });
    expect((await readFriendsTrainingLeaderboard("trick-value", 1)).status).toBe("failed");
    expect((await readFriendsTrainingLeaderboard("trick-value", 1)).status).toBe("failed");
  });

  it("accepts fractional scores and absent time", () => {
    expect(parseTrainingLeaderboardRows([row])).toEqual([
      { username: "Alice", bestScore: 9.75, bestDurationMs: null },
    ]);
  });

  it("rejects more than 50 rows and malformed usernames, scores or durations", () => {
    const invalid = [
      Array.from({ length: 51 }, () => row),
      [{ ...row, username: " " }],
      [{ ...row, username: "x".repeat(41) }],
      [{ ...row, best_score: NaN }],
      [{ ...row, best_score: 10.1 }],
      [{ ...row, best_score: -1 }],
      [{ ...row, best_duration_ms: -1 }],
      [{ ...row, best_duration_ms: 1.5 }],
      [{ ...row, best_duration_ms: undefined }],
      {},
    ];
    for (const value of invalid) expect(() => parseTrainingLeaderboardRows(value)).toThrow("invalid_training_leaderboard_response");
  });
});
