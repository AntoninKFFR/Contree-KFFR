import type { GameSettings, ScoringMode } from "../types";
import {
  CONTREE_KFFR_RULESET,
  cloneRulesetSnapshot,
  freezeRulesetSnapshot,
  getRulesetPreset,
} from "./presets";
import type { GameRulesetSnapshot, RulesetScoringMode } from "./types";
import { validateRuleset } from "./validation";

export type NormalizedGameSettings = GameSettings & { ruleset: GameRulesetSnapshot };

function defaultTargetScore(scoringMode: ScoringMode): number {
  return scoringMode === "announced-points" ? 500 : CONTREE_KFFR_RULESET.game.targetScore;
}

function rulesetScoringMode(scoringMode: ScoringMode): RulesetScoringMode {
  if (scoringMode === "made-points") return "points-only";
  if (scoringMode === "announced-points") return "contract-only";
  return "ffb";
}

function legacyScoringMode(mode: RulesetScoringMode): ScoringMode {
  if (mode === "points-only") return "made-points";
  if (mode === "contract-only") return "announced-points";
  return "ffb";
}

function legacyRuleset(scoringMode: ScoringMode, targetScore: number): GameRulesetSnapshot {
  const ruleset = cloneRulesetSnapshot(CONTREE_KFFR_RULESET);
  return {
    ...ruleset,
    id: scoringMode === "ffb" ? "contree-kffr" : `legacy-${scoringMode}`,
    game: { targetScore },
    belote: scoringMode === "ffb" ? ruleset.belote : { ...ruleset.belote, enabled: false },
    trickScoring: scoringMode === "ffb"
      ? ruleset.trickScoring
      : { ...ruleset.trickScoring, capotLastTrickBonus: ruleset.trickScoring.lastTrickBonus },
    scoring: {
      ...ruleset.scoring,
      mode: rulesetScoringMode(scoringMode),
      roundToTen: scoringMode === "ffb",
      failureBasePoints: scoringMode === "ffb" ? 160 : 162,
    },
  };
}

export function resolveGameRules(settings?: Partial<GameSettings> | null): GameRulesetSnapshot {
  if (settings?.ruleset) {
    validateRuleset(settings.ruleset);
    return settings.ruleset;
  }
  const scoringMode = settings?.scoringMode ?? "ffb";
  const targetScore = settings?.targetScore ?? defaultTargetScore(scoringMode);
  return freezeRulesetSnapshot(legacyRuleset(scoringMode, targetScore));
}

export function normalizeGameSettings(settings: Partial<GameSettings> = {}): NormalizedGameSettings {
  const sourceRules = settings.ruleset
    ? cloneRulesetSnapshot(settings.ruleset)
    : legacyRuleset(
        settings.scoringMode ?? "ffb",
        settings.targetScore ?? defaultTargetScore(settings.scoringMode ?? "ffb"),
      );
  const ruleset = freezeRulesetSnapshot({
    ...sourceRules,
    game: { targetScore: settings.targetScore ?? sourceRules.game.targetScore },
  });
  return {
    scoringMode: legacyScoringMode(ruleset.scoring.mode),
    targetScore: ruleset.game.targetScore,
    ruleset,
  };
}

export function createGameSettings(input: {
  presetId?: string;
  ruleset?: GameRulesetSnapshot;
  targetScore?: number;
} = {}): NormalizedGameSettings {
  const ruleset = input.ruleset ?? getRulesetPreset(input.presetId ?? "contree-kffr");
  if (!ruleset) throw new Error(`Unknown ruleset preset: ${input.presetId}.`);
  return normalizeGameSettings({ ruleset, targetScore: input.targetScore });
}
