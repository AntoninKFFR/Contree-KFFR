import type { BidValue, Contract } from "./types";

export const BID_VALUES: BidValue[] = [80, 90, 100, 110, 120, 130, 140, 150, 160];

export function getAvailableBidValues(currentContract: Contract | null): BidValue[] {
  return BID_VALUES.filter((value) => !currentContract || value > currentContract.value);
}
