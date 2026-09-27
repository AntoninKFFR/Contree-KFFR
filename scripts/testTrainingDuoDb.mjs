// Run only against a disposable local Supabase after `supabase db reset --local`.
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const url = process.env.DUO_TEST_SUPABASE_URL;
const anonKey = process.env.DUO_TEST_SUPABASE_ANON_KEY;
const serviceKey = process.env.DUO_TEST_SUPABASE_SERVICE_ROLE_KEY;
if (!url || !anonKey || !serviceKey || !["localhost", "127.0.0.1", "::1"].includes(new URL(url).hostname)) {
  throw new Error("Duo DB tests require disposable local DUO_TEST_SUPABASE_URL and anon/service keys.");
}
const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
const anonymous = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
const suffix = randomUUID().slice(0, 8);
const users = [];
const sessions = new Set();
let codeIndex = 0;
const SESSION_COLUMNS = ["id", "status", "question_phase", "current_index", "state_version", "updated_at"];
const PARTICIPANT_COLUMNS = ["id", "session_id", "slot", "is_ready", "ready_for_next", "last_seen_at"];
const UNRELATED_TABLES = ["rooms", "room_players", "room_game_states", "multiplayer_games",
  "training_series", "training_records", "player_ratings", "game_invitations"];

function checked(result, label) {
  if (result.error) throw new Error(`${label}: ${result.error.message}`);
  return result.data;
}
async function rejected(promise, label, pattern = /permission|denied|not found|function/i) {
  const { error } = await promise;
  assert.ok(error, `${label} should be refused`);
  assert.match(error.message, pattern, label);
}
function code() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let value = ++codeIndex;
  let result = "";
  for (let i = 0; i < 10; i += 1) { result = alphabet[value % 32] + result; value = Math.floor(value / 32); }
  return result;
}
async function identity(label) {
  const email = `duo-${label}-${suffix}@example.test`;
  const password = `Local-${randomUUID()}-test`;
  const created = checked(await admin.auth.admin.createUser({
    email, password, email_confirm: true, user_metadata: { username: `Duo${label}${suffix}` },
  }), `create ${label}`);
  const client = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const login = checked(await client.auth.signInWithPassword({ email, password }), `login ${label}`);
  client.realtime.setAuth(login.session.access_token);
  const person = { id: created.user.id, name: `Duo${label}${suffix}`, client };
  users.push(person);
  return person;
}
async function rpc(name, args) { return checked(await admin.rpc(name, args), name); }
async function unrelatedCounts() {
  const entries = await Promise.all(UNRELATED_TABLES.map(async (table) => {
    const result = await admin.from(table).select("*", { count: "exact", head: true });
    checked(result, `${table} count`);
    return [table, result.count];
  }));
  return Object.fromEntries(entries);
}
async function create(host) {
  const id = await rpc("training_duo_create", {
    p_actor: host.id, p_display_name: host.name, p_code: code(), p_level: 1,
  });
  sessions.add(id);
  return id;
}
async function join(id, person) {
  const row = checked(await admin.from("training_duo_sessions").select("code").eq("id", id).single(), "session code");
  return rpc("training_duo_join", { p_actor: person.id, p_display_name: person.name, p_code: row.code });
}
async function state(id) {
  return checked(await admin.from("training_duo_sessions").select("*").eq("id", id).single(), "session state");
}
async function mutate(id, person, expectedVersion, type, extra = {}) {
  return admin.rpc("training_duo_mutate", {
    p_session_id: id, p_actor: person.id, p_expected_version: expectedVersion,
    p_type: type, p_ready: null, p_seed: null, p_base_seed: null,
    p_question_index: null, p_answer: null, p_score: null, ...extra,
  });
}
async function readyAndStart(id, a, b) {
  checked(await mutate(id, a, (await state(id)).state_version, "set-ready", { p_ready: true }), "ready A");
  checked(await mutate(id, b, (await state(id)).state_version, "set-ready", { p_ready: true }), "ready B");
  checked(await mutate(id, a, (await state(id)).state_version, "start", { p_seed: 480_000 }), "start");
}
async function waitSubscribed(channel) {
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("Realtime subscription timeout")), 15_000);
    channel.subscribe((status) => {
      if (status === "SUBSCRIBED") { clearTimeout(timeout); resolve(); }
      if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
        clearTimeout(timeout); reject(new Error(`Realtime ${status}`));
      }
    });
  });
}
async function waitEvent(events, matches, label) {
  const until = Date.now() + 10_000;
  while (!events.some(matches) && Date.now() < until) await new Promise((resolve) => setTimeout(resolve, 50));
  const event = events.find(matches);
  assert.ok(event, `Expected ${label} Realtime change event`);
  return event;
}

async function primeRealtime(id, actor, sessionEvents, participantEvents) {
  // SUBSCRIBED confirms the socket join, not that the local replication worker is ready.
  // Probe both published tables until a real authorized change reaches each subscriber.
  for (let attempt = 0; attempt < 20 && (!sessionEvents.length || !participantEvents.length); attempt += 1) {
    if (!sessionEvents.length) checked(await admin.from("training_duo_sessions")
      .update({ updated_at: new Date().toISOString() }).eq("id", id), "Realtime session probe");
    if (!participantEvents.length) await rpc("training_duo_heartbeat", { p_session_id: id, p_actor: actor.id });
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  assert.ok(sessionEvents.length > 0, "Authorized session changes must be delivered through Realtime");
  assert.ok(participantEvents.length > 0, "Authorized participant changes must be delivered through Realtime");
}

async function checkSecurity(a, b, stranger) {
  const id = await create(a);
  await join(id, b);
  for (const person of [a, b]) {
    const visible = checked(await person.client.from("training_duo_sessions").select(SESSION_COLUMNS.join(",")).eq("id", id), "member session");
    assert.equal(visible.length, 1);
    const seats = checked(await person.client.from("training_duo_participants").select(PARTICIPANT_COLUMNS.join(",")).eq("session_id", id), "member seats");
    assert.equal(seats.length, 2);
    for (const field of ["host_user_id", "code", "level", "axis_id", "doctrine_id"]) {
      await rejected(person.client.from("training_duo_sessions").select(field).eq("id", id), `private session ${field}`);
    }
    for (const field of ["user_id", "display_name"]) {
      await rejected(person.client.from("training_duo_participants").select(field).eq("session_id", id), `private participant ${field}`);
    }
    await rejected(person.client.from("training_duo_answers").select("*"), "answers read");
    await rejected(person.client.from("training_duo_session_secrets").select("*"), "seed read");
    await rejected(person.client.from("training_duo_sessions").update({ status: "cancelled" }).eq("id", id), "direct update");
    await rejected(person.client.from("training_duo_participants").insert({ session_id: id, user_id: person.id, slot: 1, display_name: "X" }), "direct insert");
    await rejected(person.client.from("training_duo_answers").delete().eq("session_id", id), "direct delete");
    await rejected(person.client.rpc("training_duo_mutate", { p_session_id: id, p_actor: person.id,
      p_expected_version: 0, p_type: "cancel" }), "private RPC");
  }
  assert.equal(checked(await stranger.client.from("training_duo_sessions").select(SESSION_COLUMNS.join(",")).eq("id", id), "nonmember session").length, 0);
  assert.equal(checked(await stranger.client.from("training_duo_participants").select(PARTICIPANT_COLUMNS.join(",")).eq("session_id", id), "nonmember seats").length, 0);
  await rejected(anonymous.from("training_duo_sessions").select("id"), "anon session");
  await rejected(anonymous.from("training_duo_participants").select("id"), "anon seats");

  const sessionEvents = []; const participantEvents = []; const strangerEvents = [];
  const answerEvents = []; const secretEvents = [];
  const sChannel = a.client.channel(`duo-session-${suffix}`).on("postgres_changes", {
    event: "*", schema: "public", table: "training_duo_sessions", filter: `id=eq.${id}`,
  }, (payload) => sessionEvents.push(payload));
  const pChannel = b.client.channel(`duo-participants-${suffix}`).on("postgres_changes", {
    event: "*", schema: "public", table: "training_duo_participants", filter: `session_id=eq.${id}`,
  }, (payload) => participantEvents.push(payload));
  const xChannel = stranger.client.channel(`duo-stranger-${suffix}`).on("postgres_changes", {
    event: "*", schema: "public", table: "training_duo_sessions", filter: `id=eq.${id}`,
  }, (payload) => strangerEvents.push(payload));
  const answerChannel = a.client.channel(`duo-answers-${suffix}`).on("postgres_changes", {
    event: "*", schema: "public", table: "training_duo_answers", filter: `session_id=eq.${id}`,
  }, (payload) => answerEvents.push(payload));
  const secretChannel = b.client.channel(`duo-secrets-${suffix}`).on("postgres_changes", {
    event: "*", schema: "public", table: "training_duo_session_secrets", filter: `session_id=eq.${id}`,
  }, (payload) => secretEvents.push(payload));
  try {
    await Promise.all([waitSubscribed(sChannel), waitSubscribed(pChannel), waitSubscribed(xChannel),
      waitSubscribed(answerChannel), waitSubscribed(secretChannel)]);
    await primeRealtime(id, a, sessionEvents, participantEvents);
    const nextVersion = (await state(id)).state_version + 1;
    checked(await mutate(id, a, (await state(id)).state_version, "set-ready", { p_ready: true }), "Realtime ready");
    const sessionReadyEvent = await waitEvent(sessionEvents,
      (event) => Number(event.new.state_version) === nextVersion, "ready session");
    const participantReadyEvent = await waitEvent(participantEvents,
      (event) => event.new.is_ready === true, "ready participant");
    assert.deepEqual(Object.keys(sessionReadyEvent.new).sort(), [...SESSION_COLUMNS].sort());
    assert.deepEqual(Object.keys(participantReadyEvent.new).sort(), [...PARTICIPANT_COLUMNS].sort());
    assert.equal(JSON.stringify([...sessionEvents, ...participantEvents]).includes(a.id), false);
    assert.equal(JSON.stringify([...sessionEvents, ...participantEvents]).includes(b.id), false);
    checked(await mutate(id, b, (await state(id)).state_version, "set-ready", { p_ready: true }), "Realtime partner ready");
    checked(await mutate(id, a, (await state(id)).state_version, "start", { p_seed: 480_000 }), "Realtime start");
    checked(await mutate(id, a, (await state(id)).state_version, "submit-answer", {
      p_base_seed: 480_000, p_question_index: 0, p_answer: { selectedAssertionIds: [] }, p_score: 0,
    }), "Realtime answer");
    await new Promise((resolve) => setTimeout(resolve, 500));
    assert.equal(strangerEvents.length, 0);
    assert.equal(answerEvents.length, 0, "answers must not be published");
    assert.equal(secretEvents.length, 0, "secrets must not be published");
  } finally {
    await Promise.all([a.client.removeChannel(sChannel), b.client.removeChannel(pChannel),
      stranger.client.removeChannel(xChannel), a.client.removeChannel(answerChannel), b.client.removeChannel(secretChannel)]);
  }
}

async function checkRateLimit(a, b) {
  const accountA = randomBytes(32).toString("hex");
  const accountB = randomBytes(32).toString("hex");
  const sharedIp = randomBytes(32).toString("hex");
  const args = (accountHash, ipLimit = 10, accountLimit = 5) => ({
    p_scope: "join", p_account_hash: accountHash, p_ip_hash: sharedIp,
    p_account_limit: accountLimit, p_ip_limit: ipLimit, p_window_seconds: 60,
  });
  const burst = await Promise.all(Array.from({ length: 11 }, () => admin.rpc("training_duo_consume_rate_limit", args(accountA))));
  const values = burst.map((result) => checked(result, "concurrent rate consumption"));
  assert.equal(values.filter((value) => value === 0).length, 5, "atomic account quota has exactly five successes");
  assert.equal(values.filter((value) => value > 0).length, 6, "all excess concurrent calls are refused");
  assert.ok(values.every((value) => Number.isInteger(value) && value >= 0 && value <= 60));
  const stored = checked(await admin.from("training_duo_rate_limits").select("scope,key_hash,request_count,window_started_at")
    .eq("key_hash", accountA), "account limit row");
  assert.equal(stored.length, 1);
  assert.equal(stored[0].request_count, 5);
  assert.equal(stored[0].scope, "join:account");
  assert.equal(checked(await admin.from("training_duo_rate_limits").select("request_count")
    .eq("scope", "join:ip").eq("key_hash", sharedIp), "shared IP row")[0].request_count, 5);
  assert.equal(checked(await admin.rpc("training_duo_consume_rate_limit", args(accountB, 10, 10)), "second account"), 0);
  assert.equal(checked(await admin.from("training_duo_rate_limits").select("request_count")
    .eq("scope", "join:ip").eq("key_hash", sharedIp), "shared IP after second account")[0].request_count, 6);
  const ipBurst = await Promise.all(Array.from({ length: 5 }, () => admin.rpc("training_duo_consume_rate_limit", args(accountB, 10, 10))));
  const ipValues = ipBurst.map((result) => checked(result, "shared IP consumption"));
  assert.equal(ipValues.filter((value) => value === 0).length, 4, "shared IP reaches its exact limit");
  assert.equal(ipValues.filter((value) => value > 0).length, 1, "shared IP blocks another account");
  const secondCount = checked(await admin.from("training_duo_rate_limits").select("request_count")
    .eq("scope", "join:account").eq("key_hash", accountB), "second account row")[0].request_count;
  assert.equal(secondCount, 5);
  checked(await admin.from("training_duo_rate_limits").update({ window_started_at: new Date(Date.now() - 61_000).toISOString() })
    .eq("scope", "join:account").eq("key_hash", accountA), "age account window");
  checked(await admin.from("training_duo_rate_limits").update({ window_started_at: new Date(Date.now() - 61_000).toISOString() })
    .eq("scope", "join:ip").eq("key_hash", sharedIp), "age IP window");
  assert.equal(checked(await admin.rpc("training_duo_consume_rate_limit", args(accountA)), "new window"), 0);
  assert.equal(checked(await admin.from("training_duo_rate_limits").select("request_count")
    .eq("scope", "join:account").eq("key_hash", accountA), "reset account")[0].request_count, 1);
  for (const client of [anonymous, a.client, b.client]) {
    await rejected(client.from("training_duo_rate_limits").select("*"), "rate table read");
    await rejected(client.from("training_duo_rate_limits").insert({ scope: "join:account", key_hash: accountA,
      window_started_at: new Date().toISOString(), request_count: 1 }), "rate table insert");
    await rejected(client.from("training_duo_rate_limits").update({ request_count: 999 })
      .eq("key_hash", accountA), "rate table update");
    await rejected(client.from("training_duo_rate_limits").delete().eq("key_hash", accountA), "rate table delete");
    await rejected(client.rpc("training_duo_consume_rate_limit", args(accountA)), "rate RPC");
  }
  assert.ok(stored.every((row) => /^[0-9a-f]{64}$/.test(row.key_hash)));
  assert.equal(JSON.stringify(stored).includes("203.0.113."), false, "no raw IP is stored");
  checked(await admin.from("training_duo_rate_limits").delete().eq("key_hash", accountA), "cleanup account A");
  checked(await admin.from("training_duo_rate_limits").delete().eq("key_hash", accountB), "cleanup account B");
  checked(await admin.from("training_duo_rate_limits").delete().eq("key_hash", sharedIp), "cleanup IP");
  console.log("Training duo DB rate limit: concurrent exact quota, shared IP, window reset and role isolation passed.");
}

async function checkConcurrency(a, b, c) {
  const id = await create(a);
  const codeRow = checked(await admin.from("training_duo_sessions").select("code").eq("id", id).single(), "race code");
  const joins = await Promise.all([b, c].map((person) => admin.rpc("training_duo_join", {
    p_actor: person.id, p_display_name: person.name, p_code: codeRow.code,
  })));
  assert.equal(joins.filter((result) => !result.error).length, 1);
  const winner = joins[0].error ? c : b;
  assert.equal(checked(await admin.from("training_duo_participants").select("id").eq("session_id", id).is("left_at", null), "seat count").length, 2);
  checked(await mutate(id, a, (await state(id)).state_version, "set-ready", { p_ready: true }), "host ready");
  checked(await mutate(id, winner, (await state(id)).state_version, "set-ready", { p_ready: true }), "partner ready");
  checked(await admin.from("training_duo_participants").update({ last_seen_at: new Date(Date.now() - 61_000).toISOString() })
    .eq("session_id", id).eq("user_id", winner.id), "offline fixture");
  await rejected(mutate(id, a, (await state(id)).state_version, "start", { p_seed: 480_000 }), "offline start", /duo_partner_offline/);
  await rpc("training_duo_heartbeat", { p_session_id: id, p_actor: winner.id });
  const beforeStart = (await state(id)).state_version;
  const starts = await Promise.all([480_000, 480_001].map((seed) => mutate(id, a, beforeStart, "start", { p_seed: seed })));
  assert.equal(starts.filter((result) => !result.error).length, 1);
  assert.equal(starts.filter((result) => result.error?.message === "duo_version_conflict").length, 1);
  assert.equal(checked(await admin.from("training_duo_session_secrets").select("seed").eq("session_id", id), "one seed").length, 1);
  assert.equal((await state(id)).state_version, beforeStart + 1);
  checked(await admin.from("training_duo_participants").update({ last_seen_at: new Date(Date.now() - 61_000).toISOString() })
    .eq("session_id", id).eq("user_id", winner.id), "offline after start");
  assert.equal((await state(id)).status, "active");

  const seed = checked(await admin.from("training_duo_session_secrets").select("seed").eq("session_id", id).single(), "seed").seed;
  const answer = { selectedAssertionIds: [] };
  const base = (await state(id)).state_version;
  const submits = await Promise.all([a, winner].map((person) => mutate(id, person, base, "submit-answer", {
    p_base_seed: seed, p_question_index: 0, p_answer: answer, p_score: 0,
  })));
  assert.equal(submits.filter((result) => !result.error).length, 1);
  assert.equal(submits.filter((result) => result.error?.message === "duo_version_conflict").length, 1);
  assert.equal((await state(id)).question_phase, "answering");
  const second = submits[0].error ? a : winner;
  checked(await mutate(id, second, (await state(id)).state_version, "submit-answer", {
    p_base_seed: seed, p_question_index: 0, p_answer: answer, p_score: 0,
  }), "second submit");
  assert.equal((await state(id)).question_phase, "revealed");
  assert.equal(checked(await admin.from("training_duo_answers").select("user_id").eq("session_id", id).eq("question_index", 0), "two answers").length, 2);
  const afterReveal = (await state(id)).state_version;
  checked(await mutate(id, second, base, "submit-answer", {
    p_base_seed: seed, p_question_index: 0, p_answer: answer, p_score: 0,
  }), "same answer idempotent");
  assert.equal((await state(id)).state_version, afterReveal);
  await rejected(mutate(id, second, base, "submit-answer", { p_base_seed: seed, p_question_index: 0,
    p_answer: { selectedAssertionIds: ["shows-suit"] }, p_score: 0 }), "answer immutable", /duo_already_answered/);
  const readies = await Promise.all([a, winner].map((person) => mutate(id, person, afterReveal, "ready-next")));
  assert.equal(readies.filter((result) => !result.error).length, 1);
  assert.equal(readies.filter((result) => result.error?.message === "duo_version_conflict").length, 1);
  assert.equal((await state(id)).current_index, 0);
  const last = readies[0].error ? a : winner;
  checked(await mutate(id, last, (await state(id)).state_version, "ready-next"), "second ready");
  assert.equal((await state(id)).current_index, 1);
  assert.equal((await state(id)).question_phase, "answering");
  for (let index = 1; index < 10; index += 1) {
    for (const person of [a, winner]) {
      checked(await mutate(id, person, (await state(id)).state_version, "submit-answer", {
        p_base_seed: seed, p_question_index: index, p_answer: answer, p_score: 0,
      }), `question ${index + 1} answer`);
    }
    assert.equal((await state(id)).question_phase, "revealed");
    for (const person of [a, winner]) {
      checked(await mutate(id, person, (await state(id)).state_version, "ready-next"), `question ${index + 1} ready`);
    }
  }
  assert.equal((await state(id)).status, "completed");
  assert.equal(checked(await admin.from("training_duo_answers").select("question_index").eq("session_id", id), "ten questions").length, 20);
}

async function checkLeaveAndExpiry(a, b) {
  const lobby = await create(a);
  await join(lobby, b);
  checked(await mutate(lobby, b, (await state(lobby)).state_version, "leave"), "lobby leave");
  assert.equal((await state(lobby)).status, "lobby");
  assert.equal(checked(await admin.from("training_duo_participants").select("id").eq("session_id", lobby).eq("user_id", b.id).not("left_at", "is", null), "retained participant").length, 1);
  await join(lobby, b);
  assert.equal(checked(await admin.from("training_duo_participants").select("id").eq("session_id", lobby).eq("user_id", b.id), "rejoin same row").length, 1);
  checked(await admin.from("training_duo_sessions").update({ updated_at: new Date(Date.now() - 31 * 60_000).toISOString() })
    .eq("id", lobby), "age lobby");
  await rpc("training_duo_expire", { p_session_id: lobby, p_actor: a.id });
  assert.equal((await state(lobby)).cancel_reason, "expired");

  const active = await create(a);
  await join(active, b);
  await readyAndStart(active, a, b);
  checked(await admin.from("training_duo_participants").update({ last_seen_at: new Date(Date.now() - 61_000).toISOString() })
    .eq("session_id", active).eq("user_id", b.id), "offline active");
  assert.equal((await state(active)).status, "active");
  await rpc("training_duo_expire", { p_session_id: active, p_actor: a.id });
  assert.equal((await state(active)).status, "active");
  checked(await mutate(active, b, (await state(active)).state_version, "leave"), "explicit active leave");
  assert.equal((await state(active)).status, "cancelled");
  assert.equal((await state(active)).cancel_reason, "left");

  const old = await create(a);
  await join(old, b);
  await readyAndStart(old, a, b);
  checked(await admin.from("training_duo_sessions").update({ started_at: new Date(Date.now() - 2 * 3_600_000 - 1_000).toISOString() })
    .eq("id", old), "age active");
  await rpc("training_duo_expire", { p_session_id: old, p_actor: a.id });
  assert.equal((await state(old)).cancel_reason, "expired");
}

async function checkFormerGuestDeletion(a) {
  const formerGuest = await identity("FormerGuest");
  const currentGuest = await identity("CurrentGuest");
  const id = await create(a);
  await join(id, formerGuest);
  checked(await mutate(id, formerGuest, (await state(id)).state_version, "leave"), "former guest leaves");
  await join(id, currentGuest);
  checked(await admin.auth.admin.deleteUser(formerGuest.id), "delete departed guest");
  users.splice(users.findIndex((user) => user.id === formerGuest.id), 1);
  assert.equal((await state(id)).status, "lobby", "deleting a departed guest must preserve the lobby");
  const active = checked(await admin.from("training_duo_participants").select("user_id")
    .eq("session_id", id).is("left_at", null), "active guests after account deletion");
  assert.deepEqual(active.map((participant) => participant.user_id).sort(), [a.id, currentGuest.id].sort());
}

async function checkDeletion(label, terminalStatus) {
  const host = await identity(`${label}Host`);
  const guest = await identity(`${label}Guest`);
  const id = await create(host);
  await join(id, guest);
  if (terminalStatus !== "lobby") {
    await readyAndStart(id, host, guest);
    checked(await admin.from("training_duo_answers").insert({ session_id: id, question_index: 0,
      user_id: host.id, answer: { selectedAssertionIds: [] }, score: 0 }), "answer fixture");
    if (terminalStatus !== "active") {
      checked(await admin.from("training_duo_sessions").update({ status: terminalStatus,
        question_phase: null, finished_at: new Date().toISOString() }).eq("id", id), "terminal fixture");
    }
  }
  const deletedUser = label.startsWith("Host") ? host : guest;
  checked(await admin.auth.admin.deleteUser(deletedUser.id), `delete ${label}`);
  users.splice(users.findIndex((user) => user.id === deletedUser.id), 1);
  for (const [table, column] of [["training_duo_sessions", "id"], ["training_duo_participants", "session_id"],
    ["training_duo_answers", "session_id"], ["training_duo_session_secrets", "session_id"]]) {
    assert.equal(checked(await admin.from(table).select(column).eq(column, id), `${label} ${table} orphans`).length, 0);
  }
  sessions.delete(id);
}

async function run() {
  try {
    const [a, b, c] = await Promise.all([identity("A"), identity("B"), identity("C")]);
    const unrelatedBefore = await unrelatedCounts();
    await checkSecurity(a, b, c);
    await checkRateLimit(a, b);
    await checkConcurrency(a, b, c);
    await checkLeaveAndExpiry(a, b);
    await checkFormerGuestDeletion(a);
    assert.deepEqual(await unrelatedCounts(), unrelatedBefore, "duo operations must not write multiplayer, records, ratings or invitations");
    for (const who of ["Host", "Guest"]) {
      for (const status of ["lobby", "active", "completed", "cancelled"]) {
        await checkDeletion(`${who}${status}`, status);
      }
    }
    console.log("Training duo DB: JWT/RLS, Realtime payloads, CAS races and account cascades passed.");
  } finally {
    for (const id of sessions) await admin.from("training_duo_sessions").delete().eq("id", id);
    for (const user of users) await admin.auth.admin.deleteUser(user.id);
  }
}
await run();
