import type { Suit } from "@/engine/types";

export const PLAYER_PREFERENCES_VERSION = 1 as const;
export const PLAYER_PREFERENCES_STORAGE_KEY = "coinche:player-preferences:v1";

export type GameSpeed = "slow" | "normal" | "fast" | "instant";
export type HandSortMode = "suit-rank" | "rank-suit" | "manual";
export type PlayerCardSize = "small" | "medium" | "large";

export type PlayerPreferences = {
  version: typeof PLAYER_PREFERENCES_VERSION;
  gameplay: {
    gameSpeed: GameSpeed;
    botDelayMs: number;
    trickDisplayMs: number;
    biddingDelayMs: number;
    autoCollectTricks: boolean;
    confirmCoinche: boolean;
    confirmSurcoinche: boolean;
    confirmGenerale: boolean;
  };
  assistance: {
    highlightLegalCards: boolean;
    dimIllegalCards: boolean;
    disableIllegalCardClicks: boolean;
    showLivePoints: boolean;
    showContractProgress: boolean;
    showLastTrick: boolean;
    showTurnIndicator: boolean;
  };
  cards: {
    autoSortHand: boolean;
    sortMode: HandSortMode;
    suitOrder: Suit[];
    cardSize: PlayerCardSize;
  };
  visual: {
    animations: boolean;
    dealAnimation: boolean;
    cardPlayAnimation: boolean;
    trickAnimation: boolean;
    biddingAnimation: boolean;
    reducedMotion: boolean;
    compactLayout: boolean;
    highContrast: boolean;
    textSize: "normal" | "large";
  };
  audio: {
    enabled: boolean;
    cardSounds: boolean;
    biddingSounds: boolean;
    uiSounds: boolean;
    volume: number;
  };
};

export type GameSpeedDelays = Pick<
  PlayerPreferences["gameplay"],
  "botDelayMs" | "trickDisplayMs" | "biddingDelayMs"
>;

export const GAME_SPEED_PRESETS: Readonly<Record<GameSpeed, Readonly<GameSpeedDelays>>> = {
  slow: { botDelayMs: 1_200, trickDisplayMs: 1_800, biddingDelayMs: 800 },
  normal: { botDelayMs: 700, trickDisplayMs: 1_200, biddingDelayMs: 500 },
  fast: { botDelayMs: 300, trickDisplayMs: 650, biddingDelayMs: 250 },
  instant: { botDelayMs: 0, trickDisplayMs: 0, biddingDelayMs: 0 },
};

const BASE_DEFAULTS: PlayerPreferences = {
  version: PLAYER_PREFERENCES_VERSION,
  gameplay: {
    gameSpeed: "normal",
    ...GAME_SPEED_PRESETS.normal,
    autoCollectTricks: true,
    confirmCoinche: true,
    confirmSurcoinche: true,
    confirmGenerale: true,
  },
  assistance: {
    highlightLegalCards: true,
    dimIllegalCards: true,
    disableIllegalCardClicks: true,
    showLivePoints: true,
    showContractProgress: true,
    showLastTrick: true,
    showTurnIndicator: true,
  },
  cards: {
    autoSortHand: true,
    sortMode: "suit-rank",
    suitOrder: ["clubs", "diamonds", "hearts", "spades"],
    cardSize: "medium",
  },
  visual: {
    animations: true,
    dealAnimation: true,
    cardPlayAnimation: true,
    trickAnimation: true,
    biddingAnimation: true,
    reducedMotion: false,
    compactLayout: false,
    highContrast: false,
    textSize: "normal",
  },
  audio: {
    enabled: false,
    cardSounds: true,
    biddingSounds: true,
    uiSounds: true,
    volume: 0.5,
  },
};

export function clonePlayerPreferences(value: PlayerPreferences = BASE_DEFAULTS): PlayerPreferences {
  return {
    version: PLAYER_PREFERENCES_VERSION,
    gameplay: { ...value.gameplay },
    assistance: { ...value.assistance },
    cards: { ...value.cards, suitOrder: [...value.cards.suitOrder] },
    visual: { ...value.visual },
    audio: { ...value.audio },
  };
}

export const DEFAULT_PLAYER_PREFERENCES: Readonly<PlayerPreferences> = Object.freeze({
  ...BASE_DEFAULTS,
  gameplay: Object.freeze({ ...BASE_DEFAULTS.gameplay }),
  assistance: Object.freeze({ ...BASE_DEFAULTS.assistance }),
  cards: Object.freeze({ ...BASE_DEFAULTS.cards, suitOrder: Object.freeze([...BASE_DEFAULTS.cards.suitOrder]) }) as unknown as PlayerPreferences["cards"],
  visual: Object.freeze({ ...BASE_DEFAULTS.visual }),
  audio: Object.freeze({ ...BASE_DEFAULTS.audio }),
});

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function booleanValue(source: Record<string, unknown>, key: string, fallback: boolean): boolean {
  return typeof source[key] === "boolean" ? source[key] : fallback;
}

function enumValue<T extends string>(source: Record<string, unknown>, key: string, values: readonly T[], fallback: T): T {
  return typeof source[key] === "string" && values.includes(source[key] as T) ? source[key] as T : fallback;
}

function delayValue(source: Record<string, unknown>, key: string, fallback: number): number {
  const value = source[key];
  return typeof value === "number" && Number.isFinite(value)
    ? Math.min(5_000, Math.max(0, Math.round(value)))
    : fallback;
}

function volumeValue(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.min(1, Math.max(0, value))
    : fallback;
}

function suitOrderValue(value: unknown): Suit[] {
  const valid = ["clubs", "diamonds", "hearts", "spades"] satisfies Suit[];
  if (!Array.isArray(value) || value.length !== valid.length) return [...valid];
  const order = value.filter((suit): suit is Suit => typeof suit === "string" && valid.includes(suit as Suit));
  return new Set(order).size === valid.length ? order : [...valid];
}

export function normalizePlayerPreferences(value: unknown): PlayerPreferences {
  if (!isRecord(value) || value.version !== PLAYER_PREFERENCES_VERSION) {
    return clonePlayerPreferences();
  }
  const gameplay = isRecord(value.gameplay) ? value.gameplay : {};
  const assistance = isRecord(value.assistance) ? value.assistance : {};
  const cards = isRecord(value.cards) ? value.cards : {};
  const visual = isRecord(value.visual) ? value.visual : {};
  const audio = isRecord(value.audio) ? value.audio : {};
  const gameSpeed = enumValue(gameplay, "gameSpeed", ["slow", "normal", "fast", "instant"], "normal");
  const speed = GAME_SPEED_PRESETS[gameSpeed];

  return {
    version: PLAYER_PREFERENCES_VERSION,
    gameplay: {
      gameSpeed,
      botDelayMs: delayValue(gameplay, "botDelayMs", speed.botDelayMs),
      trickDisplayMs: delayValue(gameplay, "trickDisplayMs", speed.trickDisplayMs),
      biddingDelayMs: delayValue(gameplay, "biddingDelayMs", speed.biddingDelayMs),
      autoCollectTricks: booleanValue(gameplay, "autoCollectTricks", true),
      confirmCoinche: booleanValue(gameplay, "confirmCoinche", true),
      confirmSurcoinche: booleanValue(gameplay, "confirmSurcoinche", true),
      confirmGenerale: booleanValue(gameplay, "confirmGenerale", true),
    },
    assistance: {
      highlightLegalCards: booleanValue(assistance, "highlightLegalCards", true),
      dimIllegalCards: booleanValue(assistance, "dimIllegalCards", true),
      disableIllegalCardClicks: booleanValue(assistance, "disableIllegalCardClicks", true),
      showLivePoints: booleanValue(assistance, "showLivePoints", true),
      showContractProgress: booleanValue(assistance, "showContractProgress", true),
      showLastTrick: booleanValue(assistance, "showLastTrick", true),
      showTurnIndicator: booleanValue(assistance, "showTurnIndicator", true),
    },
    cards: {
      autoSortHand: booleanValue(cards, "autoSortHand", true),
      sortMode: enumValue(cards, "sortMode", ["suit-rank", "rank-suit", "manual"], "suit-rank"),
      suitOrder: suitOrderValue(cards.suitOrder),
      cardSize: enumValue(cards, "cardSize", ["small", "medium", "large"], "medium"),
    },
    visual: {
      animations: booleanValue(visual, "animations", true),
      dealAnimation: booleanValue(visual, "dealAnimation", true),
      cardPlayAnimation: booleanValue(visual, "cardPlayAnimation", true),
      trickAnimation: booleanValue(visual, "trickAnimation", true),
      biddingAnimation: booleanValue(visual, "biddingAnimation", true),
      reducedMotion: booleanValue(visual, "reducedMotion", false),
      compactLayout: booleanValue(visual, "compactLayout", false),
      highContrast: booleanValue(visual, "highContrast", false),
      textSize: enumValue(visual, "textSize", ["normal", "large"], "normal"),
    },
    audio: {
      enabled: booleanValue(audio, "enabled", false),
      cardSounds: booleanValue(audio, "cardSounds", true),
      biddingSounds: booleanValue(audio, "biddingSounds", true),
      uiSounds: booleanValue(audio, "uiSounds", true),
      volume: volumeValue(audio.volume, 0.5),
    },
  };
}

export function validatePlayerPreferences(value: unknown): value is PlayerPreferences {
  if (!isRecord(value) || value.version !== PLAYER_PREFERENCES_VERSION) return false;
  const normalized = normalizePlayerPreferences(value);
  const canonical = (candidate: unknown): unknown => Array.isArray(candidate)
    ? candidate.map(canonical)
    : isRecord(candidate)
      ? Object.fromEntries(Object.keys(candidate).sort().map((key) => [key, canonical(candidate[key])]))
      : candidate;
  return JSON.stringify(canonical(normalized)) === JSON.stringify(canonical(value));
}

export function withGameSpeed(preferences: PlayerPreferences, gameSpeed: GameSpeed): PlayerPreferences {
  return {
    ...clonePlayerPreferences(preferences),
    gameplay: { ...preferences.gameplay, gameSpeed, ...GAME_SPEED_PRESETS[gameSpeed] },
  };
}

export type PreferenceStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export function loadPlayerPreferences(storage: PreferenceStorage | null | undefined): PlayerPreferences {
  if (!storage) return clonePlayerPreferences();
  try {
    const raw = storage.getItem(PLAYER_PREFERENCES_STORAGE_KEY);
    return raw === null ? clonePlayerPreferences() : normalizePlayerPreferences(JSON.parse(raw));
  } catch {
    return clonePlayerPreferences();
  }
}

export function savePlayerPreferences(storage: PreferenceStorage | null | undefined, preferences: PlayerPreferences): boolean {
  if (!storage) return false;
  try {
    storage.setItem(PLAYER_PREFERENCES_STORAGE_KEY, JSON.stringify(normalizePlayerPreferences(preferences)));
    return true;
  } catch {
    return false;
  }
}

export function resetPlayerPreferences(storage?: PreferenceStorage | null): PlayerPreferences {
  try {
    storage?.removeItem(PLAYER_PREFERENCES_STORAGE_KEY);
  } catch {
    // Storage may be unavailable in private or restricted browsing contexts.
  }
  return clonePlayerPreferences();
}
