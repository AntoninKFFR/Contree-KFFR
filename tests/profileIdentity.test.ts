import type { SupabaseClient, User } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import { authCallbackUrl, loginPath, safeNextPath, signInWithGoogle, signupNextStep } from "@/lib/authRedirect";
import { completeAuthCallback } from "@/lib/authCallback";
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

describe("Google OAuth through the existing callback", () => {
  it("keeps a valid next path and sanitizes a dangerous one in the callback URL", () => {
    const valid = new URL(authCallbackUrl("http://localhost:3000", "/multiplayer?code=ABC#join"));
    expect(valid.origin).toBe("http://localhost:3000");
    expect(valid.pathname).toBe("/auth/callback");
    expect(valid.searchParams.get("next")).toBe("/multiplayer?code=ABC#join");
    expect(new URL(authCallbackUrl("https://kffr.example", "//evil.example")).searchParams.get("next")).toBe("/");
  });

  it("requests only Google authentication with the current-origin callback and no extra scopes", async () => {
    const signInWithOAuth = vi.fn().mockResolvedValue({ data: { url: "https://example.test/authorize" }, error: null });
    const client = { auth: { signInWithOAuth } } as unknown as SupabaseClient;
    expect(await signInWithGoogle(client, "http://localhost:3000", "/multiplayer")).toBe(true);
    expect(signInWithOAuth).toHaveBeenCalledExactlyOnceWith({
      provider: "google", options: { redirectTo: "http://localhost:3000/auth/callback?next=%2Fmultiplayer" },
    });
  });

  it("reports an immediate OAuth error so the login notice can be shown and controls re-enabled", async () => {
    const signInWithOAuth = vi.fn().mockResolvedValueOnce({ data: null, error: new Error("provider unavailable") })
      .mockRejectedValueOnce(new Error("network unavailable"));
    const client = { auth: { signInWithOAuth } } as unknown as SupabaseClient;
    expect(await signInWithGoogle(client, "http://localhost:3000", "/profile")).toBe(false);
    expect(await signInWithGoogle(client, "http://localhost:3000", "/profile")).toBe(false);
  });

  function callbackClient(rows: Map<string, string>, user: User) {
    let session: { user: User } | null = null;
    const getSession = vi.fn(async () => ({ data: { session }, error: null }));
    const exchangeCodeForSession = vi.fn(async () => { session = { user }; return { error: null }; });
    const client = Object.assign(fakeClient(rows), { auth: { getSession, exchangeCodeForSession } });
    return { client, getSession, exchangeCodeForSession };
  }

  it("exchanges the code and returns an existing player with a username to the safe next path", async () => {
    const user = { id: "u1", user_metadata: { name: "Google name" } } as unknown as User;
    const { client, getSession, exchangeCodeForSession } = callbackClient(new Map([["u1", "Antonin"]]), user);
    expect(await completeAuthCallback(client, new URL("http://localhost:3000/auth/callback?code=oauth-code&next=%2Fmultiplayer"))).toBe("/multiplayer");
    expect(exchangeCodeForSession).toHaveBeenCalledExactlyOnceWith("oauth-code");
    expect(getSession).toHaveBeenCalledTimes(2);
    expect(await completeAuthCallback(client, new URL("http://localhost:3000/auth/callback?next=%2F%2Fevil.example"))).toBe("/");
  });

  it("sends a new Google player to profile without treating Google identity fields as a KFFR username", async () => {
    const user = { id: "new-google", email: "google@example.test", user_metadata: { name: "Google Name", full_name: "Google Full Name", email: "google@example.test" } } as unknown as User;
    const rows = new Map<string, string>();
    const { client } = callbackClient(rows, user);
    expect(await completeAuthCallback(client, new URL("http://localhost:3000/auth/callback?code=oauth-code&next=%2Fmultiplayer"))).toBe("/profile");
    expect(rows.size).toBe(0);
  });

  it("rejects an OAuth provider error before attempting a session exchange", async () => {
    const { client, getSession, exchangeCodeForSession } = callbackClient(new Map(), { id: "u1", user_metadata: {} } as unknown as User);
    await expect(completeAuthCallback(client, new URL("http://localhost:3000/auth/callback?error=access_denied"))).rejects.toThrow();
    expect(getSession).not.toHaveBeenCalled();
    expect(exchangeCodeForSession).not.toHaveBeenCalled();
    await expect(completeAuthCallback(client, new URL("http://localhost:3000/auth/callback#error=access_denied"))).rejects.toThrow();
  });
});
