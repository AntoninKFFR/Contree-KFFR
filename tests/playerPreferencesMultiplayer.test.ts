import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PlayerPreferencesProvider } from "@/components/settings/PlayerPreferencesProvider";
import { PlayerSettingsPanel } from "@/components/settings/PlayerSettingsPanel";
import { createInitialGame } from "@/engine/game";
import { CONTREE_KFFR_RULESET } from "@/engine/rulesets/presets";
import type { GameState } from "@/engine/types";
import { toPlayerGameView } from "@/engine/views";
import { createMultiplayerRoom } from "@/lib/multiplayerApi";
import { MULTIPLAYER_TURN_TIMEOUT_MS, turnDeadlineForState } from "@/lib/multiplayerTurnTimer";
import type { RoomPlayerRow } from "@/lib/roomTypes";
import { clonePlayerPreferences, loadPlayerPreferences, savePlayerPreferences, withGameSpeed, type PreferenceStorage } from "@/lib/preferences/playerPreferences";

class MemoryStorage implements PreferenceStorage {
  values = new Map<string, string>();
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
  removeItem(key: string) { this.values.delete(key); }
}

function playingState(): GameState {
  return { ...createInitialGame(() => 0), phase: "playing", currentPlayerId: 0, trump: "hearts", contractMode: { kind: "suit", suit: "hearts" }, contract: { kind: "points", value: 80, playerId: 0, teamId: 0, trump: "hearts", status: "normal" } };
}

const players: RoomPlayerRow[] = [0, 1, 2, 3].map((seat) => ({ id: `p${seat}`, room_id: "r", seat_index: seat as 0 | 1 | 2 | 3, kind: "human", user_id: `u${seat}`, bot_profile_id: null, display_name: `P${seat}`, is_ready: true, is_connected: true, bot_takeover: false, last_seen_at: null, joined_at: null, left_at: null, created_at: "", updated_at: "" }));

afterEach(() => vi.unstubAllGlobals());

describe("multiplayer preference isolation", () => {
  it("does not send preferences while creating a room", async () => { let body = ""; vi.stubGlobal("fetch", vi.fn(async (_url, init?: RequestInit) => { body = String(init?.body); return new Response(JSON.stringify({ data: {} }), { status: 200, headers: { "Content-Type": "application/json" } }); })); await createMultiplayerRoom({ displayName: "Antonin", rules: { presetId: "contree-kffr" } }, { access_token: "token" }); expect(body).not.toContain("preferences"); expect(body).toContain("rules"); });
  it("lets two clients retain different local preferences", () => { const antonin = new MemoryStorage(); const ben = new MemoryStorage(); savePlayerPreferences(antonin, withGameSpeed(clonePlayerPreferences(), "fast")); savePlayerPreferences(ben, withGameSpeed(clonePlayerPreferences(), "normal")); expect(loadPlayerPreferences(antonin).gameplay.gameSpeed).toBe("fast"); expect(loadPlayerPreferences(ben).gameplay.gameSpeed).toBe("normal"); });
  it("cannot influence a frozen Ruleset", () => { const before = JSON.stringify(CONTREE_KFFR_RULESET); const preferences = withGameSpeed(clonePlayerPreferences(), "instant"); preferences.assistance.disableIllegalCardClicks = false; expect(JSON.stringify(CONTREE_KFFR_RULESET)).toBe(before); expect("preferences" in CONTREE_KFFR_RULESET).toBe(false); });
  it("cannot influence authoritative server state", () => { const state = playingState(); const before = JSON.stringify(state); const preferences = withGameSpeed(clonePlayerPreferences(), "slow"); preferences.visual.animations = false; expect(JSON.stringify(state)).toBe(before); expect("preferences" in state).toBe(false); });
  it("leaves PlayerGameView unchanged and preference-free", () => { const state = playingState(); const before = toPlayerGameView(state, 0); const preferences = withGameSpeed(clonePlayerPreferences(), "fast"); preferences.cards.cardSize = "large"; const after = toPlayerGameView(state, 0); expect(after).toEqual(before); expect("preferences" in after).toBe(false); expect("gameSpeed" in after).toBe(false); });
  it("does not alter the authoritative turn deadline", () => { const state = playingState(); const slow = withGameSpeed(clonePlayerPreferences(), "slow"); const instant = withGameSpeed(clonePlayerPreferences(), "instant"); expect(slow.gameplay.botDelayMs).not.toBe(instant.gameplay.botDelayMs); const deadline = turnDeadlineForState(state, players, 1_000); expect(deadline).toBe(new Date(1_000 + MULTIPLAYER_TURN_TIMEOUT_MS).toISOString()); });
});

describe("shared settings screen", () => {
  it("separates local settings from game rules and exposes all sections", () => { vi.stubGlobal("React", React); const markup = renderToStaticMarkup(React.createElement(PlayerPreferencesProvider, null, React.createElement(PlayerSettingsPanel))); for (const section of ["JEU", "AIDES", "CARTES", "AFFICHAGE", "SON", "ACCESSIBILITÉ"]) expect(markup).toContain(section); expect(markup).toContain("ne modifie jamais les règles de la partie"); });
});
