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
  const email = `training-${label}-${suffix}@example.test`;
  const password = `Local-${randomUUID()}-test`;
  const created = checked(await admin.auth.admin.createUser({ email, password, email_confirm: true,
    user_metadata: { username: `Training${label}${suffix}` } }), `create ${label}`);
  const client = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  checked(await client.auth.signInWithPassword({ email, password }), `sign in ${label}`);
  const who = { id: created.user.id, client };
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
    console.log("Training DB/RLS/atomic record/quota tests passed with two real Auth JWTs.");
  } finally {
    for (const user of users) checked(await admin.auth.admin.deleteUser(user.id), `delete ${user.id}`);
  }
}
await run();
