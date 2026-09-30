// Run only on a disposable local Supabase after `supabase db reset --local`.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const url = process.env.PROGRESSION_TEST_SUPABASE_URL;
const anonKey = process.env.PROGRESSION_TEST_SUPABASE_ANON_KEY;
const serviceKey = process.env.PROGRESSION_TEST_SUPABASE_SERVICE_ROLE_KEY;
if (!url || !anonKey || !serviceKey || !["localhost", "127.0.0.1", "::1"].includes(new URL(url).hostname)) {
  throw new Error("Progression DB tests require local PROGRESSION_TEST_SUPABASE_URL and local anon/service keys.");
}
const options = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(url, serviceKey, options);
const anonymous = createClient(url, anonKey, options);
const users = [];
const suffix = randomUUID().slice(0, 8);
function checked(result, label) {
  if (result.error) throw new Error(`${label}: ${result.error.message}`);
  return result.data;
}
async function denied(promise, label) {
  const { error } = await promise;
  assert.ok(error, `${label} must be refused`);
  assert.match(error.message, /permission|denied|not found|function/i, label);
}
async function identity(label) {
  const email = `progression-${label}-${suffix}@example.test`;
  const password = `Local-${randomUUID()}-test`;
  const { user } = checked(await admin.auth.admin.createUser({ email, password,
    email_confirm: true, user_metadata: { username: `Progress${label}${suffix}` } }), `create ${label}`);
  users.push(user);
  const client = createClient(url, anonKey, options);
  checked(await client.auth.signInWithPassword({ email, password }), `sign in ${label}`);
  return { id: user.id, client };
}
function parameters(userId, amount, sourceId, sourceType = "solo_game") {
  return { p_user_id: userId, p_amount: amount, p_source_type: sourceType, p_source_id: sourceId };
}
async function credit(user, amount, sourceId, sourceType = "solo_game") {
  return checked(await admin.rpc("credit_progression_xp", parameters(user.id, amount, sourceId, sourceType)), "credit XP");
}
async function coherent(user, expectedTotal, expectedCount) {
  const state = checked(await admin.from("player_progression").select("total_xp,updated_at")
    .eq("user_id", user.id).maybeSingle(), "state");
  const ledger = checked(await admin.from("progression_xp_events").select("id,amount,source_type,source_id")
    .eq("user_id", user.id), "ledger");
  assert.equal(state?.total_xp ?? 0, expectedTotal);
  assert.equal(ledger.length, expectedCount);
  assert.equal(ledger.reduce((sum, event) => sum + event.amount, 0), expectedTotal);
  return { state, ledger };
}

try {
  const [a, b, c, d] = await Promise.all(["A", "B", "C", "D"].map(identity));
  assert.deepEqual(checked(await a.client.rpc("get_my_progression"), "missing state"), { total_xp: 0 });
  assert.equal(checked(await admin.from("player_progression").select("user_id").eq("user_id", a.id), "lazy read").length, 0);
  const source = randomUUID();
  const first = await credit(a, 20, source);
  assert.equal(first.credited, true);
  assert.equal(first.total_xp, 20);
  assert.equal(first.amount, 20);
  const initial = await coherent(a, 20, 1);
  const retry = await credit(a, 20, source);
  assert.deepEqual(retry, { ...first, credited: false });
  assert.deepEqual(await coherent(a, 20, 1), initial); // Retry doesn't touch updated_at.
  await credit(a, 30, randomUUID(), "multiplayer_game");
  await coherent(a, 50, 2);
  const other = await credit(b, 40, source);
  assert.notEqual(other.event_id, first.event_id);
  await coherent(b, 40, 1);
  await credit(a, 10, source, "permanent_mission"); // Type is part of the identity.
  await coherent(a, 60, 3);

  const changed = await admin.rpc("credit_progression_xp", parameters(a.id, 999, source));
  assert.equal(changed.error?.message, "progression_source_amount_mismatch");
  await coherent(a, 60, 3);

  // Real concurrent first credits, identical retries and distinct sources.
  const concurrentSource = randomUUID();
  const concurrent = await Promise.all(Array.from({ length: 12 }, () => credit(c, 25, concurrentSource)));
  assert.equal(concurrent.filter((result) => result.credited).length, 1);
  assert.equal(new Set(concurrent.map((result) => result.event_id)).size, 1);
  await coherent(c, 25, 1);
  await Promise.all(Array.from({ length: 12 }, (_, index) => credit(c, 5, `distinct-${index}`, "weekly_mission")));
  await coherent(c, 85, 13);

  for (const client of [a.client, b.client]) {
    const id = client === a.client ? a.id : b.id;
    const foreign = client === a.client ? b.id : a.id;
    const own = checked(await client.from("player_progression").select("user_id,total_xp"), "owner state");
    assert.deepEqual(own.map((row) => row.user_id), [id]);
    assert.deepEqual(checked(await client.from("player_progression").select("user_id").eq("user_id", foreign), "foreign state"), []);
    const events = checked(await client.from("progression_xp_events").select("user_id"), "owner events");
    assert.ok(events.length > 0 && events.every((row) => row.user_id === id));
    assert.deepEqual(checked(await client.from("progression_xp_events").select("id").eq("user_id", foreign), "foreign events"), []);
    assert.deepEqual(checked(await client.rpc("get_my_progression"), "own RPC"), { total_xp: id === a.id ? 60 : 40 });
  }
  for (const client of [anonymous, a.client, admin]) {
    await denied(client.from("player_progression").insert({ user_id: d.id, total_xp: 999 }), "direct state insert");
    await denied(client.from("player_progression").update({ total_xp: 999 }).eq("user_id", a.id), "direct state update");
    await denied(client.from("player_progression").delete().eq("user_id", a.id), "direct state delete");
    await denied(client.from("progression_xp_events").insert({ user_id: a.id, amount: 999,
      source_type: "solo_game", source_id: randomUUID() }), "direct event insert");
    await denied(client.from("progression_xp_events").update({ amount: 999 }).eq("id", first.event_id), "direct event update");
    await denied(client.from("progression_xp_events").delete().eq("id", first.event_id), "direct event delete");
  }
  for (const client of [anonymous, a.client]) {
    await denied(client.rpc("credit_progression_xp", parameters(a.id, 999, randomUUID())), "untrusted credit RPC");
    await denied(client.rpc("credit_progression_xp", parameters(b.id, 999, randomUUID())), "foreign credit RPC");
  }
  await denied(anonymous.rpc("get_my_progression"), "anonymous read RPC");
  for (const table of ["player_progression", "progression_xp_events"]) {
    await denied(anonymous.from(table).select("*"), "anonymous direct read");
  }
  // Authenticated role alone, without a user's JWT, cannot read a virtual account.
  const noUser = await admin.rpc("get_my_progression");
  assert.ok(noUser.error);

  const valid = parameters(d.id, 10, "valid", "training_mission");
  for (const overrides of [
    { p_user_id: null }, { p_user_id: randomUUID() }, { p_amount: null }, { p_amount: 0 },
    { p_amount: -1 }, { p_amount: 1.5 }, { p_amount: "9007199254740992" },
    { p_source_type: null }, { p_source_type: "unknown" }, { p_source_id: null },
    { p_source_id: "" }, { p_source_id: " " }, { p_source_id: " padded" },
    { p_source_id: "control\n" }, { p_source_id: "x".repeat(201) },
  ]) {
    const invalid = await admin.rpc("credit_progression_xp", { ...valid, ...overrides });
    assert.ok(invalid.error, `invalid parameters should fail: ${JSON.stringify(overrides)}`);
    await coherent(d, 0, 0);
    assert.equal(checked(await admin.from("player_progression").select("user_id").eq("user_id", d.id), "failed credit rollback").length, 0);
  }
  await credit(d, Number.MAX_SAFE_INTEGER, "max", "training_mission");
  await coherent(d, Number.MAX_SAFE_INTEGER, 1);
  const overflow = await admin.rpc("credit_progression_xp", parameters(d.id, 1, "overflow"));
  assert.equal(overflow.error?.code, "23514");
  await coherent(d, Number.MAX_SAFE_INTEGER, 1); // Event insert rolls back with total.
  assert.equal((await credit(d, Number.MAX_SAFE_INTEGER, "max", "training_mission")).credited, false);
  await coherent(a, 60, 3);
  await coherent(b, 40, 1);
  console.log("Progression DB: real JWT RLS, restricted grants, idempotence, concurrency, validation, lazy read and rollback passed.");
} finally {
  for (const user of users) checked(await admin.auth.admin.deleteUser(user.id), "delete fixture user");
}
