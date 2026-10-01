import type { Page } from "@playwright/test";
import { createSoloGame } from "../../app/solo/soloGameInitialization";
import { toPlayerGameView } from "../../engine/views";
import type { MultiplayerRoomView } from "../../lib/roomTypes";

// Browser-only presentation fixture. No real account, room or game is written.
export async function installMobileRoomFixture(page: Page) {
  const userId = "11111111-1111-4111-8111-111111111111";
  const roomId = "22222222-2222-4222-8222-222222222222";
  const createdAt = new Date().toISOString();
  const state = createSoloGame(() => .1);
  const user = { id: userId, aud: "authenticated", role: "authenticated", email: "mobile@example.test", created_at: createdAt, app_metadata: {}, user_metadata: { username: "Mobile fixture" } };
  const encoded = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const token = `${encoded({ alg: "HS256", typ: "JWT" })}.${encoded({ sub: userId, exp: Math.floor(Date.now() / 1000) + 3600, role: "authenticated" })}.fixture`;
  await page.routeWebSocket(/ws:\/\/127\.0\.0\.1:54321\//, (socket) => {
    socket.onMessage((message) => {
      const payload = JSON.parse(String(message));
      if (Array.isArray(payload)) {
        const [joinRef, ref, topic] = payload;
        socket.send(JSON.stringify([joinRef, ref, topic, "phx_reply", { status: "ok", response: {} }]));
      } else {
        socket.send(JSON.stringify({ topic: payload.topic, event: "phx_reply", ref: payload.ref, payload: { status: "ok", response: {} } }));
      }
    });
  });
  await page.addInitScript(({ user, token }) => localStorage.setItem("sb-127-auth-token", JSON.stringify({
    access_token: token, refresh_token: "fixture", token_type: "bearer", expires_at: Math.floor(Date.now() / 1000) + 3600, expires_in: 3600, user,
  })), { user, token });
  await page.route("http://127.0.0.1:54321/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    const data = path.endsWith("/auth/v1/user") ? user
      : path.endsWith("/profiles") ? [{ id: userId, username: "Mobile fixture" }]
      : path.endsWith("/get_my_progression") ? { total_xp: 0 }
      : path.endsWith("/get_my_rating_summary") ? { rating: 1000, rated_games: 0, wins: 0, losses: 0, forfeits: 0, peak_rating: 1000, is_ranked: false, pending_matches: 0 }
      : [];
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(data) });
  });
  await page.route("**/api/social**", async (route) => route.fulfill({ status: 200, json: { data: { friends: [], received: [], sent: [], invitations: [], counts: { friends: 0, received: 0, sent: 0, receivedPending: 0, sentPending: 0 } } } }));
  await page.route("**/api/training/duo/invitations", async (route) => route.fulfill({ status: 200, json: { data: [] } }));
  let playing = false;
  let roundFinished = false;
  const view = (): MultiplayerRoomView => ({
    room: { id: roomId, code: "MOBILE", status: playing ? "playing" : "lobby", scoring_mode: "ffb", target_score: 1000,
      ruleset_snapshot: state.settings.ruleset, game_phase: playing ? "bidding" : null, state_version: playing ? 2 : 1, turn_deadline_at: null,
      created_at: createdAt, updated_at: createdAt, started_at: null, finished_at: null },
    gameId: null, isHost: true, canClaimHost: false, viewerSeatIndex: 0,
    players: ([0, 1, 2, 3] as const).map((seat_index) => ({ seat_index, kind: "human", display_name: `Joueur ${seat_index + 1}`, is_ready: true,
      is_connected: true, bot_takeover: false, is_host: seat_index === 0, rating: null, rank: null, is_ranked: false })),
    game: playing ? toPlayerGameView(roundFinished ? { ...state, phase: "finished" } : state, 0) : null,
  });
  await page.route(`**/api/multiplayer/rooms/${roomId}**`, async (route) => route.fulfill({ status: 200, json: { data: view() } }));
  return { path: `/multiplayer/${roomId}`, start: () => { playing = true; }, finishRound: () => { roundFinished = true; } };
}
