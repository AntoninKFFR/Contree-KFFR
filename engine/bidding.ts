import { playerTeam } from "./rules";
import type { BidValue, Contract, PlayerId } from "./types";

export const BID_VALUES: BidValue[] = [80, 90, 100, 110, 120, 130, 140, 150, 160];

export function isAllowedBidValue(value: unknown): value is BidValue {
  return typeof value === "number" && BID_VALUES.includes(value as BidValue);
}

export function getAvailableBidValues(currentContract: Contract | null): BidValue[] {
  if (currentContract && currentContract.status !== "normal") {
    return [];
  }

  return BID_VALUES.filter((value) => !currentContract || value > currentContract.value);
}

export function canBidCapot(currentContract: Contract | null): boolean {
  return !currentContract || (currentContract.status === "normal" && currentContract.kind !== "capot");
}

export function canCoinche(playerId: PlayerId, contract: Contract | null): boolean {
  return Boolean(
    contract &&
      contract.status === "normal" &&
      playerTeam(playerId) !== contract.teamId,
  );
}

export function canSurcoinche(playerId: PlayerId, contract: Contract | null): boolean {
  return Boolean(
    contract &&
      contract.status === "coinched" &&
      playerTeam(playerId) === contract.teamId,
  );
}
