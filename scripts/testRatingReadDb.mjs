// Run only against a disposable local Supabase: supabase start && supabase db reset --local.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const url = process.env.RATING_TEST_SUPABASE_URL;
const anonKey = process.env.RATING_TEST_SUPABASE_ANON_KEY;
const serviceKey = process.env.RATING_TEST_SUPABASE_SERVICE_ROLE_KEY;
if (!url || !anonKey || !serviceKey || !["localhost", "127.0.0.1", "::1"].includes(new URL(url).hostname)) {
  throw new Error("Rating read DB tests require local Supabase URL and keys.");
}

const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
const anonymous = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
const suffix = randomUUID().replaceAll("-", "").slice(0, 8);
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
  const email = `rating-read-${label}-${suffix}@example.test`;
  const password = `Local-${randomUUID()}-test`;
  const username = `Read${label}${suffix}`;
  const created = checked(await admin.auth.admin.createUser({
    email, password, email_confirm: true, user_metadata: { username },
  }), `create ${label}`);
  const client = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  checked(await client.auth.signInWithPassword({ email, password }), `sign in ${label}`);
  const who = { id: created.user.id, username, client };
  identities.push(who);
  return who;
}

async function summary(who) {
  return checked(await who.client.rpc("get_my_rating_summary"), `summary ${who.username}`);
}

async function leaderboard(who, args = undefined) {
  return checked(await who.client.rpc("get_rating_leaderboard", args), `leaderboard ${who.username}`);
}

async function createPendingMatch(who) {
  const room = checked(await admin.from("rooms").insert({
    code: `Q${suffix.slice(0, 5)}`.toUpperCase(), host_user_id: who.id,
    status: "finished", scoring_mode: "ffb", target_score: 1000,
  }).select("id").single(), "read-test room");
  roomIds.push(room.id);
  const gameId = randomUUID();
  gameIds.push(gameId);
  const startedAt = new Date(Date.now() - 60_000).toISOString();
  const completedAt = new Date().toISOString();
  const ruleset = { id: "contree-kffr", version: 1 };
  checked(await admin.from("multiplayer_games").insert({
    id: gameId, room_id: room.id, started_at: startedAt, finished_at: completedAt,
    scoring_mode: "ffb", target_score: 1000, team_0_score: 1000, team_1_score: 500,
    winner_team: 0, end_reason: "score", round_count: 1,
    ruleset_id: "contree-kffr", ruleset_version: 1, ruleset_snapshot: ruleset,
  }), "read-test archive");
  checked(await admin.from("rating_start_snapshots").insert({
    source_game_id: gameId, source_room_id: room.id, formula_version: 1,
    ruleset_id: "contree-kffr", ruleset_version: 1, ruleset_snapshot: ruleset,
    human_count: 1, reliability_factor: 0.20, started_at: startedAt,
  }), "read-test snapshot");
  const bot = (seat) => ({
    source_game_id: gameId, seat_index: seat, team_id: seat % 2, kind: "bot",
    rating_snapshot: 1000, bot_profile_id: "advanced_rules_v4",
    bot_version: "advanced_rules_v4-calibration-v1", bot_rating_snapshot: 1000,
  });
  const startSeats = [
    { source_game_id: gameId, seat_index: 0, team_id: 0, kind: "human", user_id: who.id,
      rating_snapshot: 1000, k_factor_snapshot: 40 },
    bot(1), bot(2), bot(3),
  ];
  checked(await admin.from("rating_start_snapshot_participants").insert(startSeats), "read-test snapshot seats");
  const match = checked(await admin.from("rating_matches").insert({
    source_game_id: gameId, source_room_id: room.id, ruleset_id: "contree-kffr",
    ruleset_version: 1, ruleset_snapshot: ruleset, formula_version: 1,
    human_count: 1, reliability_factor: 0.20, winner_team: 0, end_reason: "score",
    status: "pending", started_at: startedAt, completed_at: completedAt,
  }).select("id").single(), "read-test pending match");
  checked(await admin.from("rating_match_participants").insert(startSeats.map((seat) => ({
    match_id: match.id, seat_index: seat.seat_index, team_id: seat.team_id, kind: seat.kind,
    user_id: seat.user_id ?? null, rating_snapshot: seat.rating_snapshot,
    k_factor_snapshot: seat.k_factor_snapshot ?? null,
    bot_profile_id: seat.bot_profile_id ?? null, bot_version: seat.bot_version ?? null,
    bot_rating_snapshot: seat.bot_rating_snapshot ?? null, result: seat.team_id === 0 ? 1 : 0,
  }))), "read-test match seats");
  return match.id;
}

async function run() {
  const [a, b, c, d, placement, fresh] = await Promise.all(
    ["A", "B", "C", "D", "Placement", "Fresh"].map(identity),
  );

  // No row produces a read-only virtual initial state.
  assert.deepEqual(await summary(fresh), {
    rating: 1000, rated_games: 0, wins: 0, losses: 0, forfeits: 0, peak_rating: 1000,
    rank: null, position: null, placement_games: 0, is_ranked: false, pending_matches: 0,
  });
  assert.equal(checked(await admin.from("player_ratings").select("user_id").eq("user_id", fresh.id), "no implicit insert").length, 0);

  checked(await admin.from("player_ratings").insert([
    { user_id: a.id, rating: 1500, rated_games: 5, wins: 3, losses: 2, peak_rating: 1500 },
    { user_id: b.id, rating: 1500, rated_games: 5, wins: 4, losses: 1, peak_rating: 1500 },
    { user_id: c.id, rating: 1490, rated_games: 5, wins: 3, losses: 2, peak_rating: 1490 },
    { user_id: d.id, rating: 1300, rated_games: 5, wins: 2, losses: 3, peak_rating: 1300 },
    { user_id: placement.id, rating: 1020, rated_games: 1, wins: 1, losses: 0, peak_rating: 1020 },
  ]), "leaderboard ratings");

  let placementSummary = await summary(placement);
  assert.deepEqual([placementSummary.rated_games, placementSummary.placement_games, placementSummary.is_ranked,
    placementSummary.rank, placementSummary.position], [1, 1, false, null, null]);
  checked(await admin.from("player_ratings").update({
    rating: 1030, rated_games: 4, wins: 3, losses: 1, peak_rating: 1030,
  }).eq("user_id", placement.id), "four placements");
  placementSummary = await summary(placement);
  assert.deepEqual([placementSummary.rated_games, placementSummary.placement_games, placementSummary.is_ranked,
    placementSummary.rank, placementSummary.position], [4, 4, false, null, null]);

  const board = await leaderboard(a);
  assert.equal(board.length, 4);
  assert.ok(!board.some((entry) => entry.username === placement.username));
  assert.deepEqual(board.map((entry) => entry.position), [1, 1, 2, 3]);
  assert.deepEqual(board.map((entry) => entry.rating), [1500, 1500, 1490, 1300]);
  for (const entry of board) {
    assert.deepEqual(Object.keys(entry).sort(), ["position", "rank", "rating", "username"]);
    assert.ok(!("user_id" in entry) && !("email" in entry));
  }
  const tiedExpected = [a, b].sort((left, right) => left.id.localeCompare(right.id)).map((who) => who.username);
  assert.deepEqual(board.slice(0, 2).map((entry) => entry.username), tiedExpected);
  assert.deepEqual((await leaderboard(a, { p_limit: 2, p_offset: 1 })).map((entry) => entry.username), board.slice(1, 3).map((entry) => entry.username));
  assert.equal((await leaderboard(a, { p_limit: 100, p_offset: 0 })).length, 4);
  await rejected(a.client.rpc("get_rating_leaderboard", { p_limit: 101, p_offset: 0 }), /invalid_pagination/i);
  await rejected(a.client.rpc("get_rating_leaderboard", { p_limit: 10, p_offset: -1 }), /invalid_pagination/i);

  const dSummary = await summary(d);
  assert.deepEqual([dSummary.rating, dSummary.rank, dSummary.position], [1300, "Sait jouer V", 3]);
  assert.ok(!(await leaderboard(d, { p_limit: 1, p_offset: 0 })).some((entry) => entry.username === d.username));

  // profiles remains private even though the leaderboard can project usernames.
  const ownProfiles = checked(await a.client.from("profiles").select("id,username"), "own profiles only");
  assert.deepEqual(ownProfiles.map((profile) => profile.id), [a.id]);
  await rejected(anonymous.from("profiles").select("id,username"), /permission|denied/i);
  await rejected(anonymous.rpc("get_my_rating_summary"), /permission|authentication|schema cache/i);
  await rejected(anonymous.rpc("get_rating_leaderboard"), /permission|authentication|schema cache/i);
  await rejected(a.client.rpc("apply_rating_match", { p_match_id: randomUUID() }), /permission|denied|schema cache/i);
  await rejected(a.client.from("player_ratings").select("*"), /permission|denied/i);
  await rejected(a.client.from("player_ratings").update({ rating: 9999 }).eq("user_id", a.id), /permission|denied/i);

  // Pending counts are scoped to the authenticated human participant and stop
  // counting once the match has already been applied.
  const pendingMatchId = await createPendingMatch(fresh);
  assert.equal((await summary(fresh)).pending_matches, 1);
  assert.equal((await summary(a)).pending_matches, 0);
  checked(await admin.from("rating_matches").update({
    status: "applied", processed_at: new Date().toISOString(),
  }).eq("id", pendingMatchId), "mark read-test match applied");
  assert.equal((await summary(fresh)).pending_matches, 0);

  checked(await admin.from("player_ratings").update({
    rating: 1040, rated_games: 5, wins: 4, losses: 1, peak_rating: 1040,
  }).eq("user_id", placement.id), "complete placements");
  placementSummary = await summary(placement);
  assert.deepEqual([placementSummary.placement_games, placementSummary.is_ranked,
    placementSummary.rank, placementSummary.position], [5, true, "Débutant I", 4]);
  assert.ok((await leaderboard(a)).some((entry) => entry.username === placement.username));

  checked(await admin.auth.admin.deleteUser(d.id), "delete ranked account");
  identities.splice(identities.findIndex((who) => who.id === d.id), 1);
  assert.ok(!(await leaderboard(a)).some((entry) => entry.username === d.username));
}

try {
  await run();
  console.log("Rating read RPCs: local privacy, projections, placements and pagination passed.");
} finally {
  for (const gameId of gameIds) {
    await admin.from("rating_matches").delete().eq("source_game_id", gameId);
    await admin.from("rating_start_snapshots").delete().eq("source_game_id", gameId);
    await admin.from("multiplayer_games").delete().eq("id", gameId);
  }
  for (const roomId of roomIds) await admin.from("rooms").delete().eq("id", roomId);
  for (const who of identities) await admin.auth.admin.deleteUser(who.id);
}
