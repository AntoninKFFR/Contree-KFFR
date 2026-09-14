import { describe, expect, it, vi } from "vitest";
import { sanitizeApiErrorText } from "@/lib/server/apiError";

vi.mock("server-only", () => ({}));

describe("multiplayer API error log sanitization", () => {
  it.each([
    "password=[value]",
    "access_token=[value]",
    "service_role_key=[value]",
    "Authorization: Bearer [value]",
    'payload {"hands":{"0":[]}}',
  ])("redacts sensitive diagnostic text without logging it: %s", (input) => {
    expect(sanitizeApiErrorText(input)).toBe("[redacted]");
  });

  it("keeps a bounded non-sensitive database error useful", () => {
    expect(sanitizeApiErrorText("duplicate room code")).toBe("duplicate room code");
    expect(sanitizeApiErrorText("x".repeat(2_100))).toHaveLength(2_000);
  });
});
