import { formatContractLabel, formatContractMode, resolveContractMode } from "../../engine/contractMode";
import type { Bid, Contract, PlayerId } from "../../engine/types";
export type AnnouncementBubbleContent = {
  label: string;
  detail?: string;
  tone: "neutral" | "accent";
};

export function formatBidLabel(bid: Bid): AnnouncementBubbleContent {
  if (bid.action === "pass") {
    return { label: "Passe", tone: "neutral" };
  }

  if (bid.action === "coinche") {
    return { label: "Coinche", tone: "accent" };
  }

  if (bid.action === "surcoinche") {
    return { label: "Surcoinche", tone: "accent" };
  }

  if (bid.action === "capot") {
    return { label: `Capot ${formatContractMode(resolveContractMode(bid)!)}`, tone: "accent" };
  }

  if (bid.action === "generale") {
    return { label: `Générale ${formatContractMode(resolveContractMode(bid)!)}`, tone: "accent" };
  }

  return {
    label: `${bid.value} ${formatContractMode(resolveContractMode(bid)!)}`,
    tone: "accent",
  };
}

export function formatFinalContract(contract: Contract): AnnouncementBubbleContent {
  const label = formatContractLabel(contract);
  if (contract.status === "surcoinched") {
    return {
      label,
      detail: "Surcoinchee",
      tone: "accent",
    };
  }

  if (contract.status === "coinched") {
    return {
      label,
      detail: "Coinchee",
      tone: "accent",
    };
  }

  return {
    label,
    tone: "accent",
  };
}

export function dominantBidPlayerId(bids: Bid[]): PlayerId | null {
  for (let index = bids.length - 1; index >= 0; index -= 1) {
    const bid = bids[index];
    if (bid.action === "bid" || bid.action === "capot" || bid.action === "generale") {
      return bid.playerId;
    }
  }

  return null;
}
