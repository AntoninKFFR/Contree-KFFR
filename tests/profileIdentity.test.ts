import type { SupabaseClient, User } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { loginPath, safeNextPath, signupNextStep } from "@/lib/authRedirect";
import { cleanUsername, ensureProfile, getProfileUsername, isUsernameTaken, saveProfileUsername, validateUsername } from "@/lib/profiles";

function fakeClient(rows = new Map<string, string>()): SupabaseClient {
  return {
    from: () => ({
      select: () => ({ eq: (_key: string, id: string) => ({ maybeSingle: async () => ({ data: rows.has(id) ? { username: rows.get(id) } : null, error: null }) }) }),
      update: ({ username }: { username: string }) => ({ eq: (_key: string, id: string) => ({ select: () => ({ single: async () => {
        if (!rows.has(id)) return { data: null, error: { code: "PGRST116" } };
        if ([...rows].some(([otherId, name]) => otherId !== id && name === username)) return { data: null, error: { code: "23505" } };
        rows.set(id, username);
        return { data: { username }, error: null };
      } }) }) }),
      insert: async ({ id, username }: { id: string; username: string }) => {
        if ([...rows.values()].includes(username)) return { error: { code: "23505" } };
        rows.set(id, username);
        return { error: null };
      },
    }),
    rpc: async (_name: string, { p_username }: { p_username: string }) => ({ data: [...rows.values()].includes(p_username), error: null }),
  } as unknown as SupabaseClient;
}

describe("persistent account username", () => {
  it("validates and normalizes the same username for signup and profile editing", () => {
    expect(cleanUsername("  Marie   Anne  ")).toBe("Marie Anne");
    expect(validateUsername(" ")).toBe("Choisis un pseudo.");
    expect(validateUsername("A".repeat(41))).toMatch(/40/);
    expect(validateUsername("Marie Anne")).toBeNull();
  });

  it("reads and edits the profile while rejecting a taken username", async () => {
    const client = fakeClient(new Map([["u1", "Antonin"], ["u2", "Marie"]]));
    expect(await getProfileUsername(client, "u1")).toBe("Antonin");
    expect(await isUsernameTaken(client, "Marie")).toBe(true);
    expect(await saveProfileUsername(client, "u1", "Marie")).toEqual({ username: null, error: "Ce pseudo est déjà pris." });
    expect(await saveProfileUsername(client, "u1", "Arthur")).toEqual({ username: "Arthur", error: null });
    expect(await getProfileUsername(client, "u1")).toBe("Arthur");
  });

  it("repairs a legacy account from metadata or waits for one explicit choice", async () => {
    const client = fakeClient();
    expect(await ensureProfile(client, { id: "u1", user_metadata: { username: "Alice" } } as unknown as User)).toBe("Alice");
    expect(await getProfileUsername(client, "u1")).toBe("Alice");
    expect(await ensureProfile(client, { id: "u2", user_metadata: {} } as unknown as User)).toBeNull();
    expect(await saveProfileUsername(client, "u2", "Bob")).toEqual({ username: "Bob", error: null });
  });
});

describe("safe auth return path", () => {
  it("accepts local destinations and rejects external or protocol-relative redirects", () => {
    expect(safeNextPath("/multiplayer?code=ABC#join")).toBe("/multiplayer?code=ABC#join");
    for (const unsafe of ["https://evil.example", "//evil.example", "/\\evil.example", "/%2F%2Fevil.example", "/%5Cevil.example", "/login", "javascript:alert(1)"]) {
      expect(safeNextPath(unsafe)).toBe("/");
    }
    expect(loginPath("/multiplayer")).toBe("/login?next=%2Fmultiplayer");
  });

  it("redirects an immediate signup session and shows confirmation when there is no session", () => {
    expect(signupNextStep(true, true, "/multiplayer")).toEqual({ kind: "redirect", path: "/multiplayer" });
    expect(signupNextStep(true, false, "/multiplayer")).toEqual({ kind: "redirect", path: "/profile" });
    expect(signupNextStep(false, false, "/multiplayer")).toEqual({ kind: "confirm" });
    expect(signupNextStep(true, true, "https://evil.example")).toEqual({ kind: "redirect", path: "/" });
  });
});
