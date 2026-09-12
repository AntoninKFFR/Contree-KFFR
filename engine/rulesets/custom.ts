import { cloneRulesetSnapshot, freezeRulesetSnapshot, getRulesetPreset } from "./presets";
import type { GameRulesetSnapshot } from "./types";

export const CUSTOM_RULESET_VERSION = 1;

export type RulesetOverrides = {
  game?: Partial<GameRulesetSnapshot["game"]>;
  bidding?: Partial<Omit<GameRulesetSnapshot["bidding"], "allowGenerale">>;
  cardPlay?: Partial<GameRulesetSnapshot["cardPlay"]>;
  announcements?: Partial<GameRulesetSnapshot["announcements"]>;
  belote?: Partial<GameRulesetSnapshot["belote"]>;
  contractSuccess?: Partial<GameRulesetSnapshot["contractSuccess"]>;
  trickScoring?: Partial<GameRulesetSnapshot["trickScoring"]>;
  scoring?: Partial<GameRulesetSnapshot["scoring"]>;
};

export type CustomRulesetInput = { presetId: "contree-kffr"; overrides?: RulesetOverrides };
type Mutable<T> = { -readonly [K in keyof T]: T[K] extends object ? Mutable<T[K]> : T[K] };

const ALLOWED = {
  game: ["targetScore"],
  bidding: ["minBid", "maxBid", "bidStep", "allowCapot", "allowCoinche", "allowSurcoinche", "allowNoTrump", "allowAllTrump"],
  cardPlay: ["mustFollowSuit", "mustTrumpWhenVoid", "mustOvertrump", "mustRaiseAtTrump", "allowDiscardWhenPartnerWinning", "allowDiscardWhenCannotOvertrump"],
  announcements: ["enabled", "tierce", "fifty", "hundred", "squares"],
  belote: ["enabled", "points", "countsForContractSuccess", "countsForContractFailure", "allowInAllTrump"],
  contractSuccess: ["mustReachBid", "mustBeatDefense", "announcementsCount"],
  trickScoring: ["lastTrickBonus", "capotLastTrickBonus"],
  scoring: ["mode", "roundToTen", "announcementsLostOnFailure", "announcementsLostOnCapot", "failureBasePoints", "capotBasePoints", "coincheMultiplier", "surcoincheMultiplier", "doubleAllPointsOnCoinche"],
} as const;

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function parseCustomRulesetInput(value: unknown): CustomRulesetInput {
  if (!record(value) || value.presetId !== "contree-kffr") throw new Error("Variante de base invalide.");
  for (const key of Object.keys(value)) if (key !== "presetId" && key !== "overrides") throw new Error(`Propriété de règles interdite: ${key}.`);
  if (value.overrides === undefined) return { presetId: "contree-kffr" };
  if (!record(value.overrides)) throw new Error("Modifications de règles invalides.");
  const parsed: Record<string, Record<string, unknown>> = {};
  for (const [section, sectionValue] of Object.entries(value.overrides)) {
    if (!(section in ALLOWED) || !record(sectionValue)) throw new Error(`Section de règles interdite: ${section}.`);
    const allowed = ALLOWED[section as keyof typeof ALLOWED] as readonly string[];
    parsed[section] = {};
    for (const [key, item] of Object.entries(sectionValue)) {
      if (!allowed.includes(key)) throw new Error(`Option de règles interdite: ${section}.${key}.`);
      if (typeof item !== "boolean" && typeof item !== "number" && typeof item !== "string") throw new Error(`Valeur de règle invalide: ${section}.${key}.`);
      parsed[section][key] = item;
    }
  }
  return { presetId: "contree-kffr", overrides: parsed as RulesetOverrides };
}

export function buildCustomRuleset(rawInput: unknown): GameRulesetSnapshot {
  const input = parseCustomRulesetInput(rawInput);
  const preset = getRulesetPreset(input.presetId);
  if (!preset) throw new Error("Variante inconnue.");
  const overrides = input.overrides ?? {};
  const changed = Object.values(overrides).some((section) => section && Object.keys(section).length > 0);
  if (!changed) return freezeRulesetSnapshot(preset);
  const draft: Mutable<GameRulesetSnapshot> = {
    ...cloneRulesetSnapshot(preset),
    id: changed ? "custom" : preset.id,
    version: changed ? CUSTOM_RULESET_VERSION : preset.version,
    game: { ...preset.game, ...overrides.game },
    bidding: { ...preset.bidding, ...overrides.bidding },
    cardPlay: { ...preset.cardPlay, ...overrides.cardPlay },
    announcements: { ...preset.announcements, ...overrides.announcements },
    belote: { ...preset.belote, ...overrides.belote },
    contractSuccess: { ...preset.contractSuccess, ...overrides.contractSuccess },
    trickScoring: { ...preset.trickScoring, ...overrides.trickScoring },
    scoring: { ...preset.scoring, ...overrides.scoring },
  };
  if (draft.game.targetScore < 100 || draft.game.targetScore > 100_000) throw new Error("Le score cible doit être compris entre 100 et 100 000.");
  if (!draft.bidding.allowCoinche) draft.bidding = { ...draft.bidding, allowSurcoinche: false };
  if (!draft.announcements.enabled) {
    draft.announcements = { ...draft.announcements, tierce: false, fifty: false, hundred: false, squares: false };
    draft.contractSuccess = { ...draft.contractSuccess, announcementsCount: false };
  }
  if (!draft.belote.enabled) draft.belote = { ...draft.belote, countsForContractSuccess: false, countsForContractFailure: false, allowInAllTrump: false };
  if (!draft.bidding.allowAllTrump) draft.belote = { ...draft.belote, allowInAllTrump: false };
  return freezeRulesetSnapshot(draft as GameRulesetSnapshot);
}

export function rulesetToCustomInput(snapshot: GameRulesetSnapshot): CustomRulesetInput {
  const base = getRulesetPreset("contree-kffr")!;
  const overrides: RulesetOverrides = {};
  for (const section of Object.keys(ALLOWED) as Array<keyof typeof ALLOWED>) {
    const values: Record<string, unknown> = {};
    for (const key of ALLOWED[section]) {
      const current = (snapshot[section] as unknown as Record<string, unknown>)[key];
      const original = (base[section] as unknown as Record<string, unknown>)[key];
      if (current !== original) values[key] = current;
    }
    if (Object.keys(values).length) (overrides as Record<string, unknown>)[section] = values;
  }
  return { presetId: "contree-kffr", ...(Object.keys(overrides).length ? { overrides } : {}) };
}

export function mergeRulesetDraft(input: CustomRulesetInput, patch: RulesetOverrides): CustomRulesetInput {
  const current = input.overrides ?? {};
  const merged: RulesetOverrides = { ...current };
  for (const section of Object.keys(patch) as Array<keyof RulesetOverrides>) {
    merged[section] = { ...(current[section] as object), ...(patch[section] as object) } as never;
  }
  return rulesetToCustomInput(buildCustomRuleset({ presetId: input.presetId, overrides: merged }));
}
