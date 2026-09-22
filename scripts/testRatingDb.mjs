// Run only against a disposable local Supabase: supabase start && supabase db reset --local.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const url = process.env.RATING_TEST_SUPABASE_URL;
const anonKey = process.env.RATING_TEST_SUPABASE_ANON_KEY;
const serviceKey = process.env.RATING_TEST_SUPABASE_SERVICE_ROLE_KEY;
if (!url || !anonKey || !serviceKey || !["localhost", "127.0.0.1", "::1"].includes(new URL(url).hostname)) {
  throw new Error("Rating DB tests require a local RATING_TEST_SUPABASE_URL and local anon/service keys.");
}

const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
const anonymous = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
const suffix = randomUUID().slice(0, 8);
const identities = [];
const roomIds = [];
const gameIds = [];

function checked(result, label) {
  if (result.error) throw new Error(`${label}: ${result.error.message}`);
  return result.data;
}

async function rejected(promise, pattern) {
  const { error } = await promise;
  assert.ok(error, `Expected rejection matching ${pattern}`);
  assert.match(error.message, pattern);
}

async function identity(label) {
  const email = `rating-${label}-${suffix}@example.test`;
  const password = `Local-${randomUUID()}-test`;
  const created = checked(await admin.auth.admin.createUser({
    email, password, email_confirm: true, user_metadata: { username: `Rating${label}${suffix}` },
  }), `create ${label}`);
  const client = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  checked(await client.auth.signInWithPassword({ email, password }), `sign in ${label}`);
  const who = { id: created.user.id, client };
  identities.push(who);
  return who;
}

const ruleSnapshot = { id: "contree-kffr", version: 1 };
const botVersion = "advanced_rules_v4-calibration-v1";

async function run() {
  const [a, b] = await Promise.all([identity("A"), identity("B")]);
  const tables = [
    ["player_ratings", "user_id", { rating: 1001 }],
    ["rating_start_snapshots", "source_game_id", { formula_version: 1 }],
    ["rating_start_snapshot_participants", "source_game_id", { rating_snapshot: 1001 }],
    ["rating_matches", "source_game_id", { status: "void" }],
    ["rating_match_participants", "match_id", { rating_snapshot: 1001 }],
  ];

  // Real Auth JWTs and anon must have no direct read or write route into Elo.
  for (const [table, key, update] of tables) {
    await rejected(a.client.from(table).select("*"), /permission|denied/i);
    await rejected(anonymous.from(table).select("*"), /permission|denied/i);
    await rejected(a.client.from(table).insert({}), /permission|denied/i);
    await rejected(anonymous.from(table).insert({}), /permission|denied/i);
    await rejected(a.client.from(table).update(update).eq(key, randomUUID()), /permission|denied/i);
    await rejected(anonymous.from(table).update(update).eq(key, randomUUID()), /permission|denied/i);
    await rejected(a.client.from(table).delete().eq(key, randomUUID()), /permission|denied/i);
    await rejected(anonymous.from(table).delete().eq(key, randomUUID()), /permission|denied/i);
  }
  const ownProfiles = checked(await a.client.from("profiles").select("id,username"), "own profile");
  assert.deepEqual(ownProfiles.map((p) => p.id), [a.id]);
  await rejected(anonymous.from("profiles").select("id"), /permission|denied/i);

  const initial = checked(await admin.from("player_ratings").insert({ user_id: a.id }).select("*").single(), "initial rating");
  assert.deepEqual(
    [initial.rating, initial.rated_games, initial.wins, initial.losses, initial.forfeits, initial.peak_rating],
    [1000, 0, 0, 0, 0, 1000],
  );
  checked(await admin.from("player_ratings").insert({ user_id: b.id }), "second rating");
  for (const change of [
    { rating: -1 }, { rated_games: -1 }, { wins: -1 }, { losses: -1 }, { forfeits: -1 },
    { rated_games: 1 }, { losses: 1 }, { forfeits: 1 }, { peak_rating: 999 },
  ]) {
    await rejected(admin.from("player_ratings").update(change).eq("user_id", a.id), /check constraint/i);
  }

  const room = checked(await admin.from("rooms").insert({
    code: `R${suffix}`.toUpperCase(), host_user_id: a.id,
    status: "finished", scoring_mode: "ffb", target_score: 1000,
  }).select("id").single(), "room fixture");
  roomIds.push(room.id);
  const gameId = randomUUID();
  gameIds.push(gameId);
  const startedAt = new Date(Date.now() - 60_000).toISOString();
  const completedAt = new Date().toISOString();
  const game = checked(await admin.from("multiplayer_games").insert({
    id: gameId, room_id: room.id, started_at: startedAt, finished_at: completedAt,
    scoring_mode: "ffb", target_score: 1000, team_0_score: 1000, team_1_score: 500,
    winner_team: 0, end_reason: "score", round_count: 1,
    ruleset_id: "contree-kffr", ruleset_version: 1, ruleset_snapshot: ruleSnapshot,
  }).select("id").single(), "archive fixture");
  assert.equal(game.id, gameId);
  checked(await admin.from("multiplayer_game_players").insert([
    { game_id: gameId, seat_index: 0, kind: "human", user_id: a.id, display_name: "Rating A", team_id: 0 },
    { game_id: gameId, seat_index: 1, kind: "human", user_id: b.id, display_name: "Rating B", team_id: 1 },
    { game_id: gameId, seat_index: 2, kind: "bot", display_name: "Bot", bot_profile_id: "advanced_rules_v4", team_id: 0 },
    { game_id: gameId, seat_index: 3, kind: "bot", display_name: "Bot", bot_profile_id: "advanced_rules_v4", team_id: 1 },
  ]), "archive players fixture");

  const start = {
    source_game_id: gameId, source_room_id: room.id, formula_version: 1,
    ruleset_id: "contree-kffr", ruleset_version: 1, ruleset_snapshot: ruleSnapshot,
    human_count: 2, reliability_factor: 0.85, started_at: startedAt,
  };
  checked(await admin.from("rating_start_snapshots").insert(start), "start snapshot");
  await rejected(admin.from("rating_start_snapshots").insert({ ...start, source_game_id: randomUUID(), reliability_factor: 0.95 }), /check constraint/i);
  const startSeats = [
    { source_game_id: gameId, seat_index: 0, team_id: 0, kind: "human", user_id: a.id, rating_snapshot: 1000, k_factor_snapshot: 40 },
    { source_game_id: gameId, seat_index: 1, team_id: 1, kind: "human", user_id: b.id, rating_snapshot: 1000, k_factor_snapshot: 40 },
    ...[2, 3].map((seat) => ({
      source_game_id: gameId, seat_index: seat, team_id: seat % 2, kind: "bot", rating_snapshot: 1000,
      bot_profile_id: "advanced_rules_v4", bot_version: botVersion, bot_rating_snapshot: 1000,
    })),
  ];
  checked(await admin.from("rating_start_snapshot_participants").insert(startSeats), "four start seats");
  await rejected(admin.from("rating_start_snapshot_participants").insert({ ...startSeats[0], seat_index: 4 }), /check constraint/i);
  await rejected(admin.from("rating_start_snapshot_participants").insert({ ...startSeats[0], team_id: 1 }), /check constraint/i);
  await rejected(admin.from("rating_start_snapshot_participants").insert({ ...startSeats[1], seat_index: 2, team_id: 0, user_id: a.id }), /duplicate key/i);
  await rejected(admin.from("rating_start_snapshot_participants").insert({ ...startSeats[2], seat_index: 0, team_id: 0, k_factor_snapshot: 40 }), /check constraint/i);

  const match = checked(await admin.from("rating_matches").insert({
    source_game_id: gameId, source_room_id: room.id, ruleset_id: "contree-kffr", ruleset_version: 1,
    ruleset_snapshot: ruleSnapshot, formula_version: 1, human_count: 2, reliability_factor: 0.85,
    winner_team: 0, end_reason: "score", status: "pending", started_at: startedAt, completed_at: completedAt,
  }).select("id,status").single(), "pending match");
  assert.equal(match.status, "pending");
  await rejected(admin.from("rating_matches").insert({
    source_game_id: gameId, ruleset_id: "contree-kffr", ruleset_version: 1,
    ruleset_snapshot: ruleSnapshot, human_count: 2, reliability_factor: 0.85,
    winner_team: 0, end_reason: "score", started_at: startedAt, completed_at: completedAt,
  }), /duplicate key/i);
  await rejected(admin.from("rating_matches").update({ status: "unknown" }).eq("id", match.id), /check constraint/i);
  await rejected(admin.from("rating_matches").update({ end_reason: "forfeit", forfeiting_seat_index: 0 }).eq("id", match.id), /check constraint/i);
  await rejected(admin.from("rating_matches").update({ status: "applied", processed_at: completedAt }).eq("id", match.id), /rating_match_incomplete/i);

  const matchSeats = startSeats.map((seat) => ({
    match_id: match.id, seat_index: seat.seat_index, team_id: seat.team_id,
    kind: seat.kind, user_id: seat.user_id ?? null, rating_snapshot: seat.rating_snapshot,
    k_factor_snapshot: seat.k_factor_snapshot ?? null,
    bot_profile_id: seat.bot_profile_id ?? null, bot_version: seat.bot_version ?? null,
    bot_rating_snapshot: seat.bot_rating_snapshot ?? null,
    result: seat.team_id === 0 ? 1 : 0,
  }));
  checked(await admin.from("rating_match_participants").insert(matchSeats), "four match seats");
  await rejected(admin.from("rating_match_participants").insert({ ...matchSeats[0], seat_index: 4 }), /check constraint/i);
  await rejected(admin.from("rating_match_participants").insert({ ...matchSeats[0], team_id: 1 }), /check constraint/i);
  await rejected(admin.from("rating_match_participants").insert({ ...matchSeats[0] }), /duplicate key/i);
  await rejected(admin.from("rating_match_participants").insert({ ...matchSeats[1], seat_index: 2, team_id: 0, user_id: a.id }), /duplicate key/i);
  await rejected(admin.from("rating_match_participants").insert({ ...matchSeats[2], seat_index: 0, team_id: 0, k_factor_snapshot: 40 }), /check constraint/i);
  await rejected(admin.from("rating_match_participants").update({ delta: 20 }).eq("match_id", match.id).eq("seat_index", 0), /check constraint/i);
  await rejected(admin.from("rating_match_participants").update({ forfeited: true }).eq("match_id", match.id).eq("seat_index", 2), /check constraint/i);

  // Account deletion removes the active rating and anonymizes Elo links, while
  // the other participant's archive and Elo ledger remain intact.
  checked(await admin.auth.admin.deleteUser(a.id), "delete test account");
  identities.splice(identities.findIndex((who) => who.id === a.id), 1);
  assert.equal(checked(await admin.from("player_ratings").select("user_id").eq("user_id", a.id), "deleted rating").length, 0);
  assert.equal(checked(await admin.from("rating_start_snapshot_participants").select("user_id").eq("source_game_id", gameId).eq("seat_index", 0).single(), "anonymized start").user_id, null);
  assert.equal(checked(await admin.from("rating_match_participants").select("user_id").eq("match_id", match.id).eq("seat_index", 0).single(), "anonymized ledger").user_id, null);
  assert.equal(checked(await admin.from("rating_match_participants").select("user_id").eq("match_id", match.id).eq("seat_index", 1).single(), "remaining player").user_id, b.id);
  assert.equal(checked(await admin.from("multiplayer_game_players").select("user_id").eq("game_id", gameId).eq("seat_index", 1).single(), "remaining archive").user_id, b.id);

  // Formula and rank tests are part of the same local validation command.
  execFileSync(process.execPath, ["node_modules/vitest/vitest.mjs", "run", "tests/ratingFormulaV1.test.ts"], { stdio: "inherit" });
  console.log("Rating DB/RLS: local JWT, schema, privacy, deletion and structural idempotence passed.");
}

try {
  await run();
} finally {
  for (const gameId of gameIds) {
    await admin.from("rating_matches").delete().eq("source_game_id", gameId);
    await admin.from("rating_start_snapshots").delete().eq("source_game_id", gameId);
    await admin.from("multiplayer_games").delete().eq("id", gameId);
  }
  for (const roomId of roomIds) await admin.from("rooms").delete().eq("id", roomId);
  for (const who of identities) await admin.auth.admin.deleteUser(who.id);
}
