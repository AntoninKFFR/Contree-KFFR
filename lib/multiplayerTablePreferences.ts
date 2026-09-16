import {
  GAME_SPEED_PRESETS,
  type PresetGameSpeed,
} from "@/lib/preferences/playerPreferences";

export type MultiplayerTablePreferences = {
  gameSpeed: PresetGameSpeed | "custom";
  autoCollectTricks: boolean;
  trickDisplayMs: number;
};

export const MULTIPLAYER_SLOW_PACING = Object.freeze({
  biddingDelayMs: 650,
  botDelayMs: 1_000,
  trickDisplayMs: 1_500,
});

export function multiplayerPacingForSpeed(gameSpeed: MultiplayerTablePreferences["gameSpeed"]) {
  return gameSpeed === "slow"
    ? MULTIPLAYER_SLOW_PACING
    : GAME_SPEED_PRESETS[gameSpeed === "custom" ? "normal" : gameSpeed];
}

export const DEFAULT_MULTIPLAYER_TABLE_PREFERENCES: Readonly<MultiplayerTablePreferences> = Object.freeze({
  gameSpeed: "slow",
  autoCollectTricks: true,
  trickDisplayMs: MULTIPLAYER_SLOW_PACING.trickDisplayMs,
});

const SPEEDS = new Set<MultiplayerTablePreferences["gameSpeed"]>([
  "slow", "normal", "fast", "instant", "custom",
]);

export function isMultiplayerTablePreferences(value: unknown): value is MultiplayerTablePreferences {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const settings = value as Record<string, unknown>;
  return Object.keys(settings).length === 3
    && SPEEDS.has(settings.gameSpeed as MultiplayerTablePreferences["gameSpeed"])
    && typeof settings.autoCollectTricks === "boolean"
    && Number.isInteger(settings.trickDisplayMs)
    && Number(settings.trickDisplayMs) >= 0
    && Number(settings.trickDisplayMs) <= 3_000;
}

export function normalizeMultiplayerTablePreferences(value: unknown): MultiplayerTablePreferences {
  if (!isMultiplayerTablePreferences(value)) return { ...DEFAULT_MULTIPLAYER_TABLE_PREFERENCES };
  // Older Slow rooms stored the Solo default. No custom timing uses this mode.
  if (value.gameSpeed === "slow" && value.trickDisplayMs === GAME_SPEED_PRESETS.slow.trickDisplayMs) {
    return { ...value, trickDisplayMs: MULTIPLAYER_SLOW_PACING.trickDisplayMs };
  }
  return { ...value };
}

export function withMultiplayerTableSpeed(
  settings: MultiplayerTablePreferences,
  gameSpeed: PresetGameSpeed,
): MultiplayerTablePreferences {
  return { ...settings, gameSpeed, trickDisplayMs: multiplayerPacingForSpeed(gameSpeed).trickDisplayMs };
}

export function withMultiplayerTableTrickDisplay(
  settings: MultiplayerTablePreferences,
  trickDisplayMs: number,
): MultiplayerTablePreferences {
  return { ...settings, gameSpeed: "custom", trickDisplayMs };
}
