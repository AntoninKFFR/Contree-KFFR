import assert from "node:assert/strict";
import { test } from "node:test";
import type { AuthChangeEvent, Session, SupabaseClient } from "@supabase/supabase-js";
import { createAccountController, initialAccountState } from "../src/lib/account";

const session = (id = "alice") => ({ user: { id }, access_token: `token-${id}` }) as Session;
const settle = () => new Promise((resolve) => setTimeout(resolve, 10));
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}
function fixture(initial: Session | null = session()) {
  let stored = initial;
  let state = initialAccountState;
  let listener: (event: AuthChangeEvent, next: Session | null) => void = () => {};
  let queries = 0;
  let refreshes = 0;
  let stops = 0;
  let unsubscribed = false;
  const auth = {
    getSession: async () => ({ data: { session: stored }, error: null }),
    getUser: async (jwt: string) => ({ data: { user: { id: jwt.replace("token-", "") } }, error: null as object | null }),
    signInWithPassword: async (credentials: { email: string; password: string }) => {
      assert.equal(credentials.email, "alice@example.com");
      assert.equal(credentials.password, "test-password");
      stored = session();
      listener("SIGNED_IN", stored);
      return { error: null };
    },
    signOut: async (options: { scope: string }) => {
      assert.equal(options.scope, "local");
      stored = null;
      listener("SIGNED_OUT", null);
      return { error: null };
    },
    onAuthStateChange: (callback: typeof listener) => {
      listener = callback;
      return { data: { subscription: { unsubscribe: () => { unsubscribed = true; } } } };
    },
    startAutoRefresh: () => { refreshes++; },
    stopAutoRefresh: () => { stops++; },
  };
  type ProfileResult = { data: { username: string | null } | null; error: object | null };
  const profile = { read: async (id: string): Promise<ProfileResult> => ({ data: { username: id.toUpperCase() }, error: null }) };
  const client = {
    auth,
    from(table: string) {
      assert.equal(table, "profiles");
      queries++;
      return { select(columns: string) {
        assert.equal(columns, "username");
        return { eq(column: string, id: string) {
          assert.equal(column, "id");
          return { maybeSingle: () => profile.read(id) };
        } };
      } };
    },
  };
  const history = [state];
  const controller = createAccountController(client as unknown as SupabaseClient, (next) => {
    state = next;
    history.push(next);
  });
  return { controller, auth, profile, history,
    get state() { return state; }, get queries() { return queries; },
    get refreshes() { return refreshes; }, get stops() { return stops; },
    get unsubscribed() { return unsubscribed; },
    emit(next: Session | null, event: AuthChangeEvent = next ? "SIGNED_IN" : "SIGNED_OUT") {
      stored = next;
      listener(event, next);
    },
  };
}

test("restores the persisted account and reads its actual profile", async (t) => {
  const f = fixture(); t.after(f.controller.dispose);
  await settle();
  assert.equal(f.state.username, "ALICE");
  assert.equal(f.state.session?.user.id, "alice");
  assert.equal(f.state.loading, false);
});

test("does not read any private profile without a session", async (t) => {
  const f = fixture(null); t.after(f.controller.dispose);
  await settle();
  assert.equal(f.queries, 0);
  assert.equal(f.state.session, null);
  assert.equal(f.state.loading, false);
});

test("validates identity before querying a profile and offers a network retry", async (t) => {
  const f = fixture(); t.after(f.controller.dispose);
  const getUser = f.auth.getUser;
  f.auth.getUser = async () => ({ data: { user: { id: "alice" } }, error: { status: 401 } });
  await settle();
  assert.equal(f.queries, 0);
  assert.equal(f.state.session, null);
  assert.equal(f.state.signOutRequired, true);
  f.auth.getUser = getUser;
  await f.controller.reload();
  assert.equal(f.state.username, "ALICE");
});

test("an old session restoration cannot overwrite a newer sign-out", async (t) => {
  const f = fixture(); t.after(f.controller.dispose);
  const pending = deferred<Awaited<ReturnType<typeof f.auth.getSession>>>();
  f.auth.getSession = () => pending.promise;
  const restoring = f.controller.reload();
  f.emit(null);
  pending.resolve({ data: { session: session() }, error: null });
  await restoring; await settle();
  assert.equal(f.state.session, null);
  assert.equal(f.state.username, null);
});

test("discards a slow profile response after sign-out", async (t) => {
  const f = fixture(); t.after(f.controller.dispose);
  const pending = deferred<Awaited<ReturnType<typeof f.profile.read>>>();
  f.profile.read = () => pending.promise;
  await settle();
  await f.controller.signOut();
  pending.resolve({ data: { username: "OLD PRIVATE NAME" }, error: null });
  await settle();
  assert.equal(f.state.session, null);
  assert.equal(f.state.username, null);
});

test("discards an old account response when switching accounts", async (t) => {
  const f = fixture(); t.after(f.controller.dispose);
  const pending = deferred<Awaited<ReturnType<typeof f.profile.read>>>();
  f.profile.read = (id) => id === "alice" ? pending.promise : Promise.resolve({ data: { username: "BOB" }, error: null });
  await settle();
  f.emit(session("bob")); await settle();
  pending.resolve({ data: { username: "ALICE" }, error: null }); await settle();
  assert.equal(f.state.session?.user.id, "bob");
  assert.equal(f.state.username, "BOB");
});

test("clears private data while backgrounded, refreshes and revalidates on return", async (t) => {
  const f = fixture(); t.after(f.controller.dispose);
  await settle();
  f.controller.setForeground(false);
  assert.equal(f.state.username, null);
  assert.equal(f.state.session, null);
  f.controller.setForeground(true); await settle();
  assert.equal(f.refreshes, 1);
  assert.equal(f.stops, 1);
  assert.equal(f.state.username, "ALICE");
  f.emit(session(), "TOKEN_REFRESHED"); await settle();
  assert.equal(f.state.username, "ALICE");
});

test("network sign-out failure keeps data hidden and permits a real retry", async (t) => {
  const f = fixture(); t.after(f.controller.dispose);
  await settle();
  const signOut = f.auth.signOut;
  f.auth.signOut = async () => { throw new Error("offline"); };
  await f.controller.signOut();
  f.emit(session(), "TOKEN_REFRESHED");
  f.controller.setForeground(false); f.controller.setForeground(true); await settle();
  assert.equal(f.state.username, null);
  assert.equal(f.state.session, null);
  assert.equal(f.state.loading, false);
  assert.equal(f.state.signOutRequired, true);
  assert.ok(f.state.error);
  f.auth.signOut = signOut;
  await f.controller.signOut();
  assert.equal(f.state.signOutRequired, false);
});

test("handles profile errors without inventing a pseudo, then retries", async (t) => {
  const f = fixture(); t.after(f.controller.dispose);
  const read = f.profile.read;
  f.profile.read = async () => ({ data: null, error: { message: "network" } });
  await settle();
  assert.equal(f.state.username, null);
  assert.ok(f.state.error);
  assert.equal(f.state.loading, false);
  f.profile.read = read; await f.controller.reload();
  assert.equal(f.state.username, "ALICE");
  assert.equal(f.state.error, null);
});

test("signs in with email/password and clears submitting after a network failure", async (t) => {
  const f = fixture(null); t.after(f.controller.dispose);
  await settle();
  assert.equal(await f.controller.signIn(" alice@example.com ", "test-password"), true);
  await settle();
  assert.equal(f.state.username, "ALICE");
  await f.controller.signOut();
  f.auth.signInWithPassword = async () => { throw new Error("offline"); };
  assert.equal(await f.controller.signIn("alice@example.com", "test-password"), false);
  assert.equal(f.state.submitting, false);
  assert.ok(f.state.error);
});

test("unmounting unsubscribes, stops refresh and ignores pending responses", async () => {
  const f = fixture();
  const pending = deferred<Awaited<ReturnType<typeof f.profile.read>>>();
  f.profile.read = () => pending.promise;
  await settle();
  f.controller.dispose();
  const count = f.history.length;
  pending.resolve({ data: { username: "STALE" }, error: null }); await settle();
  assert.equal(f.history.length, count);
  assert.equal(f.unsubscribed, true);
  assert.equal(f.stops, 1);
});
