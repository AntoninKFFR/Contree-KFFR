import type { ScoringMode } from "../types";
import { buildCustomRuleset, rulesetToCustomInput } from "./custom";
import { normalizeGameSettings } from "./resolve";
import type { GameRulesetSnapshot } from "./types";

export type RoomRulesSource = { ruleset_snapshot?: GameRulesetSnapshot | null; scoring_mode: ScoringMode; target_score: number };

export function resolveRoomRules(source: RoomRulesSource): GameRulesetSnapshot {
  if (source.ruleset_snapshot) {
    const migrated = normalizeGameSettings({ ruleset: source.ruleset_snapshot }).ruleset;
    return buildCustomRuleset(rulesetToCustomInput(migrated));
  }
  return normalizeGameSettings({ scoringMode: source.scoring_mode, targetScore: source.target_score }).ruleset;
}

export function buildRoomRulesFields(raw: unknown) {
  const ruleset = buildCustomRuleset(raw ?? { presetId: "contree-kffr" });
  const settings = normalizeGameSettings({ ruleset });
  return {
    scoring_mode: settings.scoringMode,
    target_score: ruleset.game.targetScore,
    ruleset_id: ruleset.id,
    ruleset_version: ruleset.version,
    ruleset_snapshot: ruleset,
  };
}
