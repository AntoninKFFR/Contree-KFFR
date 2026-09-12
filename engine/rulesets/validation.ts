import type { GameRulesetSnapshot } from "./types";

const SCORING_MODES = new Set([
  "ffb",
  "contract-only",
  "contract-only-160-failure",
  "points-only",
]);

function positiveInteger(value: number, label: string): void {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`Invalid ruleset: ${label} must be a positive integer.`);
  }
}

function nonNegativeInteger(value: number, label: string): void {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`Invalid ruleset: ${label} must be a non-negative integer.`);
  }
}

function booleanValue(value: boolean, label: string): void {
  if (typeof value !== "boolean") {
    throw new Error(`Invalid ruleset: ${label} must be a boolean.`);
  }
}

export function validateRuleset(ruleset: GameRulesetSnapshot): void {
  if (!ruleset.id || typeof ruleset.id !== "string") throw new Error("Invalid ruleset: id is required.");
  positiveInteger(ruleset.version, "version");
  positiveInteger(ruleset.game.targetScore, "game.targetScore");
  positiveInteger(ruleset.bidding.minBid, "bidding.minBid");
  positiveInteger(ruleset.bidding.maxBid, "bidding.maxBid");
  positiveInteger(ruleset.bidding.bidStep, "bidding.bidStep");
  if (ruleset.bidding.minBid > ruleset.bidding.maxBid) {
    throw new Error("Invalid ruleset: bidding.minBid cannot exceed bidding.maxBid.");
  }
  if (ruleset.bidding.allowSurcoinche && !ruleset.bidding.allowCoinche) {
    throw new Error("Invalid ruleset: surcoinche requires coinche.");
  }
  for (const [label, value] of [
    ["bidding.allowCapot", ruleset.bidding.allowCapot],
    ["bidding.allowGenerale", ruleset.bidding.allowGenerale],
    ["bidding.allowCoinche", ruleset.bidding.allowCoinche],
    ["bidding.allowSurcoinche", ruleset.bidding.allowSurcoinche],
    ["bidding.allowNoTrump", ruleset.bidding.allowNoTrump],
    ["bidding.allowAllTrump", ruleset.bidding.allowAllTrump],
    ["cardPlay.mustFollowSuit", ruleset.cardPlay.mustFollowSuit],
    ["cardPlay.mustTrumpWhenVoid", ruleset.cardPlay.mustTrumpWhenVoid],
    ["cardPlay.mustOvertrump", ruleset.cardPlay.mustOvertrump],
    ["cardPlay.mustRaiseAtTrump", ruleset.cardPlay.mustRaiseAtTrump],
    ["cardPlay.allowDiscardWhenPartnerWinning", ruleset.cardPlay.allowDiscardWhenPartnerWinning],
    ["cardPlay.allowDiscardWhenCannotOvertrump", ruleset.cardPlay.allowDiscardWhenCannotOvertrump],
    ["announcements.enabled", ruleset.announcements.enabled],
    ["announcements.tierce", ruleset.announcements.tierce],
    ["announcements.fifty", ruleset.announcements.fifty],
    ["announcements.hundred", ruleset.announcements.hundred],
    ["announcements.squares", ruleset.announcements.squares],
    ["belote.enabled", ruleset.belote.enabled],
    ["belote.countsForContractSuccess", ruleset.belote.countsForContractSuccess],
    ["belote.countsForContractFailure", ruleset.belote.countsForContractFailure],
    ["belote.allowInAllTrump", ruleset.belote.allowInAllTrump],
    ["contractSuccess.mustReachBid", ruleset.contractSuccess.mustReachBid],
    ["contractSuccess.mustBeatDefense", ruleset.contractSuccess.mustBeatDefense],
    ["contractSuccess.announcementsCount", ruleset.contractSuccess.announcementsCount],
    ["scoring.roundToTen", ruleset.scoring.roundToTen],
    ["scoring.announcementsLostOnFailure", ruleset.scoring.announcementsLostOnFailure],
    ["scoring.announcementsLostOnCapot", ruleset.scoring.announcementsLostOnCapot],
    ["scoring.doubleAllPointsOnCoinche", ruleset.scoring.doubleAllPointsOnCoinche],
  ] as const) {
    booleanValue(value, label);
  }
  if (
    !ruleset.announcements.enabled
    && (ruleset.announcements.tierce
      || ruleset.announcements.fifty
      || ruleset.announcements.hundred
      || ruleset.announcements.squares)
  ) {
    throw new Error("Invalid ruleset: disabled announcements cannot enable a subtype.");
  }
  if (ruleset.contractSuccess.announcementsCount && !ruleset.announcements.enabled) {
    throw new Error("Invalid ruleset: announcements cannot count when they are disabled.");
  }
  if (ruleset.bidding.allowGenerale) {
    throw new Error("Invalid ruleset: Generale is not implemented yet.");
  }
  nonNegativeInteger(ruleset.belote.points, "belote.points");
  nonNegativeInteger(ruleset.trickScoring.lastTrickBonus, "trickScoring.lastTrickBonus");
  nonNegativeInteger(ruleset.trickScoring.capotLastTrickBonus, "trickScoring.capotLastTrickBonus");
  nonNegativeInteger(ruleset.scoring.failureBasePoints, "scoring.failureBasePoints");
  positiveInteger(ruleset.scoring.capotBasePoints, "scoring.capotBasePoints");
  positiveInteger(ruleset.scoring.coincheMultiplier, "scoring.coincheMultiplier");
  positiveInteger(ruleset.scoring.surcoincheMultiplier, "scoring.surcoincheMultiplier");
  if (ruleset.scoring.surcoincheMultiplier < ruleset.scoring.coincheMultiplier) {
    throw new Error("Invalid ruleset: surcoincheMultiplier cannot be lower than coincheMultiplier.");
  }
  if (!SCORING_MODES.has(ruleset.scoring.mode)) {
    throw new Error(`Invalid ruleset: unsupported scoring mode ${ruleset.scoring.mode}.`);
  }
}
