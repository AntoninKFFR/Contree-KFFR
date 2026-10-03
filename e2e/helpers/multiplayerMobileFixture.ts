import type { Page } from "@playwright/test";
import { CONTREE_KFFR_RULESET } from "../../engine/rulesets/presets";
import type { MultiplayerRoomView, RoomIntent } from "../../lib/roomTypes";
import { installMobileNavigationFixture } from "./mobileNavigationFixture";

export const MULTIPLAYER_MOBILE_BASE = "2991d6fbcce9ba9c7a7bc5b1499d7e77b055d37b";
export const MULTIPLAYER_MOBILE_ROOM = "22222222-2222-4222-8222-222222222222";
export const LONG_MULTIPLAYER_NAME = "Joueur".repeat(6) + "Long";
export type LobbyScenario = {
  role?: "host" | "guest" | "spectator"; players?: 1 | 2 | 3 | 4; ready?: boolean;
  offline?: boolean; takeover?: boolean; bot?: boolean; code?: string;
};

export function mobileLobbyView({ role = "host", players = 1, ready = false, offline = false, takeover = false, bot = false, code = "LOBBY125" }: LobbyScenario = {}): MultiplayerRoomView {
  return {
    room: { id: MULTIPLAYER_MOBILE_ROOM, code, status: "lobby", scoring_mode: "ffb", target_score: 1000,
      ruleset_snapshot: CONTREE_KFFR_RULESET, game_phase: null, state_version: 1, turn_deadline_at: null,
      created_at: "2026-10-03T12:00:00Z", updated_at: "2026-10-03T12:00:00Z", started_at: null, finished_at: null },
    gameId: null, game: null, isHost: role === "host", canClaimHost: false,
    viewerSeatIndex: role === "spectator" ? null : role === "host" ? 0 : 1,
    players: ([0, 1, 2, 3] as const).map((seat_index) => ({ seat_index,
      kind: seat_index >= players ? "empty" : bot && seat_index === 3 ? "bot" : "human",
      display_name: seat_index >= players ? null : seat_index === 3 && bot ? "Bot" : LONG_MULTIPLAYER_NAME,
      is_ready: seat_index < players && (ready || seat_index === 1), is_connected: seat_index < players && !(offline && seat_index === 2),
      bot_takeover: takeover && seat_index === 2, is_host: seat_index === 0,
      rating: seat_index < players && seat_index !== 1 && !(bot && seat_index === 3) ? 1450 : null,
      rank: seat_index < players && seat_index !== 1 && !(bot && seat_index === 3) ? "Sait jouer II" : null,
      is_ranked: seat_index < players && seat_index !== 1 && !(bot && seat_index === 3),
    })),
  };
}

// UI-only endpoint interception. The authenticated Multiplayer/Rating and
// Social suites remain the independent evidence for server behavior.
export async function installMultiplayerMobileFixture(page: Page, options: LobbyScenario & {
  theme?: "dark" | "light"; authenticated?: boolean; missingUsername?: boolean; invitations?: boolean; loading?: boolean;
} = {}) {
  const fixture = await installMobileNavigationFixture(page, { theme: options.theme, authenticated: options.authenticated,
    username: LONG_MULTIPLAYER_NAME, notifications: false });
  let view = mobileLobbyView(options);
  const intents: RoomIntent[] = [];
  const landingActions: unknown[] = [];
  let roomReads = 0;
  let error: string | null = null;
  let blockedIntent: RoomIntent["type"] | null = null;
  let releaseIntent = () => {};
  let intentReady: Promise<void> = Promise.resolve();
  let releaseProfile = () => {};
  const profileReady = options.loading ? new Promise<void>((resolve) => { releaseProfile = resolve; }) : Promise.resolve();
  if (options.loading || options.missingUsername) {
    await page.addInitScript(() => {
      const saved = JSON.parse(localStorage.getItem("sb-127-auth-token")!);
      saved.user.user_metadata.username = "";
      localStorage.setItem("sb-127-auth-token", JSON.stringify(saved));
    });
    await page.route("http://127.0.0.1:54321/**", async (route) => {
      if (!new URL(route.request().url()).pathname.endsWith("/profiles")) { await route.fallback(); return; }
      await profileReady;
      await route.fulfill({ status: 200, json: [{ id: fixture.user.id, username: options.missingUsername ? null : LONG_MULTIPLAYER_NAME }], headers: {
        "Access-Control-Allow-Origin": route.request().headers().origin ?? "*",
        "Access-Control-Allow-Headers": route.request().headers()["access-control-request-headers"] ?? "*",
        "Access-Control-Allow-Methods": "GET, POST, PATCH, OPTIONS",
      } });
    });
  }
  await page.route("**/api/social/invitations", (route) => route.fulfill({ status: 200, json: { data: {
    invitations: options.invitations ? [{ id: "mobile-invitation", roomId: MULTIPLAYER_MOBILE_ROOM, roomCode: view.room.code,
      inviterId: "44444444-4444-4444-8444-444444444444", inviteeId: fixture.user.id, otherUsername: LONG_MULTIPLAYER_NAME,
      status: "pending", createdAt: "2026-10-03T12:00:00Z", expiresAt: "2099-10-03T12:00:00Z", resolvedAt: null }] : [],
    counts: { receivedPending: options.invitations ? 1 : 0, sentPending: 0 },
  } } }));
  await page.route("**/api/social/rooms/**/invitable-friends", (route) => route.fulfill({ status: 200, json: { data:
    Array.from({ length: 20 }, (_, index) => ({ userId: `44444444-4444-4444-8444-${String(index).padStart(12, "0")}`, username: index ? `Ami ${index}` : LONG_MULTIPLAYER_NAME })) } }));
  await page.route("**/api/multiplayer/rooms**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path === "/api/multiplayer/rooms") {
      landingActions.push(request.postDataJSON());
      await route.fulfill({ status: error ? 400 : 200, json: error ? { error } : { data: view } });
      return;
    }
    if (request.method() === "GET") roomReads++;
    const intent = request.method() === "POST" && request.postData() ? request.postDataJSON().intent as RoomIntent | undefined : undefined;
    if (intent) {
      intents.push(intent);
      if (intent.type === blockedIntent) await intentReady;
      // Only model presentation updates needed to exercise real UI callbacks.
      if (intent.type === "set-ready") view = { ...view, players: view.players.map((player) => player.seat_index === view.viewerSeatIndex ? { ...player, is_ready: intent.ready } : player) };
      if (intent.type === "join-seat") view = { ...view, viewerSeatIndex: intent.seatIndex, players: view.players.map((player) => player.seat_index === intent.seatIndex ? { ...player, kind: "human", display_name: LONG_MULTIPLAYER_NAME, is_connected: true } : player) };
      if (intent.type === "leave-seat") view = { ...view, viewerSeatIndex: null };
      if (intent.type === "transfer-host") view = { ...view, isHost: false, players: view.players.map((player) => ({ ...player, is_host: player.seat_index === intent.targetSeatIndex })) };
      view = { ...view, room: { ...view.room, state_version: view.room.state_version + 1 } };
    }
    await route.fulfill({ status: 200, json: { data: view } });
  });
  return { path: `/multiplayer/${MULTIPLAYER_MOBILE_ROOM}`, view: () => structuredClone(view), intents, landingActions,
    reads: () => roomReads, releaseProfile, failLanding: (message: string) => { error = message; },
    block: (type: RoomIntent["type"]) => { blockedIntent = type; intentReady = new Promise<void>((resolve) => { releaseIntent = resolve; }); },
    release: () => { blockedIntent = null; releaseIntent(); },
  };
}
