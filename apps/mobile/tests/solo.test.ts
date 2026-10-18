import { test } from "node:test";
import assert from "node:assert/strict";
import { createSoloApi, SOLO_ORIGIN, type SoloIdentity } from "../src/solo/api";
import { parseSoloResponse, SoloFailure } from "../src/solo/contract";
import { createSoloController, soloStorageKey, type SoloState } from "../src/solo/controller";
import { SESSION_ID, START_KEY, soloFixture } from "./solo-fixtures";

const who = (id = "alice", token = "test-token"): SoloIdentity => ({ user: { id }, access_token: token });
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });
function setup(handler: (url: string, init?: RequestInit) => Promise<Response> = async () => json({ data: soloFixture() })) {
  let identity: SoloIdentity | null = who();
  const map = new Map<string, string>(), calls: { url: string; init?: RequestInit }[] = [], updates: SoloState[] = [];
  let unauthorized = 0;
  const api = createSoloApi(async (url, init) => { calls.push({ url: String(url), init }); return handler(String(url), init); });
  const storage = { getItem: async (key: string) => map.get(key) ?? null, setItem: async (key: string, value: string) => { map.set(key, value); } };
  const controller = createSoloController({ owner: "alice", identity: () => identity, api, storage, uuid: () => START_KEY, onChange: (s) => updates.push(s), unauthorized: () => { unauthorized++; } });
  const remember = (id = SESSION_ID) => map.set(soloStorageKey("alice"), JSON.stringify({ sessionId: id, startKey: null }));
  return { controller, map, calls, updates, remember, setIdentity: (next: SoloIdentity | null) => { identity = next; }, get unauthorized() { return unauthorized; } };
}
test("loading an empty bookmark never creates a game; explicit creation persists its nonce before POST", async () => {
  const f = setup(); await f.controller.load(); assert.equal(f.calls.length, 0); assert.equal(f.controller.state.hydrated, true);
  await f.controller.start(); assert.equal(f.calls.length, 1); assert.equal(f.calls[0].url, SOLO_ORIGIN + "/api/solo/sessions");
  assert.equal(f.calls[0].init?.method, "POST"); assert.equal(new Headers(f.calls[0].init?.headers).get("authorization"), "Bearer test-token");
  assert.deepEqual(JSON.parse(String(f.calls[0].init?.body)), { rules: { presetId: "contree-kffr" }, startKey: START_KEY });
  assert.deepEqual(JSON.parse(f.map.get(soloStorageKey("alice"))!), { sessionId: SESSION_ID, startKey: null });
  assert.equal(f.controller.state.active, true); f.controller.dispose();
});
test("reopening loads only the owner's saved ID, then requires an explicit resume", async () => {
  const f = setup(); f.remember(); f.map.set(soloStorageKey("bob"), "private-bob"); await f.controller.load();
  assert.equal(f.calls[0].init?.method, "GET"); assert.equal(f.controller.state.active, false); f.controller.resume(); assert.equal(f.controller.state.active, true);
  assert.equal(f.map.get(soloStorageKey("bob")), "private-bob"); f.controller.dispose();
});
test("a missing/expired identity cannot create or continue a game and triggers verification on 401", async () => {
  const anonymous = setup(); anonymous.setIdentity(null); await anonymous.controller.start(); assert.equal(anonymous.calls.length, 0);
  const expired = setup(); expired.setIdentity({ ...who(), expires_at: 1 }); await expired.controller.start(); assert.equal(expired.calls.length, 0); assert.equal(expired.unauthorized, 1);
  const f = setup(async () => json({}, 401)); f.remember(); await f.controller.load(); assert.equal(f.controller.state.session, null); assert.equal(f.unauthorized, 1); assert.ok(f.map.has(soloStorageKey("alice")));
});
test("only a confirmed 404 clears the stored ID; network/5xx/malformed JSON keep it", async () => {
  for (const status of [401, 403, 429, 500, 503, 404]) {
    const f = setup(async () => json({}, status)); f.remember(); await f.controller.load();
    assert.equal(JSON.parse(f.map.get(soloStorageKey("alice"))!).sessionId, status === 404 ? null : SESSION_ID);
  }
  const f = setup(async () => new Response("<html>unavailable</html>")); f.remember(); await f.controller.load(); assert.ok(f.controller.state.error); assert.ok(f.map.get(soloStorageKey("alice"))!.includes(SESSION_ID));
});
test("double start is serialized; an ambiguous creation retries the same durable key without an automatic POST replay", async () => {
  let release!: (r: Response) => void;
  const f = setup(() => new Promise((resolve) => { release = resolve; }));
  const first = f.controller.start(); await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
  await f.controller.start(); assert.equal(f.calls.length, 1); assert.equal(JSON.parse(f.map.get(soloStorageKey("alice"))!).startKey, START_KEY);
  release(json({}, 503)); await first; assert.equal(f.calls.length, 1);
  const retry = f.controller.start(); await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
  assert.equal(JSON.parse(String(f.calls[1].init?.body)).startKey, START_KEY); release(json({ data: soloFixture() })); await retry;
});
test("account change, token replacement, blur and background invalidate pending responses", async () => {
  for (const mode of ["account", "token", "dispose", "background"] as const) {
    let release!: (r: Response) => void; const f = setup(() => new Promise((resolve) => { release = resolve; })); f.remember();
    const pending = f.controller.load(); await Promise.resolve(); await Promise.resolve();
    const count = f.updates.length;
    if (mode === "account") f.setIdentity(who("bob")); else if (mode === "token") f.setIdentity(who("alice", "new-token")); else if (mode === "dispose") f.controller.dispose(); else f.controller.suspend();
    release(json({ data: soloFixture() })); await pending;
    assert.equal(f.updates.filter((s, i) => i >= count && s.session !== null).length, 0);
  }
});
test("moves send expectedVersion and preserve the server-only result; failures require GET reconciliation", async () => {
  let fail = false; const f = setup(async (_url, init) => init?.method === "GET" ? json({ data: soloFixture("playing", 3) }) : fail ? Promise.reject(new Error("offline")) : json({ data: soloFixture("playing", 4) }));
  f.remember(); await f.controller.load(); f.controller.resume(); await f.controller.move({ type: "play-card", playerId: 0, card: { rank: "A", suit: "spades" } });
  const body = JSON.parse(String(f.calls[1].init?.body)); assert.equal(body.expectedVersion, 3); assert.equal(f.controller.state.session?.version, 4);
  fail = true; await f.controller.move({ type: "advance-bot" }); assert.equal(f.controller.state.session?.version, 4); assert.equal(f.controller.state.requiresSync, true);
  const count = f.calls.length; await f.controller.move({ type: "advance-bot" }); assert.equal(f.calls.length, count);
  await f.controller.load(); assert.match(f.controller.state.error!, /obsolète/); assert.equal(f.controller.state.session?.version, 4);
});
test("rejects wrong IDs, private hands, duplicates, invalid players, regressing versions and unchanged mutation acknowledgements", async () => {
  for (const mutate of [
    (r: ReturnType<typeof soloFixture>) => { r.id = "wrong"; },
    (r: ReturnType<typeof soloFixture>) => { (r.state as unknown as Record<string, unknown>).hands = {}; },
    (r: ReturnType<typeof soloFixture>) => { r.state.hand[1] = r.state.hand[0]; },
    (r: ReturnType<typeof soloFixture>) => { r.state.currentPlayerId = 9; },
  ]) { const data = soloFixture(); mutate(data); assert.throws(() => parseSoloResponse({ data }), SoloFailure); }
  const f = setup(); f.remember(); await f.controller.load(); f.controller.resume(); await f.controller.move({ type: "pass", playerId: 0 }); assert.match(f.controller.state.error!, /non confirmée/);
});
test("request timeout aborts and emits one sanitized failure, never retrying the mutation", async () => {
  let calls = 0;
  const api = createSoloApi(async (_url, init) => { calls++; return new Promise((_resolve, reject) => init?.signal?.addEventListener("abort", () => reject(new Error("private token")))); }, 10);
  await assert.rejects(api.start(who(), new AbortController().signal, START_KEY), (e: unknown) => e instanceof SoloFailure && !e.message.includes("private")); assert.equal(calls, 1);
});

test("double human moves send a single versioned POST even before React can disable the button", async () => {
  let release!: (r: Response) => void;
  const f = setup(async (_url, init) => init?.method === "GET" ? json({ data: soloFixture("playing", 3) }) : new Promise((resolve) => { release = resolve; }));
  f.remember(); await f.controller.load(); f.controller.resume();
  const first = f.controller.move({ type: "play-card", playerId: 0, card: { rank: "A", suit: "spades" } });
  await f.controller.move({ type: "play-card", playerId: 0, card: { rank: "A", suit: "spades" } });
  assert.equal(f.calls.length, 2); release(json({ data: soloFixture("playing", 4) })); await first;
  assert.equal(f.controller.state.session?.version, 4);
});
