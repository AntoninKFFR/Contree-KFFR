import type { GameRulesetSnapshot } from "./types";

const SCORING_MODES = new Set(["ffb", "contract-only", "points-only"]);

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
  if (
    !ruleset.announcements.enabled
    && (ruleset.announcements.tierce
      || ruleset.announcements.fifty
      || ruleset.announcements.hundred
      || ruleset.announcements.squares)
  ) {
    throw new Error("Invalid ruleset: disabled announcements cannot enable a subtype.");
  }
  if (ruleset.announcements.enabled) {
    throw new Error("Invalid ruleset: card announcements are not implemented yet.");
  }
  if (ruleset.contractSuccess.announcementsCount) {
    throw new Error("Invalid ruleset: announcement points cannot count while announcements are unavailable.");
  }
  if (ruleset.bidding.allowNoTrump || ruleset.bidding.allowAllTrump || ruleset.bidding.allowGenerale) {
    throw new Error("Invalid ruleset: No Trump, All Trump and Generale are not implemented yet.");
  }
  nonNegativeInteger(ruleset.belote.points, "belote.points");
  nonNegativeInteger(ruleset.trickScoring.lastTrickBonus, "trickScoring.lastTrickBonus");
  nonNegativeInteger(ruleset.trickScoring.capotLastTrickBonus, "trickScoring.capotLastTrickBonus");
  nonNegativeInteger(ruleset.scoring.failureBasePoints, "scoring.failureBasePoints");
  positiveInteger(ruleset.scoring.capotBasePoints, "scoring.capotBasePoints");
  positiveInteger(ruleset.scoring.coincheMultiplier, "scoring.coincheMultiplier");
  positiveInteger(ruleset.scoring.surcoincheMultiplier, "scoring.surcoincheMultiplier");
  if (!SCORING_MODES.has(ruleset.scoring.mode)) {
    throw new Error(`Invalid ruleset: unsupported scoring mode ${ruleset.scoring.mode}.`);
  }
}
