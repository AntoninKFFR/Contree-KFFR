import assert from "node:assert/strict";
import { test } from "node:test";
import { createClient } from "@supabase/supabase-js";
import { createAccountController, initialAccountState } from "../src/lib/account";

test("real Supabase SDK signs in, persists, restores, queries the profile and signs out locally", async (t) => {
  const stored = new Map<string, string>();
  const calls: string[] = [];
  const user = { id: "00000000-0000-4000-8000-000000000001", aud: "authenticated", role: "authenticated",
    email: "test@example.invalid", app_metadata: {}, user_metadata: {}, created_at: "2026-01-01T00:00:00Z" };
  const exp = Math.floor(Date.now() / 1000) + 3600;
  const jwt = [
    Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url"),
    Buffer.from(JSON.stringify({ sub: user.id, exp, role: "authenticated" })).toString("base64url"),
    "test-signature",
  ].join(".");
  const transport: typeof fetch = async (input, init) => {
    const url = new URL(String(input));
    calls.push(url.pathname);
    if (url.pathname === "/auth/v1/token") {
      assert.deepEqual(JSON.parse(String(init?.body)), { email: user.email, password: "test-password",
        gotrue_meta_security: {} });
      return Response.json({ access_token: jwt, token_type: "bearer", expires_in: 3600,
        expires_at: exp, refresh_token: "test-refresh-token", user });
    }
    assert.equal(new Headers(init?.headers).get("Authorization"), `Bearer ${jwt}`);
    if (url.pathname === "/auth/v1/user") return Response.json(user);
    if (url.pathname === "/rest/v1/profiles") {
      assert.equal(url.searchParams.get("select"), "username");
      assert.equal(url.searchParams.get("id"), `eq.${user.id}`);
      return Response.json([{ username: "KFFR_TEST" }]);
    }
    if (url.pathname === "/auth/v1/logout") {
      assert.equal(url.searchParams.get("scope"), "local");
      return new Response(null, { status: 204 });
    }
    throw new Error(`Unexpected test request: ${url.pathname}`);
  };
  const makeClient = () => createClient("https://example.supabase.co", "sb_publishable_test", {
    global: { fetch: transport },
    auth: { persistSession: true, autoRefreshToken: false, detectSessionInUrl: false,
      storageKey: "kffr-mobile-session-test", storage: {
        getItem: async (key) => stored.get(key) ?? null,
        setItem: async (key, value) => { stored.set(key, value); },
        removeItem: async (key) => { stored.delete(key); },
      } },
  });
  async function waitFor(check: () => boolean) {
    const deadline = Date.now() + 2000;
    while (!check() && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 10));
    assert.ok(check(), "account reached expected state");
  }
  let state = initialAccountState;
  const first = createAccountController(makeClient(), (next) => { state = next; });
  t.after(first.dispose);
  await waitFor(() => !state.loading);
  assert.equal(calls.length, 0, "anonymous startup makes no profile request");
  assert.equal(await first.signIn(user.email, "test-password"), true);
  await waitFor(() => state.username === "KFFR_TEST");
  assert.ok(stored.has("kffr-mobile-session-test"));
  first.dispose();

  state = initialAccountState;
  const restored = createAccountController(makeClient(), (next) => { state = next; });
  t.after(restored.dispose);
  await waitFor(() => state.username === "KFFR_TEST");
  assert.equal(calls.filter((path) => path === "/auth/v1/token").length, 1, "restores without another password login");
  await restored.signOut();
  assert.equal(state.session, null);
  assert.equal(state.username, null);
  assert.equal(state.signOutRequired, false);
  assert.equal(stored.has("kffr-mobile-session-test"), false);
  assert.ok(calls.includes("/auth/v1/logout"));
});
