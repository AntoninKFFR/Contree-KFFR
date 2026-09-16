import { readFileSync } from "node:fs";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PlayerPreferencesProvider } from "@/components/settings/PlayerPreferencesProvider";
import { PlayerSettingsPanel } from "@/components/settings/PlayerSettingsPanel";
import {
  DEFAULT_MULTIPLAYER_TABLE_PREFERENCES,
  isMultiplayerTablePreferences,
  normalizeMultiplayerTablePreferences,
  withMultiplayerTableSpeed,
} from "@/lib/multiplayerTablePreferences";
import { GAME_SPEED_PRESETS } from "@/lib/preferences/playerPreferences";
import type { RoomPlayerRow, RoomRow } from "@/lib/roomTypes";
import { prepareRoomPresentationUpdate } from "@/lib/server/multiplayerGame";
import { parseRoomIntent } from "@/lib/server/roomIntentValidation";

vi.mock("server-only", () => ({}));
afterEach(() => vi.unstubAllGlobals());

function room(hostUserId = "user-0"): RoomRow {
  return {
    id: "room", code: "ABC123", status: "playing", host_user_id: hostUserId,
    active_game_id: "game", scoring_mode: "ffb", target_score: 1_000,
    game_phase: "playing", state_version: 4, turn_deadline_at: null,
    created_at: "", updated_at: "", started_at: "", finished_at: null,
  };
}

function players(): RoomPlayerRow[] {
  return [0, 1, 2, 3].map((seat) => ({
    id: `p${seat}`, room_id: "room", seat_index: seat as 0 | 1 | 2 | 3,
    kind: "human", user_id: `user-${seat}`, bot_profile_id: null,
    display_name: `P${seat}`, is_ready: seat !== 2, is_connected: true,
    bot_takeover: false, last_seen_at: null, joined_at: null, left_at: null,
    created_at: "", updated_at: "",
  }));
}

function settingsMarkup(context?: React.ComponentProps<typeof PlayerSettingsPanel>["context"]): string {
  vi.stubGlobal("React", React);
  return renderToStaticMarkup(React.createElement(
    PlayerPreferencesProvider,
    null,
    React.createElement(PlayerSettingsPanel, context ? { context } : undefined),
  ));
}

describe("shared multiplayer table pacing", () => {
  it("uses the central Slow preset for new tables", () => {
    expect(DEFAULT_MULTIPLAYER_TABLE_PREFERENCES).toEqual({
      gameSpeed: "slow", autoCollectTricks: true,
      trickDisplayMs: GAME_SPEED_PRESETS.slow.trickDisplayMs,
    });
    expect(withMultiplayerTableSpeed({ ...DEFAULT_MULTIPLAYER_TABLE_PREFERENCES }, "fast").trickDisplayMs)
      .toBe(GAME_SPEED_PRESETS.fast.trickDisplayMs);
    expect(withMultiplayerTableSpeed({ ...DEFAULT_MULTIPLAYER_TABLE_PREFERENCES }, "normal").trickDisplayMs)
      .toBe(GAME_SPEED_PRESETS.normal.trickDisplayMs);
    expect(normalizeMultiplayerTablePreferences(null)).toEqual(DEFAULT_MULTIPLAYER_TABLE_PREFERENCES);
    expect(normalizeMultiplayerTablePreferences({ gameSpeed: "normal", autoCollectTricks: true, trickDisplayMs: 1_200 }))
      .toEqual({ gameSpeed: "normal", autoCollectTricks: true, trickDisplayMs: 1_200 });
  });

  it("strictly validates the public intent payload", () => {
    const settings = { ...DEFAULT_MULTIPLAYER_TABLE_PREFERENCES, autoCollectTricks: false };
    expect(parseRoomIntent({ type: "update-room-presentation", settings, user_id: "forged" }))
      .toEqual({ type: "update-room-presentation", settings });
    expect(isMultiplayerTablePreferences({ ...settings, user_id: "secret" })).toBe(false);
    expect(() => parseRoomIntent({ type: "update-room-presentation", settings: { ...settings, trickDisplayMs: 9_999 } }))
      .toThrow("invalide");
  });

  it("allows only the current host and transfers that right immediately", () => {
    const settings = { ...DEFAULT_MULTIPLAYER_TABLE_PREFERENCES, autoCollectTricks: false };
    expect(() => prepareRoomPresentationUpdate({ room: room(), players: players(), userId: "user-1", settings }))
      .toThrow("hôte");
    expect(prepareRoomPresentationUpdate({ room: room(), players: players(), userId: "user-0", settings }))
      .toEqual(settings);

    const transferred = room("user-1");
    expect(() => prepareRoomPresentationUpdate({ room: transferred, players: players(), userId: "user-0", settings }))
      .toThrow("hôte");
    expect(prepareRoomPresentationUpdate({ room: transferred, players: players(), userId: "user-1", settings }))
      .toEqual(settings);
  });

  it("does not mutate rules, game metadata, seats, or ready state", () => {
    const currentRoom = room();
    const currentPlayers = players();
    const beforeRoom = structuredClone(currentRoom);
    const beforePlayers = structuredClone(currentPlayers);
    prepareRoomPresentationUpdate({
      room: currentRoom, players: currentPlayers, userId: "user-0",
      settings: { ...DEFAULT_MULTIPLAYER_TABLE_PREFERENCES, trickDisplayMs: 850, gameSpeed: "custom" },
    });
    expect(currentRoom).toEqual(beforeRoom);
    expect(currentPlayers).toEqual(beforePlayers);
  });
});

describe("settings UI contexts", () => {
  it("keeps every existing timing control in solo", () => {
    const markup = settingsMarkup();
    expect(markup).toContain("Vitesse de jeu");
    expect(markup).toContain("Ramasser les plis automatiquement");
    expect(markup).toContain("Temps de réflexion visuel des bots");
    expect(markup).toContain("Délai entre enchères");
  });

  it("shows honest shared controls to the host without fake bot or bidding delays", () => {
    const markup = settingsMarkup({
      mode: "multiplayer", isHost: true,
      tablePreferences: { ...DEFAULT_MULTIPLAYER_TABLE_PREFERENCES },
      onTablePreferencesChange: () => undefined,
    });
    expect(markup).toContain("Rythme de la table");
    expect(markup).toContain("Vitesse de jeu de la table");
    expect(markup).toContain("Durée d&#x27;affichage d&#x27;un pli");
    expect(markup).toContain("bg-[var(--coinche-settings-surface)]");
    expect(markup).not.toContain("border-sky-200");
    expect(markup).not.toContain("Temps de réflexion visuel des bots");
    expect(markup).not.toContain("Délai entre enchères");
  });

  it("keeps personal controls editable for a non-host while table pacing is informational", () => {
    const markup = settingsMarkup({
      mode: "multiplayer", isHost: false,
      tablePreferences: { ...DEFAULT_MULTIPLAYER_TABLE_PREFERENCES },
    });
    expect(markup).toContain("Rythme de la table : Lente");
    expect(markup).toContain("Confirmer la Coinche");
    expect(markup).not.toContain("Appliquer à la table");
  });
});

describe("atomic persistence and client synchronization", () => {
  const sql = readFileSync("supabase/migrations/20260915000000_multiplayer_table_pacing.sql", "utf8");
  const service = readFileSync("lib/server/multiplayerService.ts", "utf8");
  const client = readFileSync("app/multiplayer/[roomId]/RoomPageClient.tsx", "utf8");
  const api = readFileSync("lib/multiplayerApi.ts", "utf8");

  it("CAS-updates only presentation settings and the room version through a host-authorized RPC", () => {
    expect(sql).toContain("host_user_id = p_actor_user_id");
    expect(sql).toContain("state_version = p_expected_version");
    expect(sql).toContain("presentation_settings = p_settings");
    expect(sql).toContain("state_version = state_version + 1");
    expect(service).toContain('.rpc("update_room_presentation"');
    expect(sql).not.toContain("ruleset_snapshot =");
  });

  it("applies the room value to GameTable and relies on existing room Realtime", () => {
    expect(client).toContain("trickPresentationPolicy={{ autoCollect: tablePreferences.autoCollectTricks");
    expect(client).toContain("subscribeToRoomRealtime");
  });

  it("writes the shared slow default when creating a room", () => {
    expect(service).toContain("presentation_settings: DEFAULT_MULTIPLAYER_TABLE_PREFERENCES");
  });

  it("does not add presentation or gameplay actions to automatic lobby retries", () => {
    const retrySet = api.slice(api.indexOf("const RETRYABLE_LOBBY_INTENTS"), api.indexOf("function lobbyRetryDecision"));
    expect(retrySet).not.toContain("update-room-presentation");
    expect(retrySet).not.toContain("game-action");
  });
});
