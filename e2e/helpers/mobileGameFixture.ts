import type { Page } from "@playwright/test";
import { createInitialGame } from "../../engine/game";
import { applyGameAction, type GameAction } from "../../engine/actions";
import { createGameSettings } from "../../engine/rulesets/resolve";
import { buildCustomRuleset } from "../../engine/rulesets/custom";
import { toPlayerGameView } from "../../engine/views";
import type { GameState } from "../../engine/types";
import type { MultiplayerRoomView } from "../../lib/roomTypes";
import { installMobileRoomFixture } from "./mobileRoomFixture";
import { IPHONE_UA, simulatePwaEnvironment } from "./pwa";

export function mobileGameState(phase: "bidding" | "playing" = "bidding"): GameState {
  const ruleset = buildCustomRuleset({ presetId: "contree-kffr", overrides: { bidding: {
    allowNoTrump: true, allowAllTrump: true, allowGenerale: true,
    generaleAllowNoTrump: true, generaleAllowAllTrump: true,
  } } });
  const state = createInitialGame(() => .1, createGameSettings({ ruleset }));
  state.currentPlayerId = 0;
  state.phase = phase;
  state.playerNames = { 0: "A".repeat(40), 1: "B".repeat(40), 2: "C".repeat(40), 3: "D".repeat(40) };
  if (phase === "playing") {
    state.trump = "hearts";
    state.contractMode = { kind: "suit", suit: "hearts" };
    state.contract = { playerId: 0, teamId: 0, value: 90, trump: "hearts", status: "normal" };
  }
  return state;
}

/** Public projections through the real pages/components; no backend writes. */
export async function installMobileGameFixture(page: Page, initial = mobileGameState()) {
  await simulatePwaEnvironment(page, { ua: IPHONE_UA, standalone: "ios" });
  const base = await installMobileRoomFixture(page);
  const roomId = base.path.split("/").at(-1)!;
  const sessionId = "33333333-3333-4333-8333-333333333333";
  let state = initial;
  let version = 1;
  const intents: unknown[] = [];
  await page.addInitScript(({ userId, sessionId }) => localStorage.setItem(`kffr-solo-session:${userId}`, sessionId), { userId: base.user.id, sessionId });
  const room = (): MultiplayerRoomView => ({
    room: { id: roomId, code: "MOBILE", status: state.phase === "game-over" ? "finished" : "playing", scoring_mode: "ffb", target_score: 1000,
      ruleset_snapshot: state.settings.ruleset, game_phase: state.phase, state_version: version,
      turn_deadline_at: new Date(Date.now() + 9000).toISOString(), created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(), started_at: null, finished_at: null,
      presentation_settings: { gameSpeed: "slow", autoCollectTricks: false, trickDisplayMs: 1000 } },
    gameId: sessionId, isHost: true, canClaimHost: false, viewerSeatIndex: 0,
    players: ([0, 1, 2, 3] as const).map((seat_index) => ({ seat_index, kind: "human",
      display_name: state.playerNames![seat_index], is_ready: true, is_connected: seat_index !== 3,
      bot_takeover: seat_index === 3, is_host: seat_index === 0, rating: 1450, rank: "Sait jouer II", is_ranked: true })),
    game: toPlayerGameView(state, 0),
  });
  await page.route("**/api/solo/sessions**", async (route) => {
    const body = route.request().postDataJSON();
    if (body?.intent) {
      intents.push(body.intent);
      // Geometry interactions use the existing engine, and keep bot turns still.
      if (body.intent.type !== "advance-bot") { state = applyGameAction(state, body.intent as GameAction); version++; }
    }
    await route.fulfill({ status: 200, json: { data: { id: sessionId, version, state: toPlayerGameView(state, 0) } } });
  });
  await page.route(`**/api/multiplayer/rooms/${roomId}**`, async (route) => {
    const body = route.request().postDataJSON();
    if (body?.intent) {
      intents.push(body.intent);
      if (body.intent.type === "game-action") {
        state = applyGameAction(state, { ...body.intent.action, playerId: 0 } as GameAction); version++;
      }
    }
    await route.fulfill({ status: 200, json: { data: room() } });
  });
  return { path: base.path, intents, snapshot: () => ({ id: sessionId, version, state }), setState: (next: GameState) => { state = next; version++; } };
}
