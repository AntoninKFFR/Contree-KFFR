import type { GameRulesetSnapshot } from "./types";
import { validateRuleset } from "./validation";

function deepFreeze<T extends object>(value: T): Readonly<T> {
  Object.freeze(value);
  for (const nested of Object.values(value)) {
    if (nested && typeof nested === "object" && !Object.isFrozen(nested)) deepFreeze(nested);
  }
  return value;
}

const contreeKffrRuleset: GameRulesetSnapshot = {
  id: "contree-kffr",
  version: 1,
  game: { targetScore: 1000 },
  bidding: {
    minBid: 80,
    maxBid: 160,
    bidStep: 10,
    allowCapot: true,
    allowGenerale: false,
    allowCoinche: true,
    allowSurcoinche: true,
    allowNoTrump: false,
    allowAllTrump: false,
  },
  cardPlay: {
    mustFollowSuit: true,
    mustTrumpWhenVoid: true,
    mustOvertrump: true,
    mustRaiseAtTrump: true,
    allowDiscardWhenPartnerWinning: true,
    allowDiscardWhenCannotOvertrump: true,
  },
  announcements: { enabled: false, tierce: false, fifty: false, hundred: false, squares: false },
  belote: {
    enabled: true,
    points: 20,
    countsForContractSuccess: true,
    countsForContractFailure: true,
    allowInAllTrump: false,
  },
  contractSuccess: { mustReachBid: true, mustBeatDefense: true, announcementsCount: false },
  trickScoring: { lastTrickBonus: 10, capotLastTrickBonus: 100 },
  scoring: {
    mode: "ffb",
    roundToTen: true,
    announcementsLostOnFailure: true,
    announcementsLostOnCapot: true,
    failureBasePoints: 160,
    capotBasePoints: 250,
    coincheMultiplier: 2,
    surcoincheMultiplier: 4,
    doubleAllPointsOnCoinche: false,
  },
};

validateRuleset(contreeKffrRuleset);

export const CONTREE_KFFR_RULESET = deepFreeze(contreeKffrRuleset) as GameRulesetSnapshot;

export function cloneRulesetSnapshot(ruleset: GameRulesetSnapshot): GameRulesetSnapshot {
  return {
    ...ruleset,
    game: { ...ruleset.game },
    bidding: { ...ruleset.bidding },
    cardPlay: { ...ruleset.cardPlay },
    announcements: { ...ruleset.announcements },
    belote: { ...ruleset.belote },
    contractSuccess: { ...ruleset.contractSuccess },
    trickScoring: { ...ruleset.trickScoring },
    scoring: { ...ruleset.scoring },
  };
}

export function freezeRulesetSnapshot(ruleset: GameRulesetSnapshot): GameRulesetSnapshot {
  validateRuleset(ruleset);
  return deepFreeze(cloneRulesetSnapshot(ruleset)) as GameRulesetSnapshot;
}

export function getRulesetPreset(id: string): GameRulesetSnapshot | null {
  return id === CONTREE_KFFR_RULESET.id ? cloneRulesetSnapshot(CONTREE_KFFR_RULESET) : null;
}
