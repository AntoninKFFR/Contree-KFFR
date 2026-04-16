import { playerTeam } from "./rules";
import type { BidValue, Contract, PlayerId } from "./types";

export const BID_VALUES: BidValue[] = [80, 90, 100, 110, 120, 130, 140, 150, 160];

export function getAvailableBidValues(currentContract: Contract | null): BidValue[] {
  return BID_VALUES.filter((value) => !currentContract || value > currentContract.value);
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
