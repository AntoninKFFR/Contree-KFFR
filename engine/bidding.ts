import { playerTeam } from "./rules";
import { CONTREE_KFFR_RULESET } from "./rulesets/presets";
import type { GameRulesetSnapshot } from "./rulesets/types";
import type { BidValue, Contract, PlayerId } from "./types";

export const BID_VALUES: BidValue[] = [80, 90, 100, 110, 120, 130, 140, 150, 160];

type BiddingRules = GameRulesetSnapshot["bidding"];

export function isAllowedBidValue(
  value: unknown,
  rules: BiddingRules = CONTREE_KFFR_RULESET.bidding,
): value is BidValue {
  return typeof value === "number"
    && BID_VALUES.includes(value as BidValue)
    && value >= rules.minBid
    && value <= rules.maxBid
    && (value - rules.minBid) % rules.bidStep === 0;
}

export function getAvailableBidValues(
  currentContract: Contract | null,
  rules: BiddingRules = CONTREE_KFFR_RULESET.bidding,
): BidValue[] {
  if (currentContract && currentContract.status !== "normal") {
    return [];
  }

  return BID_VALUES.filter((value) =>
    isAllowedBidValue(value, rules)
      && (!currentContract || (currentContract.kind !== "capot" && currentContract.kind !== "generale" && value > currentContract.value)));
}

export function canBidCapot(
  currentContract: Contract | null,
  rules: BiddingRules = CONTREE_KFFR_RULESET.bidding,
): boolean {
  return rules.allowCapot
    && (!currentContract || (currentContract.status === "normal" && currentContract.kind !== "capot" && currentContract.kind !== "generale"));
}

export function canBidGenerale(
  currentContract: Contract | null,
  rules: BiddingRules = CONTREE_KFFR_RULESET.bidding,
): boolean {
  return rules.allowGenerale
    && (!currentContract || (currentContract.status === "normal" && currentContract.kind !== "generale"));
}

export function canBidGeneraleMode(
  mode: import("./types").ContractMode,
  rules: BiddingRules,
): boolean {
  if (mode.kind === "no-trump") return rules.allowNoTrump && rules.generaleAllowNoTrump;
  if (mode.kind === "all-trump") return rules.allowAllTrump && rules.generaleAllowAllTrump;
  return true;
}

export function canCoinche(
  playerId: PlayerId,
  contract: Contract | null,
  rules: BiddingRules = CONTREE_KFFR_RULESET.bidding,
): boolean {
  return Boolean(
    rules.allowCoinche &&
      contract &&
      contract.status === "normal" &&
      playerTeam(playerId) !== contract.teamId,
  );
}

export function canSurcoinche(
  playerId: PlayerId,
  contract: Contract | null,
  rules: BiddingRules = CONTREE_KFFR_RULESET.bidding,
): boolean {
  return Boolean(
    rules.allowSurcoinche &&
      contract &&
      contract.status === "coinched" &&
      playerTeam(playerId) === contract.teamId,
  );
}
