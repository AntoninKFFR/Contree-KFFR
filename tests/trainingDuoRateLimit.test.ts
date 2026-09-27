import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import {
  DUO_RATE_LIMITS, DUO_RATE_WINDOW_SECONDS, duoRateLimitKeys, enforceDuoRateLimit,
} from "@/lib/server/trainingDuoRateLimit";
import { TrainingDuoError } from "@/lib/server/trainingDuoError";

const SECRET = "unit-test-server-secret";
function request(code = "ABCDEFGHIJ", ip = "203.0.113.7") {
  return new Request("http://localhost/api/training/duo/sessions/join", {
    method: "POST", headers: {
      "x-vercel-forwarded-for": ip,
      "x-forwarded-for": "198.51.100.99",
    }, body: JSON.stringify({ code }),
  });
}

describe("training duo rate limit policy", () => {
  it("uses the JWT account and trusted Vercel IP, never a body code or raw IP", async () => {
    const first = duoRateLimitKeys(request(), "account-a", SECRET, true);
    expect(first).toEqual(duoRateLimitKeys(request("ZZZZZZZZZZ"), "account-a", SECRET, true));
    const second = duoRateLimitKeys(request(), "account-b", SECRET, true);
    expect(second.accountHash).not.toBe(first.accountHash);
    expect(second.ipHash).toBe(first.ipHash);
    expect(duoRateLimitKeys(request("ABCDEFGHIJ", "203.0.113.8"), "account-a", SECRET, true).ipHash)
      .not.toBe(first.ipHash);
    expect(JSON.stringify(first)).not.toContain("203.0.113.7");
    expect(JSON.stringify(first)).not.toContain("account-a");
    expect(first.accountHash).toMatch(/^[0-9a-f]{64}$/);
    expect(first.ipHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("does not trust user-controlled forwarding headers outside Vercel", () => {
    const first = duoRateLimitKeys(request("ABCDEFGHIJ", "203.0.113.7"), "account-a", SECRET, false);
    const forged = duoRateLimitKeys(request("ABCDEFGHIJ", "192.0.2.200"), "account-a", SECRET, false);
    expect(forged.ipHash).toBe(first.ipHash);
  });

  it("passes both budgets to the atomic consumer and returns a stable 429", async () => {
    const consume = vi.fn(async () => 0);
    await enforceDuoRateLimit(request(), "account-a", "join", { secret: SECRET, isVercel: true, consume });
    expect(consume).toHaveBeenCalledWith({
      p_scope: "join", p_account_hash: expect.stringMatching(/^[0-9a-f]{64}$/),
      p_ip_hash: expect.stringMatching(/^[0-9a-f]{64}$/),
      p_account_limit: 12, p_ip_limit: 30, p_window_seconds: 60,
    });
    consume.mockResolvedValueOnce(19);
    await expect(enforceDuoRateLimit(request(), "account-a", "join", {
      secret: SECRET, isVercel: true, consume,
    })).rejects.toMatchObject({ code: "duo_rate_limited", status: 429, retryAfterSeconds: 19 });
    expect(new TrainingDuoError("duo_rate_limited").message).toBe("Trop de tentatives. Réessaie dans un instant.");
  });

  it("leaves headroom above normal 15-second presence heartbeats", () => {
    expect(DUO_RATE_WINDOW_SECONDS).toBe(60);
    expect(DUO_RATE_LIMITS).toEqual({
      create: { account: 10, ip: 30 }, join: { account: 12, ip: 30 },
      mutation: { account: 120, ip: 240 }, presence: { account: 60, ip: 180 },
    });
    expect(DUO_RATE_LIMITS.presence.account).toBeGreaterThan(4);
    expect(DUO_RATE_LIMITS.presence.ip).toBeGreaterThan(8);
  });
});
