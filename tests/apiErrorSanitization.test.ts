import { describe, expect, it, vi } from "vitest";
import { apiFailure, sanitizeApiErrorText } from "@/lib/server/apiError";
import { MultiplayerError } from "@/lib/server/multiplayerGame";

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

  it("returns the structured multiplayer error code to the client", async () => {
    const response = apiFailure(
      new MultiplayerError("Conflit", 409, "version_conflict"),
      { route: "/test", action: "join-seat" },
    );
    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({ error: "Conflit", code: "version_conflict" });
  });
});
