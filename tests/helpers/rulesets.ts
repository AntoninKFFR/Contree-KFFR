import {
  cloneRulesetSnapshot,
  CONTREE_KFFR_RULESET,
  freezeRulesetSnapshot,
} from "@/engine/rulesets/presets";
import type { GameRulesetSnapshot } from "@/engine/rulesets/types";

export type TestRulesetOverrides = {
  id?: string;
  version?: number;
  game?: Partial<GameRulesetSnapshot["game"]>;
  bidding?: Partial<GameRulesetSnapshot["bidding"]>;
  cardPlay?: Partial<GameRulesetSnapshot["cardPlay"]>;
  announcements?: Partial<GameRulesetSnapshot["announcements"]>;
  belote?: Partial<GameRulesetSnapshot["belote"]>;
  contractSuccess?: Partial<GameRulesetSnapshot["contractSuccess"]>;
  trickScoring?: Partial<GameRulesetSnapshot["trickScoring"]>;
  scoring?: Partial<GameRulesetSnapshot["scoring"]>;
};

export function createTestRuleset(overrides: TestRulesetOverrides = {}): GameRulesetSnapshot {
  const base = cloneRulesetSnapshot(CONTREE_KFFR_RULESET);
  return freezeRulesetSnapshot({
    ...base,
    id: overrides.id ?? "custom",
    version: overrides.version ?? 1,
    game: { ...base.game, ...overrides.game },
    bidding: { ...base.bidding, ...overrides.bidding },
    cardPlay: { ...base.cardPlay, ...overrides.cardPlay },
    announcements: { ...base.announcements, ...overrides.announcements },
    belote: { ...base.belote, ...overrides.belote },
    contractSuccess: { ...base.contractSuccess, ...overrides.contractSuccess },
    trickScoring: { ...base.trickScoring, ...overrides.trickScoring },
    scoring: { ...base.scoring, ...overrides.scoring },
  });
}

export const rulesetWithAnnouncements = createTestRuleset({
  id: "test-announcements",
  announcements: { enabled: true, tierce: true, fifty: true, hundred: true, squares: true },
});

export const rulesetContractCanLosePointsRace = createTestRuleset({
  id: "test-no-points-race",
  contractSuccess: { mustBeatDefense: false },
});

export const rulesetNoBeloteForContract = createTestRuleset({
  id: "test-belote-does-not-qualify",
  belote: { countsForContractSuccess: false },
});

export const rulesetNoRounding = createTestRuleset({
  id: "test-no-rounding",
  scoring: { roundToTen: false },
});
