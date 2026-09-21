// Run only against a disposable local Supabase started from this repository.
// Example: supabase start && supabase db reset && npm run test:db:social
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const url = process.env.SOCIAL_TEST_SUPABASE_URL;
const anonKey = process.env.SOCIAL_TEST_SUPABASE_ANON_KEY;
const serviceKey = process.env.SOCIAL_TEST_SUPABASE_SERVICE_ROLE_KEY;
if (!url || !anonKey || !serviceKey || !["localhost", "127.0.0.1", "::1"].includes(new URL(url).hostname)) {
  throw new Error("Social DB tests require local SOCIAL_TEST_SUPABASE_URL and local anon/service keys.");
}

const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
const anonymous = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
const suffix = randomUUID().slice(0, 8);
const identities = new Map();
const roomIds = [];

function checked(result, label) {
  if (result.error) throw new Error(`${label}: ${result.error.message}`);
  return result.data;
}

async function rpc(who, name, args = {}) {
  return checked(await who.client.rpc(name, args), name);
}

async function rejected(promise, pattern) {
  const { error } = await promise;
  assert.ok(error, `Expected rejection matching ${pattern}`);
  assert.match(error.message, pattern);
}

async function createIdentity(label) {
  const username = `Social${label}${suffix}`;
  const email = `social-${label}-${suffix}@example.test`;
  const password = `Local-${randomUUID()}-test`;
  const created = checked(await admin.auth.admin.createUser({
    email, password, email_confirm: true, user_metadata: { username },
  }), `create ${label}`);
  const client = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const who = { id: created.user.id, username, client };
  identities.set(label, who);
  checked(await client.auth.signInWithPassword({ email, password }), `sign in ${label}`);
  return who;
}

async function createRoom(host, second = null, status = "lobby", full = false) {
  const room = checked(await admin.from("rooms").insert({
    code: `S${suffix}${roomIds.length}`.toUpperCase(), host_user_id: host.id,
    status, scoring_mode: "announced-points", target_score: 1000,
  }).select("id").single(), "create room");
  roomIds.push(room.id);
  checked(await admin.from("room_players").insert([0, 1, 2, 3].map((seat) => ({
    room_id: room.id, seat_index: seat,
    kind: seat === 0 || (seat === 1 && second) ? "human" : full ? "bot" : "empty",
    user_id: seat === 0 ? host.id : seat === 1 ? second?.id ?? null : null,
    display_name: seat === 0 ? host.username : seat === 1 ? second?.username ?? null : null,
  }))), "create seats");
  return room.id;
}

async function befriend(a, b) {
  const request = await rpc(a, "send_friend_request", { p_recipient_id: b.id });
  assert.equal(request.status, "pending");
  assert.deepEqual(await rpc(b, "accept_friend_request", { p_request_id: request.id }), { status: "accepted" });
  return request;
}

async function run() {
  const people = [];
  for (const label of ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L"]) {
    people.push(await createIdentity(label));
  }
  const [a, b, c, d, e, f, g] = people;

  // JWTs from distinct local Auth sessions drive every client permission test.
  assert.equal((await rpc(a, "search_players_by_username", { p_prefix: b.username.slice(0, 7) })).some((p) => p.user_id === b.id), true);
  const boundedSearch = await rpc(a, "search_players_by_username", { p_prefix: "Soc" });
  assert.equal(boundedSearch.length, 10);
  assert.equal(boundedSearch.some((p) => p.user_id === a.id), false);
  assert.equal((await rpc(a, "search_players_by_username", { p_prefix: "Soc%" })).length, 0);
  await rejected(a.client.rpc("search_players_by_username", { p_prefix: "So" }), /invalid_prefix/);
  assert.equal(checked(await anonymous.rpc("is_username_taken", { p_username: b.username }), "signup username check"), true);
  assert.equal(checked(await anonymous.rpc("is_username_taken", { p_username: "x".repeat(41) }), "bounded username check"), false);
  const profileRows = checked(await a.client.from("profiles").select("id,username"), "read own profile");
  assert.deepEqual(profileRows.map((p) => p.id), [a.id]);
  await rejected(anonymous.rpc("search_players_by_username", { p_prefix: "Soc" }), /permission|denied|authentication|not found|function/i);
  await rejected(a.client.from("social_rate_limits").select("*"), /permission|denied/i);
  await rejected(a.client.from("friend_requests").insert({ requester_id: a.id, recipient_id: b.id }), /permission|denied/i);
  await rejected(a.client.from("friendships").insert({ user_low: a.id, user_high: b.id }), /permission|denied/i);

  const oppositeRequests = await Promise.all([
    f.client.rpc("send_friend_request", { p_recipient_id: g.id }),
    g.client.rpc("send_friend_request", { p_recipient_id: f.id }),
  ]);
  assert.deepEqual(oppositeRequests.map(({ data, error }) => error ? error.message : data.status).sort(), ["pending", "request_received"]);
  const firstRequester = oppositeRequests[0].data?.status === "pending" ? f : g;
  const pendingPair = checked(await admin.from("friend_requests").select("id").eq("status", "pending")
    .or(`requester_id.eq.${f.id},requester_id.eq.${g.id}`), "opposite request count");
  assert.equal(pendingPair.length, 1);
  await rpc(firstRequester, "cancel_friend_request", { p_request_id: pendingPair[0].id });

  const req = await rpc(a, "send_friend_request", { p_recipient_id: b.id });
  assert.equal(req.status, "pending");
  assert.equal((await rpc(a, "send_friend_request", { p_recipient_id: b.id })).id, req.id);
  assert.equal((await rpc(b, "send_friend_request", { p_recipient_id: a.id })).status, "request_received");
  assert.equal(checked(await c.client.from("friend_requests").select("id").eq("id", req.id), "third party requests").length, 0);
  await rejected(c.client.from("friend_requests").update({ status: "declined" }).eq("id", req.id), /permission|denied/i);
  await rejected(c.client.from("friend_requests").delete().eq("id", req.id), /permission|denied/i);
  await rejected(c.client.rpc("accept_friend_request", { p_request_id: req.id }), /request_not_found/);
  await rejected(a.client.rpc("send_friend_request", { p_recipient_id: a.id }), /invalid_recipient/);
  assert.deepEqual(await rpc(b, "accept_friend_request", { p_request_id: req.id }), { status: "accepted" });
  assert.deepEqual(await rpc(b, "accept_friend_request", { p_request_id: req.id }), { status: "accepted" });
  assert.equal(checked(await admin.from("friendships").select("user_low,user_high").or(`user_low.eq.${a.id},user_high.eq.${a.id}`), "friendship count").length, 1);
  assert.equal(JSON.stringify(await rpc(a, "get_my_social_snapshot")).includes("@example.test"), false);
  await rejected(a.client.from("friendships").delete().eq("user_low", a.id), /permission|denied/i);
  await rejected(a.client.from("friendships").update({ created_at: new Date().toISOString() }).eq("user_low", a.id), /permission|denied/i);

  const raceRequest = await rpc(people[7], "send_friend_request", { p_recipient_id: people[8].id });
  const competingDecisions = await Promise.all([
    people[8].client.rpc("accept_friend_request", { p_request_id: raceRequest.id }),
    people[8].client.rpc("decline_friend_request", { p_request_id: raceRequest.id }),
  ]);
  assert.equal(competingDecisions.filter(({ error }) => !error).length, 1);
  const decided = checked(await admin.from("friend_requests").select("status").eq("id", raceRequest.id).single(), "atomic decision").status;
  assert.ok(["accepted", "declined"].includes(decided));
  const pairFriendship = checked(await admin.from("friendships").select("user_low").eq("user_low", [people[7].id, people[8].id].sort()[0])
    .eq("user_high", [people[7].id, people[8].id].sort()[1]), "atomic friendship");
  assert.equal(pairFriendship.length, decided === "accepted" ? 1 : 0);

  const cooldown = await rpc(a, "send_friend_request", { p_recipient_id: d.id });
  await rpc(d, "decline_friend_request", { p_request_id: cooldown.id });
  await rejected(a.client.rpc("send_friend_request", { p_recipient_id: d.id }), /request_cooldown/);
  await befriend(c, b);
  await befriend(a, e);
  await rejected(a.client.from("game_invitations").insert({ room_id: randomUUID(), inviter_id: a.id, invitee_id: b.id }), /permission|denied/i);

  const room = await createRoom(a, c);
  await rejected(d.client.rpc("send_game_invitation", { p_room_id: room, p_invitee_id: b.id }), /room_unavailable/);
  await rejected(a.client.rpc("send_game_invitation", { p_room_id: room, p_invitee_id: f.id }), /not_friends/);
  const invitation = await rpc(a, "send_game_invitation", { p_room_id: room, p_invitee_id: b.id });
  assert.equal(invitation.status, "pending");
  assert.equal((await rpc(a, "send_game_invitation", { p_room_id: room, p_invitee_id: b.id })).id, invitation.id);
  assert.deepEqual(await rpc(c, "send_game_invitation", { p_room_id: room, p_invitee_id: b.id }), { status: "already_invited" });
  assert.equal(checked(await c.client.from("game_invitations").select("id").eq("id", invitation.id), "third party invitations").length, 0);
  await rejected(c.client.from("game_invitations").update({ status: "declined" }).eq("id", invitation.id), /permission|denied/i);
  await rejected(c.client.from("game_invitations").delete().eq("id", invitation.id), /permission|denied/i);
  assert.equal(JSON.stringify(await rpc(c, "get_my_game_invitations")).includes(invitation.id), false);
  assert.equal((await rpc(a, "list_invitable_friends", { p_room_id: room })).some((friend) => friend.user_id === e.id), true);
  const raceRoom = await createRoom(a, c);
  const competingInvites = await Promise.all([
    a.client.rpc("send_game_invitation", { p_room_id: raceRoom, p_invitee_id: b.id }),
    c.client.rpc("send_game_invitation", { p_room_id: raceRoom, p_invitee_id: b.id }),
  ]);
  assert.deepEqual(competingInvites.map(({ data, error }) => error ? error.message : data.status).sort(), ["already_invited", "pending"]);
  assert.equal(checked(await admin.from("game_invitations").select("id").eq("room_id", raceRoom).eq("invitee_id", b.id)
    .eq("status", "pending"), "competing invitations").length, 1);
  await rejected(c.client.rpc("resolve_game_invitation", { p_invitation_id: invitation.id }), /invitation_not_found/);
  await rejected(c.client.rpc("cancel_game_invitation", { p_invitation_id: invitation.id }), /invitation_not_found/);
  await rejected(a.client.rpc("decline_game_invitation", { p_invitation_id: invitation.id }), /invitation_not_found/);
  await rejected(b.client.rpc("accept_game_invitation", { p_invitation_id: invitation.id }), /seat_required/);
  assert.deepEqual(await rpc(b, "resolve_game_invitation", { p_invitation_id: invitation.id }), { state: "joinable", room_id: room });
  assert.equal(checked(await admin.from("room_players").select("id").eq("room_id", room).eq("user_id", b.id), "no seat created").length, 0);
  checked(await admin.from("room_players").update({ kind: "human", user_id: b.id, display_name: b.username }).eq("room_id", room).eq("seat_index", 2), "seat via room fixture");
  checked(await admin.from("rooms").update({ status: "playing" }).eq("id", room), "start room after invited player seated");
  assert.deepEqual(await rpc(b, "accept_game_invitation", { p_invitation_id: invitation.id }), { status: "accepted" });
  assert.deepEqual(await rpc(b, "accept_game_invitation", { p_invitation_id: invitation.id }), { status: "accepted" });

  const fullRoom = await createRoom(a, c, "lobby", true);
  await rejected(a.client.rpc("send_game_invitation", { p_room_id: fullRoom, p_invitee_id: e.id }), /room_unavailable/);
  const playingRoom = await createRoom(a, c, "playing");
  await rejected(a.client.rpc("send_game_invitation", { p_room_id: playingRoom, p_invitee_id: e.id }), /room_unavailable/);
  const startingRoom = await createRoom(a, c);
  const [sendWhileStarting, startResult] = await Promise.all([
    a.client.rpc("send_game_invitation", { p_room_id: startingRoom, p_invitee_id: e.id }),
    admin.from("rooms").update({ status: "playing" }).eq("id", startingRoom),
  ]);
  checked(startResult, "start room during invitation");
  if (sendWhileStarting.error) {
    assert.match(sendWhileStarting.error.message, /room_unavailable/);
  } else {
    assert.equal(sendWhileStarting.data.status, "pending");
    assert.deepEqual(await rpc(e, "resolve_game_invitation", { p_invitation_id: sendWhileStarting.data.id }), { state: "expired" });
  }
  const expiredRoom = await createRoom(a, c);
  const expiring = await rpc(a, "send_game_invitation", { p_room_id: expiredRoom, p_invitee_id: e.id });
  checked(await admin.from("game_invitations").update({ created_at: new Date(Date.now() - 3_600_000).toISOString(), expires_at: new Date(Date.now() - 1_800_000).toISOString() }).eq("id", expiring.id), "age invitation");
  assert.deepEqual(await rpc(e, "resolve_game_invitation", { p_invitation_id: expiring.id }), { state: "expired" });

  // Database constraints are checked directly under service_role, separately
  // from client permission denials.
  await rejected(admin.from("friend_requests").insert({ requester_id: a.id, recipient_id: a.id }), /friend_requests_distinct_users|check constraint/i);
  await rejected(admin.from("friend_requests").insert({ requester_id: a.id, recipient_id: randomUUID() }), /foreign key/i);
  await rejected(admin.from("friend_requests").insert({ requester_id: f.id, recipient_id: g.id, status: "accepted" }), /friend_requests_resolution|check constraint/i);
  const canonical = checked(await admin.from("friend_requests").insert({ requester_id: f.id, recipient_id: g.id }).select("id,created_at").single(), "canonical request");
  assert.ok(canonical.created_at);
  await rejected(admin.from("friend_requests").insert({ requester_id: g.id, recipient_id: f.id }), /friend_requests_one_pending_pair|duplicate key/i);
  checked(await admin.from("friend_requests").delete().eq("id", canonical.id), "delete canonical fixture");
  await rejected(admin.from("friendships").insert({ user_low: b.id, user_high: a.id }), /friendships_canonical_pair|duplicate key|check constraint/i);
  await rejected(admin.from("game_invitations").insert({ room_id: room, inviter_id: a.id, invitee_id: a.id }), /game_invitations_distinct_users|check constraint/i);

  const burstRoom = await createRoom(a, c);
  const burst = await rpc(a, "send_game_invitation", { p_room_id: burstRoom, p_invitee_id: e.id });
  await rpc(a, "cancel_game_invitation", { p_invitation_id: burst.id });
  await rejected(a.client.rpc("send_game_invitation", { p_room_id: burstRoom, p_invitee_id: e.id }), /rate_limited/);

  // SQL quota boundary (19 -> 20 -> rejected) without creating 21 accounts.
  const day = new Date(); day.setUTCHours(0, 0, 0, 0);
  checked(await admin.from("social_rate_limits").upsert({ actor_id: a.id, action: "friend_request_day", scope: "", window_start: day.toISOString(), count: 19 }), "seed friend quota");
  const quotaRequests = await Promise.all([
    a.client.rpc("send_friend_request", { p_recipient_id: f.id }),
    a.client.rpc("send_friend_request", { p_recipient_id: g.id }),
  ]);
  assert.equal(quotaRequests.filter(({ data }) => data?.status === "pending").length, 1);
  assert.equal(quotaRequests.filter(({ error }) => /rate_limited/.test(error?.message ?? "")).length, 1);
  const minute = new Date(); minute.setUTCSeconds(0, 0);
  checked(await admin.from("social_rate_limits").upsert({ actor_id: b.id, action: "search_minute", scope: "", window_start: minute.toISOString(), count: 10 }), "seed search quota");
  await rejected(b.client.rpc("search_players_by_username", { p_prefix: "Soc" }), /rate_limited/);
  checked(await admin.from("social_rate_limits").delete().eq("actor_id", b.id).eq("action", "search_minute"), "clear search minute quota");
  checked(await admin.from("social_rate_limits").upsert({ actor_id: b.id, action: "search_day", scope: "", window_start: day.toISOString(), count: 100 }), "seed search day quota");
  await rejected(b.client.rpc("search_players_by_username", { p_prefix: "Soc" }), /rate_limited/);
  const quotaRoom = await createRoom(a, c);
  checked(await admin.from("social_rate_limits").upsert({ actor_id: a.id, action: "invitation_day", scope: "", window_start: day.toISOString(), count: 19 }), "seed invitation quota");
  const quotaInvite = await rpc(a, "send_game_invitation", { p_room_id: quotaRoom, p_invitee_id: e.id });
  assert.equal(quotaInvite.status, "pending");
  await rejected(admin.from("game_invitations").insert({ room_id: quotaRoom, inviter_id: c.id, invitee_id: e.id }), /game_invitations_one_pending_room_invitee|duplicate key/i);
  const nextQuotaRoom = await createRoom(a, c);
  await rejected(a.client.rpc("send_game_invitation", { p_room_id: nextQuotaRoom, p_invitee_id: e.id }), /rate_limited/);
  await rpc(a, "remove_friend", { p_other_user_id: e.id });
  assert.equal(checked(await admin.from("game_invitations").select("status").eq("id", quotaInvite.id).single(), "friend removal cancellation").status, "cancelled");
  await rpc(a, "remove_friend", { p_other_user_id: b.id });
  assert.equal(checked(await admin.from("friendships").select("user_low").or(`user_low.eq.${a.id},user_high.eq.${a.id}`), "friendship removed").length, 0);
  console.log("Social DB/RLS: local JWT, RPC, privacy, constraints and quota checks passed.");
}

try {
  await run();
} finally {
  for (const roomId of roomIds) await admin.from("rooms").delete().eq("id", roomId);
  for (const who of identities.values()) await admin.auth.admin.deleteUser(who.id);
}
