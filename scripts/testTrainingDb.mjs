// Run only against a disposable local Supabase after `supabase db reset --local`.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const url = process.env.TRAINING_TEST_SUPABASE_URL;
const anonKey = process.env.TRAINING_TEST_SUPABASE_ANON_KEY;
const serviceKey = process.env.TRAINING_TEST_SUPABASE_SERVICE_ROLE_KEY;
if (!url || !anonKey || !serviceKey || !["localhost", "127.0.0.1", "::1"].includes(new URL(url).hostname)) {
  throw new Error("Training DB tests require local TRAINING_TEST_SUPABASE_URL and local anon/service keys.");
}

const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
const anonymous = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
const users = [];
const suffix = randomUUID().slice(0, 8);
function checked(result, label) {
  if (result.error) throw new Error(`${label}: ${result.error.message}`);
  return result.data;
}
async function denied(promise, label) {
  const result = await promise;
  assert.ok(result.error, `${label} should be refused`);
  assert.match(result.error.message, /permission|denied|not found|function/i, label);
}
async function identity(label) {
  const who = await fixtureIdentity(label);
  const client = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  checked(await client.auth.signInWithPassword({ email: who.email, password: who.password }), `sign in ${label}`);
  return { ...who, client };
}
async function fixtureIdentity(label) {
  const username = `Training${label}${suffix}`;
  const email = `training-${label}-${suffix}@example.test`;
  const password = `Local-${randomUUID()}-test`;
  const created = checked(await admin.auth.admin.createUser({ email, password, email_confirm: true,
    user_metadata: { username } }), `create ${label}`);
  const who = { id: created.user.id, username, email, password };
  users.push(who);
  return who;
}
const answers = Array.from({ length: 10 }, () => ({ kind: "number", value: 0 }));
async function write(user, axisId, level, score, durationMs, timed = true) {
  return checked(await admin.rpc("record_verified_training_series", {
    p_user_id: user.id, p_axis_id: axisId, p_axis_version: 1, p_level: level,
    p_ruleset_id: "contree-kffr", p_ruleset_version: 1, p_generator_version: 1,
    p_seed: 480_000, p_answers: answers, p_question_count: 10, p_score: score,
    p_duration_ms: durationMs, p_timed: timed,
  }), "record verified series");
}
async function friend(left, right) {
  const [user_low, user_high] = [left.id, right.id].sort();
  checked(await admin.from("friendships").insert({ user_low, user_high }), "create friendship");
  return { user_low, user_high };
}
async function leaderboard(user, axisId = "master-cards", level = 1) {
  return checked(await user.client.rpc("get_friends_training_leaderboard", {
    p_axis_id: axisId, p_level: level,
  }), "friends training leaderboard");
}

async function testFriendsLeaderboard(a, b) {
  const c = await identity("C"); // Friend with no record for this axis.
  const d = await identity("D"); // Non-friend with a stronger record.
  const e = await identity("E"); // Pending request, never a friendship.
  const f = await identity("F"); // Friend with a fractional score.
  const ab = await friend(a, b);
  await friend(a, c);
  await friend(a, f);
  checked(await admin.from("friend_requests").insert({ requester_id: a.id, recipient_id: e.id }), "pending friend request");

  await write(a, "master-cards", 1, 10, 30_000);
  await write(b, "master-cards", 1, 10, 15_000);
  await write(f, "master-cards", 1, 9.75, 20_000);
  await write(d, "master-cards", 1, 10, 5_000);
  await write(e, "master-cards", 1, 10, 6_000);
  const entries = await leaderboard(a);
  assert.deepEqual(entries.map((entry) => entry.username), [b.username, a.username, f.username]);
  assert.deepEqual(entries.map((entry) => entry.best_score), [10, 10, 9.75]);
  assert.deepEqual(entries.map((entry) => entry.best_duration_ms), [15_000, 30_000, null]);
  assert.ok(entries.every((entry) => JSON.stringify(Object.keys(entry).sort())
    === JSON.stringify(["best_duration_ms", "best_score", "username"])));
  assert.equal(JSON.stringify(entries).includes("@example.test"), false);
  assert.equal(JSON.stringify(entries).includes(d.username), false);
  assert.equal(JSON.stringify(entries).includes(e.username), false);
  assert.equal(JSON.stringify(entries).includes(c.username), false);
  assert.deepEqual(await leaderboard(a, "master-cards", 2), []);
  assert.deepEqual((await leaderboard(d)).map((entry) => entry.username), [d.username]);
  assert.deepEqual((await leaderboard(b)).map((entry) => entry.username), [b.username, a.username]);

  // Equal scores without a perfect timed result use stable username ordering.
  await write(a, "played-cards", 1, 8, 20_000, false);
  await write(b, "played-cards", 1, 8, 20_000, false);
  assert.deepEqual((await leaderboard(a, "played-cards")).map((entry) => entry.username), [a.username, b.username]);

  const anonymousResult = await anonymous.rpc("get_friends_training_leaderboard", { p_axis_id: "master-cards", p_level: 1 });
  assert.ok(anonymousResult.error, "anonymous leaderboard RPC should be refused");
  assert.match(anonymousResult.error.message, /permission|denied|not found|function/i);
  for (const query of [
    { p_axis_id: "master-cards", p_level: 0 },
    { p_axis_id: "", p_level: 1 },
    { p_axis_id: " ", p_level: 1 },
    { p_axis_id: "x".repeat(65), p_level: 1 },
  ]) {
    const { error } = await a.client.rpc("get_friends_training_leaderboard", query);
    assert.equal(error?.message, "invalid_training_leaderboard_query");
    assert.equal(error?.code, "P0001");
  }

  checked(await admin.from("friendships").delete().eq("user_low", ab.user_low).eq("user_high", ab.user_high), "remove friendship");
  assert.deepEqual((await leaderboard(a)).map((entry) => entry.username), [a.username, f.username]);

  // Actor + 49 friends with records + F = 51 eligible records, but only 50 rows.
  for (let index = 0; index < 49; index += 1) {
    const extra = await fixtureIdentity(`L${String(index).padStart(2, "0")}`);
    await friend(a, extra);
    await write(extra, "master-cards", 1, 1, 25_000);
  }
  const limited = await leaderboard(a);
  assert.equal(limited.length, 50);
  assert.deepEqual(limited.slice(0, 2).map((entry) => entry.username), [a.username, f.username]);
  assert.equal(limited.filter((entry) => entry.best_score === 1).length, 48);
  assert.ok(limited.every((entry) => ![b.username, d.username, e.username].includes(entry.username)));
  console.log("Friends leaderboard confidentiality, sorting, parameter and 51-to-50 cap tests passed with local Auth JWTs.");
}

async function run() {
  try {
    const a = await identity("A");
    const b = await identity("B");
    const first = await write(a, "trick-value", 1, 3, 25_000);
    assert.equal(first.series.score, 3);
    assert.equal(first.record.best_score, 3);
    assert.equal(first.record.best_duration_ms, null);
    const improved = await write(a, "trick-value", 1, 5, 26_000);
    assert.equal(improved.record.best_score, 5);
    assert.equal(improved.record.series_id, improved.series.id);
    const lower = await write(a, "trick-value", 1, 2, 20_000);
    assert.equal(lower.record.best_score, 5);
    assert.equal(lower.record.series_id, improved.series.id);
    const perfect = await write(a, "trick-value", 1, 10, 30_000);
    assert.equal(perfect.record.best_score, 10);
    assert.equal(perfect.record.best_duration_ms, 30_000);
    assert.equal(perfect.record.series_id, perfect.series.id);
    const slowerPerfect = await write(a, "trick-value", 1, 10, 40_000);
    assert.equal(slowerPerfect.record.best_duration_ms, 30_000);
    assert.equal(slowerPerfect.record.series_id, perfect.series.id);
    const fasterPerfect = await write(a, "trick-value", 1, 10, 15_000);
    assert.equal(fasterPerfect.record.best_duration_ms, 15_000);
    assert.equal(fasterPerfect.record.series_id, fasterPerfect.series.id);
    const untimedPerfect = await write(a, "trick-value", 1, 10, 1_000, false);
    assert.equal(untimedPerfect.record.best_duration_ms, 15_000);
    assert.equal(untimedPerfect.record.series_id, fasterPerfect.series.id);
    const bSeries = await write(b, "trick-value", 1, 7, 20_000);
    assert.equal(bSeries.record.best_score, 7);

    const ownSeries = checked(await a.client.from("training_series").select("id,user_id"), "A own series");
    assert.equal(ownSeries.length, 7);
    assert.ok(ownSeries.every((row) => row.user_id === a.id));
    const ownRecords = checked(await a.client.from("training_records").select("user_id,best_score"), "A own records");
    assert.deepEqual(ownRecords.map((row) => row.user_id), [a.id]);
    assert.equal(ownRecords[0].best_score, 10);
    assert.equal(checked(await a.client.from("training_series").select("id").eq("id", bSeries.series.id), "A cannot see B series").length, 0);
    assert.equal(checked(await a.client.from("training_records").select("user_id").eq("user_id", b.id), "A cannot see B record").length, 0);
    assert.equal(checked(await b.client.from("training_series").select("id").eq("id", first.series.id), "B cannot see A series").length, 0);
    assert.equal(checked(await b.client.from("training_records").select("user_id").eq("user_id", a.id), "B cannot see A record").length, 0);
    await denied(anonymous.from("training_series").select("id"), "anon series read");
    await denied(anonymous.from("training_records").select("user_id"), "anon record read");
    await denied(a.client.from("training_series").insert({ user_id: a.id, mode: "puzzle", axis_id: "trick-value" }), "direct series insert");
    await denied(a.client.from("training_series").update({ score: 999 }).eq("id", first.series.id), "direct series update");
    await denied(a.client.from("training_series").delete().eq("id", first.series.id), "direct series delete");
    await denied(a.client.from("training_records").insert({ user_id: a.id, axis_id: "trick-value", level: 2, best_score: 999 }), "direct record insert");
    await denied(a.client.from("training_records").update({ best_score: 999 }).eq("user_id", a.id), "direct record update");
    await denied(a.client.from("training_records").delete().eq("user_id", a.id), "direct record delete");
    await denied(a.client.rpc("record_verified_training_series", { p_user_id: a.id }), "client RPC execution");

    // Cross the quota with mixed levels; it is per user + axis, not per level.
    for (let index = 0; index < 51; index += 1) await write(a, "trick-value", index % 2 ? 1 : 2, 1, 25_000);
    const recent = checked(await admin.from("training_series").select("id,level").eq("user_id", a.id)
      .eq("axis_id", "trick-value"), "series after quota");
    assert.equal(recent.length, 50);
    assert.ok(recent.some((row) => row.level === 1) && recent.some((row) => row.level === 2));
    assert.equal(recent.some((row) => row.id === perfect.series.id), false);
    const record = checked(await admin.from("training_records").select("best_score,best_duration_ms,series_id")
      .eq("user_id", a.id).eq("axis_id", "trick-value").eq("level", 1).single(), "record after quota");
    assert.equal(record.best_score, 10);
    assert.equal(record.best_duration_ms, 15_000);
    assert.equal(record.series_id, null);
    assert.equal(checked(await admin.from("training_series").select("id").eq("user_id", b.id), "B quota isolation").length, 1);
    assert.equal(checked(await admin.from("training_records").select("best_score").eq("user_id", b.id).single(), "B record isolation").best_score, 7);
    await testFriendsLeaderboard(a, b);
    console.log("Training DB/RLS/atomic record/quota tests passed with two real Auth JWTs.");
  } finally {
    for (const user of users) checked(await admin.auth.admin.deleteUser(user.id), `delete ${user.id}`);
  }
}
await run();
