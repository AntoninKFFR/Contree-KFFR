import { describe, expect, it } from "vitest";
import {
  clonePlayerPreferences,
  DEFAULT_PLAYER_PREFERENCES,
  GAME_SPEED_PRESETS,
  loadPlayerPreferences,
  normalizePlayerPreferences,
  PLAYER_PREFERENCES_STORAGE_KEY,
  resetPlayerPreferences,
  savePlayerPreferences,
  validatePlayerPreferences,
  withGameSpeed,
  type PreferenceStorage,
} from "@/lib/preferences/playerPreferences";
import { getTrickPresentationPolicy } from "@/lib/preferences/presentation";
import { canPlayPreferenceSound } from "@/lib/preferences/audio";

class MemoryStorage implements PreferenceStorage {
  values = new Map<string, string>();
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
  removeItem(key: string) { this.values.delete(key); }
}

describe("player preference persistence", () => {
  it("provides valid defaults", () => expect(validatePlayerPreferences(DEFAULT_PLAYER_PREFERENCES)).toBe(true));
  it("defaults the global appearance to dark", () => expect(DEFAULT_PLAYER_PREFERENCES.visual.theme).toBe("dark"));
  it("defaults background music on at 25% independently of sound effects", () => {
    expect(DEFAULT_PLAYER_PREFERENCES.audio).toMatchObject({ enabled: false, musicEnabled: true, musicVolume: 0.25 });
  });
  it("saves under the versioned local key", () => { const storage = new MemoryStorage(); expect(savePlayerPreferences(storage, clonePlayerPreferences())).toBe(true); expect(storage.values.has(PLAYER_PREFERENCES_STORAGE_KEY)).toBe(true); });
  it("loads a saved preference set", () => { const storage = new MemoryStorage(); const value = withGameSpeed(clonePlayerPreferences(), "fast"); value.cards.suitOrder = ["hearts", "spades", "diamonds", "clubs"]; savePlayerPreferences(storage, value); const loaded = loadPlayerPreferences(storage); expect(loaded.gameplay.gameSpeed).toBe("fast"); expect(loaded.cards.suitOrder).toEqual(value.cards.suitOrder); });
  it("persists both appearance values", () => { const storage = new MemoryStorage(); const value = clonePlayerPreferences(); value.visual.theme = "light"; savePlayerPreferences(storage, value); expect(loadPlayerPreferences(storage).visual.theme).toBe("light"); value.visual.theme = "dark"; savePlayerPreferences(storage, value); expect(loadPlayerPreferences(storage).visual.theme).toBe("dark"); });
  it("migrates stored v1 preferences without an appearance to dark", () => { const storage = new MemoryStorage(); const legacy = clonePlayerPreferences() as unknown as { visual: Record<string, unknown> }; delete legacy.visual.theme; storage.setItem(PLAYER_PREFERENCES_STORAGE_KEY, JSON.stringify(legacy)); expect(loadPlayerPreferences(storage).visual.theme).toBe("dark"); });
  it("fills music defaults in saved preferences without overwriting other choices", () => { const storage = new MemoryStorage(); const legacy = clonePlayerPreferences(); legacy.audio.enabled = true; const audio = legacy.audio as unknown as Record<string, unknown>; delete audio.musicEnabled; delete audio.musicVolume; storage.setItem(PLAYER_PREFERENCES_STORAGE_KEY, JSON.stringify(legacy)); expect(loadPlayerPreferences(storage).audio).toMatchObject({ enabled: true, musicEnabled: true, musicVolume: 0.25 }); });
  it("persists independent music toggle and volume", () => { const storage = new MemoryStorage(); const value = clonePlayerPreferences(); value.audio.musicEnabled = false; value.audio.musicVolume = 0.4; savePlayerPreferences(storage, value); expect(loadPlayerPreferences(storage).audio).toMatchObject({ musicEnabled: false, musicVolume: 0.4, enabled: false }); });
  it("falls back on corrupted JSON", () => { const storage = new MemoryStorage(); storage.setItem(PLAYER_PREFERENCES_STORAGE_KEY, "{"); expect(loadPlayerPreferences(storage)).toEqual(clonePlayerPreferences()); });
  it("falls back on an unknown version", () => expect(normalizePlayerPreferences({ version: 999, audio: { enabled: true } })).toEqual(clonePlayerPreferences()));
  it("normalizes invalid values without throwing", () => { const normalized = normalizePlayerPreferences({ ...clonePlayerPreferences(), audio: { enabled: true, volume: 9 }, cards: { autoSortHand: true, sortMode: "wrong", suitOrder: ["clubs"], cardSize: "huge" } }); expect(normalized.audio.volume).toBe(1); expect(normalized.cards.sortMode).toBe("suit-rank"); expect(normalized.cards.suitOrder).toEqual(["clubs", "diamonds", "spades", "hearts"]); });
  it("resets storage and returns defaults", () => { const storage = new MemoryStorage(); savePlayerPreferences(storage, withGameSpeed(clonePlayerPreferences(), "slow")); expect(resetPlayerPreferences(storage)).toEqual(clonePlayerPreferences()); expect(storage.getItem(PLAYER_PREFERENCES_STORAGE_KEY)).toBeNull(); });
  it("never mutates the global defaults", () => { const before = JSON.stringify(DEFAULT_PLAYER_PREFERENCES); const copy = clonePlayerPreferences(); copy.cards.suitOrder.reverse(); copy.audio.volume = 0.1; expect(JSON.stringify(DEFAULT_PLAYER_PREFERENCES)).toBe(before); });
});

describe("central game-speed and collection policy", () => {
  it.each([
    ["slow", { botDelayMs: 1_200, trickDisplayMs: 1_800, biddingDelayMs: 800 }],
    ["normal", { botDelayMs: 700, trickDisplayMs: 1_200, biddingDelayMs: 500 }],
    ["fast", { botDelayMs: 300, trickDisplayMs: 650, biddingDelayMs: 250 }],
    ["instant", { botDelayMs: 0, trickDisplayMs: 0, biddingDelayMs: 0 }],
  ] as const)("maps %s speed centrally", (speed, expected) => { expect(GAME_SPEED_PRESETS[speed]).toEqual(expected); expect(withGameSpeed(clonePlayerPreferences(), speed).gameplay).toMatchObject(expected); });
  it("enables automatic collection independently of the engine", () => expect(getTrickPresentationPolicy(clonePlayerPreferences())).toEqual({ autoCollect: true, delayMs: 1_200 }));
  it("supports manual collection", () => { const value = clonePlayerPreferences(); value.gameplay.autoCollectTricks = false; expect(getTrickPresentationPolicy(value).autoCollect).toBe(false); });
  it("uses the configured trick display delay", () => { const value = clonePlayerPreferences(); value.gameplay.trickDisplayMs = 1_500; expect(getTrickPresentationPolicy(value).delayMs).toBe(1_500); });
  it("has no input path to the server turn timer", async () => { const { turnDeadlineForState } = await import("@/lib/multiplayerTurnTimer"); expect(turnDeadlineForState.length).toBe(3); });
});

describe("preference audio gating", () => {
  it("keeps all sounds off by default", () => expect(canPlayPreferenceSound("card-play", clonePlayerPreferences())).toBe(false));
  it("honors the master, category and volume controls", () => { const value = clonePlayerPreferences(); value.audio.enabled = true; expect(canPlayPreferenceSound("bid", value)).toBe(true); value.audio.biddingSounds = false; expect(canPlayPreferenceSound("bid", value)).toBe(false); value.audio.volume = 0; expect(canPlayPreferenceSound("card-play", value)).toBe(false); });
});
