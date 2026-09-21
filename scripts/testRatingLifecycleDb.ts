// Runs only against a disposable local Supabase. No remote URL is accepted.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { CONTREE_KFFR_RULESET } from "../engine/rulesets/presets";
import type { GameRulesetSnapshot } from "../engine/rulesets/types";
import { resolveBotRating } from "../lib/server/botRatings";
import { eloDelta, expectedScore } from "../lib/rating/formulaV1";

const url = process.env.RATING_TEST_SUPABASE_URL;
const anonKey = process.env.RATING_TEST_SUPABASE_ANON_KEY;
const serviceKey = process.env.RATING_TEST_SUPABASE_SERVICE_ROLE_KEY;
if (!url || !anonKey || !serviceKey
  || !["localhost", "127.0.0.1", "::1"].includes(new URL(url).hostname)) {
  throw new Error("Rating lifecycle DB tests require disposable local Supabase credentials.");
}
const admin = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const users: Array<{ id: string; client: SupabaseClient }> = [];
const rooms: string[] = [];
const games: string[] = [];
const suffix = randomUUID().slice(0, 8);

function checked<T>(result: { data: T; error: { message: string } | null }, label: string): NonNullable<T> {
  if (result.error) throw new Error(`${label}: ${result.error.message}`);
  if (result.data === null || result.data === undefined) throw new Error(`${label}: no data`);
  return result.data as NonNullable<T>;
}
async function identity(index: number) {
  const email = `rating-lifecycle-${index}-${suffix}@example.test`;
  const password = `Local-${randomUUID()}-test`;
  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email, password, email_confirm: true,
    user_metadata: { username: `RatingLife${index}${suffix}` },
  });
  if (createError || !created.user) throw new Error(`create user: ${createError?.message ?? "no user"}`);
  const client = createClient(url!, anonKey!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error: signInError } = await client.auth.signInWithPassword({ email, password });
  if (signInError) throw new Error(`sign in: ${signInError.message}`);
  users.push({ id: created.user.id, client });
}
function botConfig(players: Array<{ kind: string; seat_index: number; bot_profile_id: string | null }>) {
  return players.filter((seat) => seat.kind === "bot").map((seat) => {
    const bot = resolveBotRating(seat.bot_profile_id ?? undefined);
    return {
      seat_index: seat.seat_index, bot_profile_id: bot.botProfileId,
      bot_version: bot.botVersion, bot_rating_snapshot: bot.botRating,
    };
  });
}
async function fixture(humanSeats: number[], ruleset: GameRulesetSnapshot = CONTREE_KFFR_RULESET,
  checkAtomicStart = false) {
  const gameId = randomUUID();
  games.push(gameId);
  const room = checked(await admin.from("rooms").insert({
    code: `L${randomUUID().slice(0, 8)}`.toUpperCase(),
    host_user_id: users[humanSeats[0]].id, status: "lobby",
    scoring_mode: "ffb", target_score: ruleset.game.targetScore,
    ruleset_id: ruleset.id, ruleset_version: ruleset.version,
    ruleset_snapshot: ruleset,
  }).select("*").single(), "create room");
  rooms.push(room.id);
  const players = checked(await admin.from("room_players").insert(
    [0, 1, 2, 3].map((seat) => ({
      room_id: room.id, seat_index: seat,
      kind: humanSeats.includes(seat) ? "human" : "bot",
      user_id: humanSeats.includes(seat) ? users[seat].id : null,
      bot_profile_id: humanSeats.includes(seat) ? null : "advanced_rules_v4",
      display_name: humanSeats.includes(seat) ? `Human ${seat}` : `Bot ${seat}`,
      is_ready: true, is_connected: humanSeats.includes(seat),
      bot_takeover: false,
    })),
  ).select("*"), "create room seats");
  const startArgs = {
    p_room_id: room.id, p_expected_version: 0,
    p_state: { phase: "bidding", settings: { ruleset } },
    p_status: "playing", p_game_phase: "bidding", p_players: players,
    p_turn_deadline_at: null, p_host_user_id: null, p_update_host: false,
    p_active_game_id: gameId, p_update_active_game: true,
    p_archive_game: null, p_archive_players: null,
    p_official_ruleset: CONTREE_KFFR_RULESET,
    p_rating_bots: botConfig(players),
  };
  if (checkAtomicStart) {
    const failedStart = await admin.rpc("start_multiplayer_game", {
      ...startArgs, p_rating_bots: [],
    });
    assert.ok(failedStart.error);
    const stillLobby = checked(await admin.from("rooms").select("status,active_game_id")
      .eq("id", room.id).single(), "rolled back start");
    assert.equal(stillLobby.status, "lobby");
    assert.equal(stillLobby.active_game_id, null);
    assert.equal(checked(await admin.from("rating_start_snapshots").select("source_game_id")
      .eq("source_game_id", gameId), "rolled back snapshot").length, 0);
  }
  assert.equal(checked(await admin.rpc("start_multiplayer_game", startArgs), "start game"), true);
  const startedRoom = checked(await admin.from("rooms").select("*").eq("id", room.id).single(), "started room");
  assert.equal(startedRoom.status, "playing");
  assert.equal(startedRoom.active_game_id, gameId);
  assert.equal(checked(await admin.rpc("start_multiplayer_game", startArgs), "repeat start"), false);
  return { gameId, room: startedRoom, players, ruleset };
}
async function finish(f: Awaited<ReturnType<typeof fixture>>, winner: 0 | 1,
  forfeitingSeat: number | null = null, path: "ordinary" | "timer" | "takeover" = "ordinary") {
  const endReason = forfeitingSeat === null ? "score" : "forfeit";
  const archive = {
    id: f.gameId, room_id: f.room.id, started_at: f.room.started_at,
    finished_at: new Date(Date.now() + 1000).toISOString(),
    scoring_mode: "ffb", target_score: f.ruleset.game.targetScore,
    team_0_score: winner === 0 ? 1000 : 500,
    team_1_score: winner === 1 ? 1000 : 500,
    winner_team: winner, end_reason: endReason,
    forfeiting_team: forfeitingSeat === null ? null : forfeitingSeat % 2,
    forfeiting_seat_index: forfeitingSeat,
    round_count: 1, ruleset_id: f.ruleset.id,
    ruleset_version: f.ruleset.version, ruleset_snapshot: f.ruleset,
    round_history: [], player_names: {},
  };
  const archivePlayers = f.players.map((p) => ({
    game_id: f.gameId, seat_index: p.seat_index, kind: p.kind,
    user_id: p.user_id, display_name: p.display_name,
    bot_profile_id: p.bot_profile_id, team_id: p.seat_index % 2,
  }));
  if (path === "timer") {
    checked(await admin.from("rooms").update({
      turn_deadline_at: new Date(Date.now() - 1000).toISOString(),
    }).eq("id", f.room.id).select("id").single(), "expire timer");
  }
  const currentRoom = checked(await admin.from("rooms").select("state_version")
    .eq("id", f.room.id).single(), "current room version");
  const args = {
    p_room_id: f.room.id, p_expected_version: currentRoom.state_version,
    p_state: { phase: "game-over", settings: { ruleset: f.ruleset },
      winnerTeam: winner, endReason },
    p_status: "finished", p_game_phase: "game-over", p_players: null,
    p_turn_deadline_at: null, p_host_user_id: null, p_update_host: false,
    p_active_game_id: f.gameId, p_update_active_game: false,
    p_archive_game: archive, p_archive_players: archivePlayers,
  };
  const endpoint = path === "timer" ? "commit_timed_out_turn"
    : path === "takeover" ? "enable_bot_takeover" : "commit_room_state";
  const pathArgs = path === "ordinary" ? args : path === "timer" ? {
    p_room_id: args.p_room_id, p_expected_version: args.p_expected_version,
    p_state: args.p_state, p_status: args.p_status, p_game_phase: args.p_game_phase,
    p_turn_deadline_at: args.p_turn_deadline_at, p_active_game_id: args.p_active_game_id,
    p_archive_game: args.p_archive_game, p_archive_players: args.p_archive_players,
  } : {
    p_room_id: args.p_room_id, p_actor_user_id: users[0].id, p_seat_index: 0,
    p_expected_version: args.p_expected_version,
    p_offline_before: new Date().toISOString(),
    p_state: args.p_state, p_status: args.p_status, p_game_phase: args.p_game_phase,
    p_turn_deadline_at: args.p_turn_deadline_at, p_active_game_id: args.p_active_game_id,
    p_archive_game: args.p_archive_game, p_archive_players: args.p_archive_players,
  };
  assert.equal(checked(await admin.rpc(endpoint, pathArgs), "finish game"), true);
  assert.equal(checked(await admin.rpc(endpoint, pathArgs), "repeat finish"), false);
  const saved = checked(await admin.from("rooms").select("status").eq("id", f.room.id).single(), "finished room");
  assert.equal(saved.status, "finished");
  const game = checked(await admin.from("multiplayer_games").select("*").eq("id", f.gameId).single(), "archive");
  assert.equal(game.forfeiting_seat_index, forfeitingSeat);
  const archiveSeats = checked(await admin.from("multiplayer_game_players").select("seat_index").eq("game_id", f.gameId), "archive seats");
  assert.equal(archiveSeats.length, 4);
  const matches = checked(await admin.from("rating_matches").select("*").eq("source_game_id", f.gameId), "rating matches");
  const participants = matches.length
    ? checked(await admin.from("rating_match_participants").select("*").eq("match_id", matches[0].id), "rating participants")
    : [];
  if (matches.length) {
    assert.equal(matches[0].status, "pending");
    assert.equal(participants.length, 4);
  }
  return { matches, participants, archive, archivePlayers };
}
async function rating(id: string) {
  return checked(await admin.from("player_ratings").select("*").eq("user_id", id).single(), "rating");
}
async function setRating(id: string, value: number, gamesPlayed = 30) {
  checked(await admin.from("player_ratings").update({
    rating: value, peak_rating: Math.max(1000, value),
    rated_games: gamesPlayed, wins: gamesPlayed, losses: 0, forfeits: 0,
  }).eq("user_id", id).select("user_id").single(), "set test rating");
}
async function apply(gameId: string) {
  return checked(await admin.rpc("apply_rating_match", { p_source_game_id: gameId }), "apply rating");
}

try {
  for (const index of [0, 1, 2, 3]) await identity(index);
  const first = await fixture([0, 1, 2, 3]);
  for (const user of users) {
    const row = await rating(user.id);
    assert.deepEqual([row.rating, row.rated_games, row.wins, row.losses, row.peak_rating],
      [1000, 0, 0, 0, 1000]);
  }
  const start = checked(await admin.from("rating_start_snapshots")
    .select("*").eq("source_game_id", first.gameId).single(), "start snapshot");
  assert.equal(start.human_count, 4);
  assert.equal(start.reliability_factor, 1);
  const startSeats = checked(await admin.from("rating_start_snapshot_participants")
    .select("*").eq("source_game_id", first.gameId), "start seats");
  assert.equal(startSeats.length, 4);
  assert.ok(startSeats.every((s) => s.rating_snapshot === 1000 && s.k_factor_snapshot === 40));
  const firstEnd = await finish(first, 0);
  assert.equal(firstEnd.matches.length, 1);
  assert.equal(await apply(first.gameId), "applied");
  assert.equal(await apply(first.gameId), "already_applied");
  assert.deepEqual(await Promise.all(users.map(async (u) => (await rating(u.id)).rating)),
    [1020, 980, 1020, 980]);
  const firstLedger = checked(await admin.from("rating_match_participants")
    .select("*").eq("match_id", firstEnd.matches[0].id), "first ledger");
  assert.ok(firstLedger.every((s) => s.rating_before_apply + s.delta === s.rating_after_apply));
  assert.equal((await rating(users[0].id)).wins, 1);
  assert.equal((await rating(users[1].id)).losses, 1);
  assert.equal((await rating(users[0].id)).peak_rating, 1020);

  const rematchVersion = checked(await admin.from("rooms").select("state_version")
    .eq("id", first.room.id).single(), "rematch version").state_version;
  assert.equal(checked(await admin.rpc("rematch_room", {
    p_room_id: first.room.id, p_expected_version: rematchVersion,
    p_players: first.players.map((seat) => ({ ...seat, is_ready: true, bot_takeover: false })),
  }), "rematch lobby"), true);
  const rematchGameId = randomUUID();
  games.push(rematchGameId);
  const rematchLobby = checked(await admin.from("rooms").select("state_version,active_game_id")
    .eq("id", first.room.id).single(), "rematch lobby room");
  assert.equal(rematchLobby.active_game_id, null);
  const rematchPlayers = checked(await admin.from("room_players").select("*")
    .eq("room_id", first.room.id).order("seat_index"), "rematch seats");
  assert.equal(checked(await admin.rpc("start_multiplayer_game", {
    p_room_id: first.room.id, p_expected_version: rematchLobby.state_version,
    p_state: { phase: "bidding", settings: { ruleset: CONTREE_KFFR_RULESET } },
    p_status: "playing", p_game_phase: "bidding", p_players: rematchPlayers,
    p_turn_deadline_at: null, p_host_user_id: null, p_update_host: false,
    p_active_game_id: rematchGameId, p_update_active_game: true,
    p_archive_game: null, p_archive_players: null,
    p_official_ruleset: CONTREE_KFFR_RULESET, p_rating_bots: [],
  }), "rematch start"), true);
  assert.notEqual(rematchGameId, first.gameId);
  assert.equal(checked(await admin.from("rating_start_snapshots").select("source_game_id")
    .eq("source_game_id", rematchGameId), "rematch snapshot").length, 1);
  const rematchRoom = checked(await admin.from("rooms").select("*")
    .eq("id", first.room.id).single(), "rematch room");
  const rematchEnd = await finish({
    gameId: rematchGameId, room: rematchRoom, players: rematchPlayers,
    ruleset: CONTREE_KFFR_RULESET,
  }, 1);
  assert.equal(rematchEnd.matches.length, 1);
  assert.equal(await apply(rematchGameId), "applied");

  const three = await fixture([0, 1, 2]);
  assert.equal(checked(await admin.from("rating_start_snapshots").select("reliability_factor")
    .eq("source_game_id", three.gameId).single(), "three humans").reliability_factor, 0.95);
  await finish(three, 0);
  assert.equal(await apply(three.gameId), "applied");
  const opponents = await fixture([0, 1]);
  assert.equal(checked(await admin.from("rating_start_snapshots").select("reliability_factor")
    .eq("source_game_id", opponents.gameId).single(), "opposing humans").reliability_factor, 0.85);
  await finish(opponents, 0);
  assert.equal(await apply(opponents.gameId), "applied");
  const partners = await fixture([0, 2]);
  assert.equal(checked(await admin.from("rating_start_snapshots").select("reliability_factor")
    .eq("source_game_id", partners.gameId).single(), "partner humans").reliability_factor, 0.6);
  await finish(partners, 0);
  assert.equal(await apply(partners.gameId), "applied");

  const custom = { ...CONTREE_KFFR_RULESET, id: "custom", game: { targetScore: 1500 } };
  const unrated = await fixture([0, 1], custom);
  assert.equal(checked(await admin.from("rating_start_snapshots")
    .select("source_game_id").eq("source_game_id", unrated.gameId), "custom snapshot").length, 0);
  assert.equal((await finish(unrated, 0)).matches.length, 0);
  assert.equal(await apply(unrated.gameId), "not_found");

  for (const user of users) await setRating(user.id, 1000);
  const forfeit = await fixture([0, 1, 2, 3]);
  const forfeitStart = checked(await admin.from("rating_start_snapshot_participants")
    .select("k_factor_snapshot").eq("source_game_id", forfeit.gameId), "forfeit K");
  assert.ok(forfeitStart.every((s) => s.k_factor_snapshot === 32));
  const forfeitEnd = await finish(forfeit, 1, 0);
  assert.equal(forfeitEnd.matches[0].forfeiting_seat_index, 0);
  assert.equal(await apply(forfeit.gameId), "applied");
  const forfeitedLedger = checked(await admin.from("rating_match_participants")
    .select("*").eq("match_id", forfeitEnd.matches[0].id), "forfeit ledger");
  assert.deepEqual(forfeitedLedger.sort((a, b) => a.seat_index - b.seat_index).map((s) => s.delta),
    [-24, 16, -8, 16]);
  assert.equal((await rating(users[0].id)).forfeits, 1);
  assert.equal((await rating(users[2].id)).forfeits, 0);

  const oneHuman = await fixture([0], CONTREE_KFFR_RULESET, true);
  const botSnapshot = checked(await admin.from("rating_start_snapshot_participants")
    .select("*").eq("source_game_id", oneHuman.gameId), "bot snapshot");
  assert.equal(botSnapshot.filter((s) => s.kind === "bot").length, 3);
  assert.ok(botSnapshot.filter((s) => s.kind === "bot").every((s) =>
    s.bot_profile_id === "advanced_rules_v4"
    && s.bot_version === "advanced_rules_v4-calibration-v1"
    && s.bot_rating_snapshot === 1000));
  const oneEnd = await finish(oneHuman, 1, 0);
  assert.equal(oneEnd.matches[0].reliability_factor, 0.2);
  assert.equal(await apply(oneHuman.gameId), "applied");
  const oneLedger = checked(await admin.from("rating_match_participants")
    .select("*").eq("match_id", oneEnd.matches[0].id).eq("seat_index", 0).single(), "one human ledger");
  assert.equal(oneLedger.forfeited, true);
  const botSeatsByIndex = botSnapshot.sort((a, b) => a.seat_index - b.seat_index);
  const expectedOne = expectedScore(
    (botSeatsByIndex[0].rating_snapshot + botSeatsByIndex[2].rating_snapshot) / 2,
    (botSeatsByIndex[1].rating_snapshot + botSeatsByIndex[3].rating_snapshot) / 2,
  );
  assert.equal(oneLedger.delta, eloDelta({
    k: botSeatsByIndex[0].k_factor_snapshot, reliability: 0.2,
    result: 0, expected: expectedOne,
  }));

  const takeover = await fixture([0]);
  const takeoverEnd = await finish(takeover, 1, null, "takeover");
  assert.equal(takeoverEnd.matches.length, 1);
  assert.equal(takeoverEnd.participants.find((s) => s.seat_index === 0)?.kind, "human");
  assert.equal(takeoverEnd.matches[0].end_reason, "score");
  assert.equal(await apply(takeover.gameId), "applied");

  for (const user of users) await setRating(user.id, 5);
  const floor = await fixture([0, 1, 2, 3]);
  const floorEnd = await finish(floor, 1);
  assert.equal(await apply(floor.gameId), "applied");
  const floorLedger = checked(await admin.from("rating_match_participants")
    .select("*").eq("match_id", floorEnd.matches[0].id).eq("seat_index", 0).single(), "floor ledger");
  assert.deepEqual([floorLedger.rating_before_apply, floorLedger.delta, floorLedger.rating_after_apply],
    [5, -5, 0]);
  assert.equal((await rating(users[0].id)).rated_games, 31);

  await setRating(users[0].id, 1000);
  const pending = await fixture([0, 1, 2, 3]);
  const pendingEnd = await finish(pending, 0, null, "timer");
  checked(await admin.from("rating_match_participants").update({ result: 0 })
    .eq("match_id", pendingEnd.matches[0].id).eq("seat_index", 0).select("seat_index").single(), "corrupt result");
  const failed = await admin.rpc("apply_rating_match", { p_source_game_id: pending.gameId });
  assert.ok(failed.error);
  assert.equal((await rating(users[0].id)).rating, 1000);
  assert.equal(checked(await admin.from("rooms").select("status")
    .eq("id", pending.room.id).single(), "finished after failed apply").status, "finished");
  assert.equal(checked(await admin.from("rating_matches").select("status")
    .eq("source_game_id", pending.gameId).single(), "pending after failure").status, "pending");
  checked(await admin.from("rating_match_participants").update({ result: 1 })
    .eq("match_id", pendingEnd.matches[0].id).eq("seat_index", 0).select("seat_index").single(), "repair result");
  assert.equal(await apply(pending.gameId), "applied");

  const voided = await fixture([0]);
  const voidEnd = await finish(voided, 0);
  const beforeVoid = (await rating(users[0].id)).rating;
  checked(await admin.from("rating_matches").update({ status: "void" })
    .eq("id", voidEnd.matches[0].id).select("id").single(), "void match");
  assert.equal(await apply(voided.gameId), "void");
  assert.equal((await rating(users[0].id)).rating, beforeVoid);

  await setRating(users[0].id, 1000);
  const gameA = await fixture([0]);
  const gameB = await fixture([0]);
  const snapshots = await Promise.all([gameA, gameB].map(async (f) =>
    checked(await admin.from("rating_start_snapshot_participants").select("rating_snapshot")
      .eq("source_game_id", f.gameId).eq("seat_index", 0).single(), "concurrent snapshot").rating_snapshot));
  assert.deepEqual(snapshots, [1000, 1000]);
  await finish(gameA, 0);
  await finish(gameB, 0);
  assert.deepEqual(await Promise.all([apply(gameA.gameId), apply(gameB.gameId)]), ["applied", "applied"]);
  assert.equal((await rating(users[0].id)).rating, 1006);
  assert.equal(await apply(gameA.gameId), "already_applied");

  const unauthorized = await users[0].client.rpc("apply_rating_match", {
    p_source_game_id: gameA.gameId,
  });
  assert.ok(unauthorized.error);
  console.log("Rating lifecycle DB: start, finish, forfeit, floor, rollback, retry and concurrent apply passed.");
} finally {
  for (const gameId of games.reverse()) {
    await admin.from("rating_matches").delete().eq("source_game_id", gameId);
    await admin.from("rating_start_snapshots").delete().eq("source_game_id", gameId);
    await admin.from("multiplayer_games").delete().eq("id", gameId);
  }
  for (const roomId of rooms.reverse()) await admin.from("rooms").delete().eq("id", roomId);
  for (const user of users) await admin.auth.admin.deleteUser(user.id);
}
