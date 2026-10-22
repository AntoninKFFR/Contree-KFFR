import assert from "node:assert/strict";
import test from "node:test";
import states from "./multiplayer/states.json";
import { createRoomApi } from "../src/multiplayer/api";
import { createRoomController } from "../src/multiplayer/controller";
import type { MultiplayerRoomView } from "../src/multiplayer/contract";
import { seatErrorCode, traceSeat, type SeatTrace } from "../src/multiplayer/seat-trace";
import type { SoloIdentity } from "../src/solo/api";

const who = { user: { id: "seat-test-only" }, access_token: "local-fixture-token" };
function view(version = 3, seat: 0 | 1 | 2 | 3 | null = null): MultiplayerRoomView {
  const room = structuredClone(states["lobby-free"][0]) as MultiplayerRoomView;
  room.room.state_version = version;
  room.viewerSeatIndex = seat; room.isHost = false;
  if (seat !== null) Object.assign(room.players[seat], { kind: "human", display_name: "Local test player", is_connected: true });
  return room;
}
const json = (data: unknown) => new Response(JSON.stringify({ data }));
function gate<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>((r) => { resolve = r; }); return { promise, resolve }; }
function setup(fetcher: typeof fetch, trace?: (event: SeatTrace) => void, identity: () => SoloIdentity | null = () => who) {
  const api = createRoomApi(fetcher, 15000, trace);
  return createRoomController({ id: view().room.id, owner: who.user.id, identity, api, onChange: () => {}, unauthorized: () => {}, trace });
}

test("seat reservation synchronizes first when invalidated, then sends exactly one POST and confirms the requested seat", async () => {
  const methods: string[] = [];
  const c = setup(async (_url, init) => { methods.push(init!.method!); return json(view(init?.method === "POST" ? 4 : 3, init?.method === "POST" ? 2 : null)); });
  try {
    await c.resume(); c.invalidate();
    assert.equal(await c.move({ type: "join-seat", seatIndex: 2 }), true);
    assert.equal(c.state.room?.viewerSeatIndex, 2);
    assert.deepEqual(methods, ["GET", "GET", "POST"]);
  } finally { c.dispose(); }
});

test("HTTP 200 without the requested viewer seat is not a successful reservation", async () => {
  const methods: string[] = [];
  const c = setup(async (_url, init) => { methods.push(init!.method!); return json(view(init?.method === "POST" ? 4 : 3)); });
  try {
    await c.resume();
    assert.equal(await c.move({ type: "join-seat", seatIndex: 2 }), false);
    assert.match(c.state.error ?? "", /place|réservation/i);
    assert.equal(c.state.room?.viewerSeatIndex, null);
    assert.deepEqual(methods, ["GET", "POST", "GET"]);
  } finally { c.dispose(); }
});

test("a GET started before the reservation cannot undo its confirmed seat even at the same server version", async () => {
  const before = gate<Response>(); let reads = 0;
  const c = setup(async (_url, init) => init?.method === "POST" ? json(view(4, 2)) : ++reads === 1 ? json(view()) : before.promise);
  try {
    await c.resume(); const read = c.load();
    assert.equal(await c.move({ type: "join-seat", seatIndex: 2 }), true);
    before.resolve(json(view(4))); await read;
    assert.equal(c.state.room?.viewerSeatIndex, 2);
  } finally { c.dispose(); }
});

for (const seat of [0, 1, 2, 3] as const) test(`first reservation confirms actual seat ${seat}, not merely a pending label`, async () => {
  let wire = view(); const posts: unknown[] = [], pending = gate<Response>();
  if (seat === 0) [wire.players[0], wire.players[1]] = [{ ...wire.players[1], seat_index: 0 }, { ...wire.players[0], seat_index: 1 }];
  const c = setup(async (_url, init) => {
    if (init?.method !== "POST") return json(wire);
    posts.push(JSON.parse(String(init.body))); return pending.promise;
  });
  try {
    await c.resume(); const move = c.move({ type: "join-seat", seatIndex: seat });
    // Dispatch is synchronous up to fetch: no debounce, polling interval, or
    // redundant preflight GET adds latency to a synchronized reservation.
    assert.deepEqual(posts, [{ expectedVersion: 3, intent: { type: "join-seat", seatIndex: seat } }]);
    assert.deepEqual(c.state.seatReservation, { seat, phase: "sending" });
    assert.equal(c.state.room?.viewerSeatIndex, null);
    assert.equal(await c.move({ type: "join-seat", seatIndex: seat }), false);
    wire = structuredClone(wire); wire.room.state_version++; wire.viewerSeatIndex = seat;
    Object.assign(wire.players[seat], { kind: "human", display_name: "Local test player" });
    pending.resolve(json(wire)); assert.equal(await move, true);
    assert.equal(c.state.room?.viewerSeatIndex, seat); assert.equal(c.state.seatReservation?.phase, "confirmed");
    assert.deepEqual(posts, [{ expectedVersion: 3, intent: { type: "join-seat", seatIndex: seat } }]);
  } finally { c.dispose(); }
});

for (const failure of ["conflict", "network", "http", "wrong-seat", "old-version"] as const) test(`reservation ${failure} reconciles, retains feedback across refreshes, and retries only on explicit tap`, async () => {
  let wire = view(), posts = 0; const trace: SeatTrace[] = [];
  const c = setup(async (_url, init) => {
    if (init?.method !== "POST") return json(wire);
    posts++;
    if (posts === 1) {
      if (failure === "conflict") { wire.room.state_version++; return new Response(JSON.stringify({ error: "La table a changé. Réessaie.", code: "version_conflict" }), { status: 409 }); }
      if (failure === "network") throw new Error("local network failure");
      if (failure === "http") return new Response(JSON.stringify({ error: "Réservation indisponible. Réessaie.", code: "untrusted_private_value" }), { status: 503 });
      return json(view(failure === "old-version" ? 3 : 4, failure === "old-version" ? 2 : null));
    }
    const body = JSON.parse(String(init.body)); assert.equal(body.expectedVersion, wire.room.state_version);
    wire = view(wire.room.state_version + 1, 2); return json(wire);
  }, (event) => trace.push(event));
  try {
    await c.resume(); assert.equal(await c.move({ type: "join-seat", seatIndex: 2 }), false);
    assert.equal(posts, 1); assert.equal(c.state.room?.viewerSeatIndex, null);
    assert.equal(c.state.seatReservation?.phase, "failed"); assert.ok(c.state.seatReservation?.message);
    await c.load(); assert.ok(c.state.seatReservation?.message); assert.equal(posts, 1);
    assert.equal(await c.move({ type: "join-seat", seatIndex: 2 }), true);
    assert.equal(c.state.room?.viewerSeatIndex, 2); assert.equal(posts, 2);
    assert.ok(trace.some((e) => e.event === "reconcile"));
    assert.ok(trace.some((e) => e.event === "http-send"));
    assert.ok(trace.some((e) => e.event === "confirmed" && e.viewerAfter === 2));
    const diagnostic = JSON.stringify(trace);
    for (const privateValue of [who.access_token, who.user.id, "Local test player", "https://", "untrusted_private_value"]) assert.equal(diagnostic.includes(privateValue), false);
  } finally { c.dispose(); }
});

test("a lost POST response is confirmed by a fresh GET without replaying the mutation", async () => {
  let wire = view(), posts = 0;
  const c = setup(async (_url, init) => { if (init?.method === "POST") { posts++; wire = view(4, 2); throw new Error("response lost after commit"); } return json(wire); });
  try { await c.resume(); assert.equal(await c.move({ type: "join-seat", seatIndex: 2 }), true); assert.equal(posts, 1); assert.equal(c.state.room?.viewerSeatIndex, 2); }
  finally { c.dispose(); }
});

test("failed synchronization never displays sending or issues a POST, then explicit retry can succeed", async () => {
  let failRead = false; const methods: string[] = [], phases: string[] = [];
  const c = setup(async (_url, init) => { methods.push(init!.method!); if (failRead) throw new Error("offline"); return json(init?.method === "POST" ? view(4, 2) : view()); }, (event) => phases.push(event.event));
  try {
    await c.resume(); c.invalidate(); failRead = true;
    assert.equal(await c.move({ type: "join-seat", seatIndex: 2 }), false);
    assert.equal(phases.includes("post"), false); assert.deepEqual(methods, ["GET", "GET"]);
    assert.match(c.state.seatReservation?.message ?? "", /actualisée|connexion/);
    failRead = false; assert.equal(await c.move({ type: "join-seat", seatIndex: 2 }), true);
    assert.equal(methods.filter((m) => m === "POST").length, 1); assert.equal(c.state.room?.viewerSeatIndex, 2);
  } finally { c.dispose(); }
});

test("Realtime refreshes during the POST are deferred and a late heartbeat cannot undo the seat", async () => {
  const post = gate<Response>(), heartbeat = gate<Response>(); let wire = view(3, 1), gets = 0;
  const c = setup(async (url, init) => {
    if (String(url).endsWith("/presence")) return heartbeat.promise;
    if (init?.method === "POST") return post.promise;
    gets++; return json(wire);
  });
  try {
    await c.resume(); const maintenance = c.maintain("heartbeat");
    const move = c.move({ type: "join-seat", seatIndex: 2 }); c.invalidate(); await c.load();
    assert.equal(gets, 1);
    wire = view(4, 2); post.resolve(json(wire)); assert.equal(await move, true);
    heartbeat.resolve(json(view(4, 1))); await maintenance; await c.load();
    assert.equal(c.state.room?.viewerSeatIndex, 2); assert.equal(c.state.requiresSync, false);
  } finally { c.dispose(); }
});

test("background cancels a pending seat request, foreground reloads it, then moving seats uses one new POST", async () => {
  const pending = gate<Response>(); let wire = view(), posts = 0;
  const c = setup(async (_url, init) => { if (init?.method !== "POST") return json(wire); if (++posts === 1) return pending.promise; wire = view(5, 1); return json(wire); });
  const currentSeat = () => c.state.room?.viewerSeatIndex;
  try {
    await c.resume(); const first = c.move({ type: "join-seat", seatIndex: 2 }); c.suspend();
    wire = view(4, 2); pending.resolve(json(wire)); assert.equal(await first, false); assert.equal(c.state.room, null);
    await c.resume(); assert.equal(currentSeat(), 2);
    assert.equal(await c.move({ type: "join-seat", seatIndex: 1 }), true); assert.equal(currentSeat(), 1); assert.equal(posts, 2);
  } finally { c.dispose(); }
});

test("inactive and changed-session guards explain why no reservation was sent", async () => {
  let actor = who, posts = 0;
  const c = setup(async (_url, init) => { if (init?.method === "POST") posts++; return json(view()); }, undefined, () => actor);
  try {
    assert.equal(await c.move({ type: "join-seat", seatIndex: 2 }), false); assert.match(c.state.error ?? "", /active/);
    await c.resume(); actor = { ...who, user: { id: "other-local-account" } };
    assert.equal(await c.move({ type: "join-seat", seatIndex: 2 }), false); assert.match(c.state.error ?? "", /session/); assert.equal(posts, 0);
  } finally { c.dispose(); }
});

test("development traces are silent outside development and reject arbitrary error-code data", () => {
  assert.equal(seatErrorCode("version_conflict"), "version_conflict"); assert.equal(seatErrorCode(who.access_token), "other");
  const original = console.debug; let calls = 0; console.debug = () => { calls++; };
  try { traceSeat({ event: "touch", seat: 2 }); assert.equal(calls, 0); } finally { console.debug = original; }
});

for (const session of ["empty-token", "expired"] as const) test(`invalid ${session} cannot show sending or issue a reservation`, async () => {
  const actor: SoloIdentity = { ...who, ...(session === "expired" ? { expires_at: Date.now() / 1000 - 1 } : { access_token: "" }) };
  const trace: SeatTrace[] = [], methods: string[] = [];
  const c = setup(async (_url, init) => { methods.push(init!.method!); return json(view()); }, (event) => trace.push(event), () => actor);
  try {
    await c.resume(); assert.equal(await c.move({ type: "join-seat", seatIndex: 2 }), false);
    assert.match(c.state.error ?? "", /session/); assert.equal(trace.some((e) => e.event === "post"), false);
    assert.equal(methods.includes("POST"), false); assert.equal(c.state.seatReservation?.phase, "failed");
  } finally { c.dispose(); }
});
