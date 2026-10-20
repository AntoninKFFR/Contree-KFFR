import assert from "node:assert/strict";
import test from "node:test";
import { createRoomApi } from "../src/multiplayer/api";
import { createRoomController } from "../src/multiplayer/controller";
import { parseRoom, RoomFailure } from "../src/multiplayer/contract";
import { tickDelay, startRoomLifecycle } from "../src/multiplayer/lifecycle";
import { soloFixture } from "./solo-fixtures";
import type { MultiplayerRoomView } from "../src/multiplayer/contract";
const id = "15100000-0000-4000-8000-000000000001";
const identity = { user: { id: "owner" }, access_token: "fixture-token" };
function fixture(version = 3): MultiplayerRoomView {
  return { room: { id, code: "KFFR151", status: "playing", scoring_mode: "ffb", target_score: 1000, game_phase: "playing", state_version: version, turn_deadline_at: null,
    created_at: "2026-10-21T12:00:00Z", updated_at: "2026-10-21T12:00:00Z", started_at: "2026-10-21T12:00:00Z", finished_at: null },
    gameId: id, game: soloFixture("playing").state as MultiplayerRoomView["game"], viewerSeatIndex: 0, isHost: true, canClaimHost: false,
    players: ([0, 1, 2, 3] as const).map((seat_index) => ({ seat_index, kind: "human", display_name: `P${seat_index}`, is_connected: true, is_ready: true, is_host: seat_index === 0, bot_takeover: false, rating: null, rank: null, is_ranked: false })) };
}
const response = (v: unknown) => new Response(JSON.stringify({ data: v }));
function deferred<T>() { let resolve!: (v: T) => void; const promise = new Promise<T>((r) => { resolve = r; }); return { promise, resolve }; }

test("native multiplayer sends one intention, immediate pending card, validated response and no playerId", async () => {
  const gate = deferred<Response>(), calls: RequestInit[] = [];
  const api = createRoomApi(async (url, init) => { assert.equal(String(url), `https://contree-kffr.vercel.app/api/multiplayer/rooms/${id}`); assert.equal(new Headers(init?.headers).get("authorization"), "Bearer fixture-token"); calls.push(init!); return init?.method === "POST" ? gate.promise : response(fixture()); });
  const c = createRoomController({ id, owner: "owner", identity: () => identity, api, onChange: () => {}, unauthorized: () => {} });
  await c.resume(); const card = c.state.room!.game!.hand[0];
  const first = c.move({ type: "game-action", action: { type: "play-card", card } });
  assert.deepEqual(c.state.pendingCard, card); assert.equal(c.state.room?.room.state_version, 3);
  assert.equal(await c.move({ type: "game-action", action: { type: "play-card", card } }), false);
  assert.deepEqual(JSON.parse(String(calls[1].body)), { expectedVersion: 3, intent: { type: "game-action", action: { type: "play-card", card } } });
  gate.resolve(response(fixture(4))); assert.equal(await first, true); assert.equal(c.state.pendingCard, null); assert.equal(calls.length, 2); c.dispose();
});
for (const failure of ["conflict", "network", "malformed", "timeout"]) test(`reconciles ${failure} with GET and never repeats a POST`, async () => {
  const methods: string[] = [];
  const api = createRoomApi(async (_url, init) => { methods.push(init!.method!); if (init?.method !== "POST") return response(fixture());
    if (failure === "conflict") return new Response(JSON.stringify({ error: "La table a changé.", code: "version_conflict" }), { status: 409 });
    if (failure === "malformed") return response({ ...fixture(), game: { hands: {} } });
    if (failure === "timeout") return new Promise<Response>((_resolve, reject) => init.signal?.addEventListener("abort", () => reject(new Error("aborted"))));
    throw new Error("network"); }, 10);
  const c = createRoomController({ id, owner: "owner", identity: () => identity, api, onChange: () => {}, unauthorized: () => {} });
  await c.resume(); assert.equal(await c.move({ type: "game-action", action: { type: "pass" } }), false);
  assert.deepEqual(methods, ["GET", "POST", "GET"]); assert.equal(c.state.requiresSync, false); assert.ok(c.state.error); c.dispose();
});
for (const fence of ["account", "token", "suspend", "dispose"]) test(`drops an in-flight mutation after ${fence}`, async () => {
  const gate = deferred<Response>(); let who = identity, notifications = 0;
  const api = createRoomApi(async (_url, init) => init?.method === "POST" ? gate.promise : response(fixture()));
  const c = createRoomController({ id, owner: "owner", identity: () => who, api, onChange: () => notifications++, unauthorized: () => {} });
  await c.resume(); const post = c.move({ type: "game-action", action: { type: "pass" } });
  if (fence === "account") who = { ...identity, user: { id: "other" } };
  if (fence === "token") who = { ...identity, access_token: "new-token" };
  if (fence === "suspend") c.suspend();
  if (fence === "dispose") c.dispose();
  const before = notifications; gate.resolve(response(fixture(10))); assert.equal(await post, false);
  assert.notEqual(c.state.room?.room.state_version, 10);
  if (fence === "suspend" || fence === "dispose") assert.equal(notifications, before); c.dispose();
});
test("late GET cannot overwrite a more recent mutation; duplicate refreshes coalesce", async () => {
  const gate = deferred<Response>(); let reads = 0;
  const api = createRoomApi(async (_url, init) => init?.method === "POST" ? response(fixture(8)) : ++reads === 1 ? response(fixture()) : gate.promise);
  const c = createRoomController({ id, owner: "owner", identity: () => identity, api, onChange: () => {}, unauthorized: () => {} });
  await c.resume(); const get = c.load(), second = c.load();
  await c.move({ type: "game-action", action: { type: "pass" } }); gate.resolve(response(fixture(4))); await Promise.all([get, second]);
  assert.equal(c.state.room?.room.state_version, 8); assert.equal(reads, 2); c.dispose();
});
test("ambiguous mutation reconciliation starts a fresh GET after the failure, ignoring earlier reads", async () => {
  const old = deferred<Response>(); let reads = 0;
  const api = createRoomApi(async (_url, init) => {
    if (init?.method === "POST") throw new Error("committed but connection lost");
    return ++reads === 2 ? old.promise : response(fixture(reads === 1 ? 3 : 4));
  });
  const c = createRoomController({ id, owner: "owner", identity: () => identity, api, onChange: () => {}, unauthorized: () => {} });
  await c.resume(); const before = c.load(); await c.move({ type: "game-action", action: { type: "pass" } });
  assert.equal(reads, 3); assert.equal(c.state.room?.room.state_version, 4);
  old.resolve(response(fixture(3))); await before; assert.equal(c.state.room?.room.state_version, 4); c.dispose();
});
test("validates room identity, seat membership, rich contracts and private projection", async () => {
  const v = fixture(); assert.deepEqual(parseRoom(v).game?.contract, v.game?.contract);
  for (const bad of [{ ...v, room: { ...v.room, host_user_id: "secret" } }, { ...v, game: { ...v.game, hands: {} } }, { ...v, players: [v.players[0]] }, { ...v, viewerSeatIndex: 2 }, { ...v, room: { ...v.room, state_version: -1 } }]) assert.throws(() => parseRoom(bad));
  const api = createRoomApi(async () => response({ ...v, room: { ...v.room, id: "15100000-0000-4000-8000-000000000099" } }));
  await assert.rejects(api.load(identity, new AbortController().signal, id), RoomFailure);
});
test("native scheduler uses the existing bot and human timing and stops cleanly", async () => {
  const v = fixture(); assert.equal(tickDelay(v, Date.parse(v.room.updated_at)), 4000);
  v.players[v.game!.currentPlayerId].kind = "bot";
  assert.equal(tickDelay(v, Date.parse(v.room.updated_at)), 1030);
  let timer: (() => void) | undefined, cancelled = false;
  const api = createRoomApi(async () => response(fixture()));
  const c = createRoomController({ id, owner: "owner", identity: () => identity, api, onChange: () => {}, unauthorized: () => {} });
  await c.resume();
  const stop = startRoomLifecycle(c, { now: () => 1000, setTimeout: ((cb: () => void) => { timer = cb; return 1; }) as never, clearTimeout: (() => { cancelled = true; }) as never });
  await new Promise((r) => setImmediate(r)); assert.ok(timer); stop(); assert.equal(cancelled, true); c.dispose();
});
