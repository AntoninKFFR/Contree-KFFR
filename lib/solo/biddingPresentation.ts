import { formatContractLabel, formatContractMode, resolveContractMode } from "../../engine/contractMode";
import type { Bid, Contract, ContractMode, PlayerId } from "../../engine/types";
import type { PlayerPreferences } from "../preferences/playerPreferences";
export type ConfirmableBidAction = "coinche" | "surcoinche" | "capot" | "generale";

export function shouldConfirmBidAction(action: ConfirmableBidAction, preferences: PlayerPreferences): boolean {
  return action === "coinche" ? preferences.gameplay.confirmCoinche
    : action === "surcoinche" ? preferences.gameplay.confirmSurcoinche
      : action === "capot" ? preferences.gameplay.confirmCapot
        : preferences.gameplay.confirmGenerale;
}

export function bidConfirmationMessage(action: ConfirmableBidAction, contract: Contract | null, mode: ContractMode): string {
  if (action === "coinche") return `Coincher ${contract ? formatContractLabel(contract) : "ce contrat"} ?`;
  if (action === "surcoinche") return `Surcoincher ${contract ? formatContractLabel(contract) : "ce contrat"} ?`;
  return `Annoncer ${action === "capot" ? "un Capot" : "une Générale"} ${formatContractMode(mode)} ?`;
}

function lastBidModeFor(bids: Bid[], playerId: PlayerId): ContractMode | null {
  for (let index = bids.length - 1; index >= 0; index -= 1) {
    const bid = bids[index];
    if (bid.playerId !== playerId || bid.action === "pass" || bid.action === "coinche" || bid.action === "surcoinche") continue;
    const mode = resolveContractMode(bid);
    if (mode) return mode;
  }
  return null;
}

export function preferredBidMode(bids: Bid[], playerId: PlayerId, fallback: ContractMode = { kind: "suit", suit: "hearts" }): ContractMode {
  const ownMode = lastBidModeFor(bids, playerId);
  if (ownMode) return ownMode;
  const partnerId = ((playerId + 2) % 4) as PlayerId;
  return lastBidModeFor(bids, partnerId) ?? fallback;
}

export function biddingTurnKey(canBid: boolean, playerId: PlayerId | undefined, bidCount: number): string | null {
  return canBid && playerId !== undefined ? `${playerId}:${bidCount}` : null;
}

export function shouldInitializeBidMode(initializedTurnKey: string | null, currentTurnKey: string | null): boolean {
  return currentTurnKey !== null && initializedTurnKey !== currentTurnKey;
}
