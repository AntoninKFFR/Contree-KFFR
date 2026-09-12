import { createInitialGame } from "@/engine/game";
import { createGameSettings } from "@/engine/rulesets/resolve";
import type { GameState } from "@/engine/types";
import { buildCustomRuleset, rulesetToCustomInput, type CustomRulesetInput } from "@/engine/rulesets/custom";
import type { GameRulesetSnapshot } from "@/engine/rulesets/types";

export const SOLO_RULES_STORAGE_KEY = "coinche:solo-rules:v1";

export type StorageReader = Pick<Storage, "getItem" | "setItem">;

export function loadSoloRules(storage?: Pick<Storage, "getItem"> | null): CustomRulesetInput {
  if (!storage) return { presetId: "contree-kffr" };
  try {
    const raw = storage.getItem(SOLO_RULES_STORAGE_KEY);
    if (!raw) return { presetId: "contree-kffr" };
    return rulesetToCustomInput(buildCustomRuleset(JSON.parse(raw)));
  } catch {
    return { presetId: "contree-kffr" };
  }
}

export function saveSoloRules(storage: Pick<Storage, "setItem">, input: CustomRulesetInput): void {
  const safe = rulesetToCustomInput(buildCustomRuleset(input));
  storage.setItem(SOLO_RULES_STORAGE_KEY, JSON.stringify(safe));
}

export function createSoloGame(random = Math.random, ruleset?: GameRulesetSnapshot): GameState {
  return createInitialGame(random, createGameSettings(ruleset ? { ruleset } : {}));
}
