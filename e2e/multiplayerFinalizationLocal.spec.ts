import { expect, test, type Page } from "@playwright/test";
import { createClient, type Session } from "@supabase/supabase-js";
import { getLegalCards } from "../engine/rules";
import { resolveContractMode } from "../engine/contractMode";
import { resolveGameRules } from "../engine/rulesets/resolve";
import type { MultiplayerRoomView, RoomIntent, RoomPlayerAction } from "../lib/roomTypes";
import { loginAs } from "./helpers/auth";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { OFFICIAL_BOT_PROFILE_ID } from "../bots/profiles";
const origin = "http://127.0.0.1:3100";
const enabled = process.env.FINALIZATION_LOCAL === "1";
test.skip(!enabled, "Requires explicit disposable loopback backend and test sessions");
const sessions = [1, 2, 3, 4].map((i) => JSON.parse(process.env[`FINALIZATION_SESSION_${i}`] ?? "null") as Session);
const admin = enabled ? createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false, autoRefreshToken: false } }) : null;
function localDb() { if (!admin) throw new Error("Local backend test not enabled"); return admin; }
async function call(path: string, user: number, body?: unknown): Promise<MultiplayerRoomView> {
  const response = await fetch(origin + path, { method: body ? "POST" : "GET", headers: { Authorization: `Bearer ${sessions[user].access_token}`, "Content-Type": "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}) });
  const wire = await response.json(); expect(response.status, wire.error).toBe(200); return wire.data;
}
const read = (id: string, user = 0) => call(`/api/multiplayer/rooms/${id}`, user);
const move = (room: MultiplayerRoomView, user: number, intent: RoomIntent) => call(`/api/multiplayer/rooms/${room.room.id}`, user, { expectedVersion: room.room.state_version, intent });
async function create(humans: number, target = 100) {
  let view = await call("/api/multiplayer/rooms", 0, { type: "create", rules: { presetId: "contree-kffr", overrides: { game: { targetScore: target } } } });
  for (let i = 1; i < humans; i++) view = await move(view, i, { type: "join-seat", seatIndex: i as 1 | 2 | 3 });
  view = await move(view, 0, { type: "update-room-presentation", settings: { gameSpeed: "instant", autoCollectTricks: true, trickDisplayMs: 0 } });
  for (let i = 0; i < humans; i++) view = await move(view, i, { type: "set-ready", ready: true });
  return move(view, 0, { type: "start-game" });
}
async function advance(view: MultiplayerRoomView) {
  const seat = view.players.find((p) => p.seat_index === view.game!.currentPlayerId)!;
  if (seat.kind === "bot") return call(`/api/multiplayer/rooms/${view.room.id}/tick`, 0, {});
  const user = view.game!.currentPlayerId;
  const own = await read(view.room.id, user), game = own.game!;
  const action: RoomPlayerAction = game.phase === "bidding"
    ? game.bids.some((bid) => bid.action !== "pass") ? { type: "pass" } : { type: "bid", value: 80, trump: "spades" }
    : { type: "play-card", card: getLegalCards(game.hand, game.currentTrick, game.viewerPlayerId, resolveContractMode(game)!, resolveGameRules(game.settings).cardPlay)[0] };
  return move(own, user, { type: "game-action", action });
}
async function playUntil(view: MultiplayerRoomView, finalThree = false) {
  for (let step = 0; step < 160; step++) {
    if (view.game!.phase === "game-over" || finalThree && view.game!.phase === "playing" && view.game!.completedTricks.length === 7 && view.game!.currentTrick.cards.length === 3) return view;
    view = view.game!.phase === "finished" ? await move(view, 0, { type: "next-round" }) : await advance(view);
  }
  throw new Error("Local authoritative game did not reach its expected end");
}
async function archive(id: string) {
  const results = await Promise.all([
    localDb().from("multiplayer_games").select("*").eq("id", id),
    localDb().from("multiplayer_game_players").select("*").eq("game_id", id).order("seat_index"),
    localDb().from("rating_matches").select("*").eq("source_game_id", id),
    localDb().from("progression_xp_events").select("*").eq("source_id", id).order("id"),
  ]);
  for (const result of results) expect(result.error).toBeNull();
  return results.map((r) => r.data);
}

for (const humans of [1, 2, 3, 4]) test(`real Next/Supabase rematch: ${humans} humans, official bots cleared, archive preserved, new game identity`, async () => {
  test.setTimeout(240000);
  let view = await playUntil(await create(humans));
  const gameId = view.gameId!, oldArchive = await archive(gameId), identity = { id: view.room.id, code: view.room.code, settings: view.room.presentation_settings };
  expect(oldArchive[0]).toHaveLength(1);
  const expired = new Date(Date.now() - 120000).toISOString();
  expect((await localDb().from("room_players").update({ is_connected: false, last_seen_at: expired }).eq("room_id", view.room.id).eq("user_id", sessions[0].user.id)).error).toBeNull();
  await call(`/api/multiplayer/rooms/${view.room.id}/presence`, 0, {}); // host reconnects
  if (humans > 1) expect((await localDb().from("room_players").update({ is_connected: false, last_seen_at: expired, bot_takeover: true }).eq("room_id", view.room.id).eq("user_id", sessions[humans - 1].user.id)).error).toBeNull();
  view = await read(view.room.id);
  const members = view.players.filter((p) => p.kind === "human").map((p) => [p.seat_index, p.display_name]);
  view = await move(view, 0, { type: "rematch" });
  expect({ id: view.room.id, code: view.room.code, settings: view.room.presentation_settings }).toEqual(identity);
  expect(view.room.status).toBe("lobby"); expect(view.gameId).toBeNull(); expect(view.game).toBeNull(); expect(view.isHost).toBe(true);
  expect(view.players.filter((p) => p.kind === "human").map((p) => [p.seat_index, p.display_name])).toEqual(members);
  expect(view.players.some((p) => p.kind === "bot" || p.bot_takeover || p.is_ready)).toBe(false);
  const vacant = view.players.filter((p) => p.kind === "empty"); expect(vacant).toHaveLength(4 - humans);
  for (const seat of vacant) expect(seat).toMatchObject({ display_name: null, is_connected: false });
  const seats = await localDb().from("room_players").select("*").eq("room_id", view.room.id);
  expect(seats.error).toBeNull();
  for (const seat of seats.data!.filter((p) => p.kind === "empty")) expect(seat).toMatchObject({ user_id: null, bot_profile_id: null, display_name: null, is_ready: false, is_connected: false, bot_takeover: false, joined_at: null, left_at: null, last_seen_at: null });
  expect(await archive(gameId)).toEqual(oldArchive);
  if (vacant.length) {
    view = await move(view, 0, { type: "join-seat", seatIndex: vacant[0].seat_index });
    expect(view.viewerSeatIndex).toBe(vacant[0].seat_index);
    view = await move(view, humans, { type: "join-seat", seatIndex: 0 }); // another real account finds the same code/room
    expect((await read(view.room.id, humans)).viewerSeatIndex).toBe(0);
  }
  for (let i = 0; i < Math.min(4, humans + 1); i++) { view = await read(view.room.id, i); view = await move(view, i, { type: "set-ready", ready: true }); }
  view = await read(view.room.id); view = await move(view, 0, { type: "start-game" });
  expect(view.gameId).not.toBe(gameId); expect(view.gameId).not.toBeNull();
  expect(view.players.filter((p) => p.kind === "empty")).toEqual([]);
  expect(view.players.filter((p) => p.kind === "bot")).toHaveLength(Math.max(0, 3 - humans));
  const bots = await localDb().from("room_players").select("bot_profile_id").eq("room_id", view.room.id).eq("kind", "bot");
  expect(bots.error).toBeNull(); expect(bots.data!.every((p) => p.bot_profile_id === OFFICIAL_BOT_PROFILE_ID)).toBe(true);
  expect(await archive(gameId)).toEqual(oldArchive);
});

async function installNative(page: Page, user: number) {
  await page.addInitScript((local) => Object.assign(globalThis, { __nativeLocalBackend: local }), { url: process.env.NEXT_PUBLIC_SUPABASE_URL!, key: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, session: sessions[user] });
  await page.route("https://contree-kffr.vercel.app/api/**", async (route) => {
    if (route.request().method() === "OPTIONS") { await route.fulfill({ status: 204, headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization,content-type", "Access-Control-Allow-Methods": "GET,POST,OPTIONS" } }); return; }
    const url = new URL(route.request().url());
    const response = await route.fetch({ url: origin + url.pathname + url.search });
    await route.fulfill({ response, headers: { ...response.headers(), "Access-Control-Allow-Origin": "*" } });
  });
}

async function observeFinalPresentation(page: Page, native: boolean) {
  await page.evaluate((native) => {
    const timeline = { fourAt: null as number | null, resultAt: null as number | null };
    Object.assign(globalThis, { __finalPresentationTimeline: timeline });
    const sample = () => {
      const cards = document.querySelectorAll(native ? '[data-testid^="solo-play-"]' : ".coinche-trick-card");
      const result = document.querySelector(native ? '[data-testid="solo-round-result"]' : '[aria-label="Résultat de la partie"]');
      if (cards.length === 4 && !result && timeline.fourAt === null) timeline.fourAt = performance.now();
      if (result) { timeline.resultAt = performance.now(); return; }
      requestAnimationFrame(sample);
    };
    sample();
  }, native);
}

for (const source of ["native", "web"] as const) test(`real HTTP + Realtime final card from ${source}: both clients see four confirmed cards before result`, async ({ browser }) => {
  test.setTimeout(180000);
  let view = await playUntil(await create(4), true);
  // Restore the actual table's shared reading preference before opening clients.
  view = await move(view, 0, { type: "update-room-presentation", settings: { gameSpeed: "custom", autoCollectTricks: true, trickDisplayMs: 1500 } });
  const actor = view.game!.currentPlayerId, nativeUser = source === "native" ? actor : actor === 0 ? 1 : 0, webUser = source === "web" ? actor : actor === 0 ? 1 : 0;
  const pc = await browser.newPage({ viewport: { width: 844, height: 390 } }), phone = await browser.newPage({ viewport: { width: 844, height: 390 } });
  try {
    await loginAs(pc, { email: process.env[`E2E_USER_${webUser + 1}_EMAIL`]!, password: process.env[`E2E_USER_${webUser + 1}_PASSWORD`]! });
    await pc.goto(`${origin}/multiplayer/${view.room.id}`);
    await installNative(phone, nativeUser); await phone.goto("http://127.0.0.1:8091/?screen=multiplayer&multi=live&motion=1");
    await phone.getByRole("button", { name: "Saisir un code", exact: true }).click();
    await phone.getByRole("textbox", { name: "Code de table" }).fill(view.room.code);
    await phone.getByRole("button", { name: "Rejoindre la table", exact: true }).click();
    await expect(pc.locator(".coinche-trick-card")).toHaveCount(3); await expect(phone.locator('[data-testid^="solo-play-"]')).toHaveCount(3);
    await observeFinalPresentation(pc, false); await observeFinalPresentation(phone, true);
    const sent: string[] = [];
    for (const page of [pc, phone]) page.on("request", (request) => { if (request.method() === "POST" && request.postData()?.includes('"play-card"')) sent.push(request.url()); });
    const actorPage = source === "native" ? phone : pc;
    const acknowledged = actorPage.waitForResponse((r) => r.request().method() === "POST" && r.request().postData()?.includes('"play-card"') === true && r.status() === 200);
    await (source === "native" ? phone.locator('[data-testid="solo-hand"] [role="button"]:not([aria-disabled="true"])').first() : pc.locator('.coinche-human-hand button[data-playable="true"]:not([disabled])').first()).click();
    await acknowledged;
    const finished = await read(view.room.id);
    expect(finished.room.status).toBe("finished"); expect(finished.game!.phase).toBe("game-over");
    expect(sent).toHaveLength(1);
    await expect(phone.getByTestId("solo-round-result")).toBeVisible(); await expect(pc.getByRole("region", { name: "Résultat de la partie", exact: true })).toBeVisible();
    // Clients can receive Realtime at different moments. Verify each local
    // sequence, rather than assuming their reading windows overlap globally.
    const timelines = await Promise.all([pc, phone].map((page) => page.evaluate(() => (globalThis as unknown as { __finalPresentationTimeline: { fourAt: number | null; resultAt: number | null } }).__finalPresentationTimeline)));
    for (const timeline of timelines) { expect(timeline.fourAt).not.toBeNull(); expect(timeline.resultAt! - timeline.fourAt!).toBeGreaterThanOrEqual(1400); }
    const evidence = process.env.FINAL_TRICK_CAPTURE_DIR ?? "test-results/final-trick";
    mkdirSync(evidence, { recursive: true }); writeFileSync(join(evidence, `real-local-${source}-timelines.json`), JSON.stringify(timelines, null, 2));
    const history = finished.game!.roundHistory.at(-1)!;
    expect(history.totalScoreAfterRound).toEqual(finished.game!.totalScore);
    const stored = (await archive(finished.gameId!))[0]![0] as { team_0_score: number; team_1_score: number };
    expect([stored.team_0_score, stored.team_1_score]).toEqual([finished.game!.totalScore[0], finished.game!.totalScore[1]]);
    const beforeReload = sent.length; await pc.reload(); await expect(pc.getByRole("region", { name: "Résultat de la partie", exact: true })).toBeVisible(); expect(sent).toHaveLength(beforeReload);
  } finally { await pc.close(); await phone.close(); }
});
