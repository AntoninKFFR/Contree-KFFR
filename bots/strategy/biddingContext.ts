import { playerTeam } from "@/engine/rules";
import type { Bid, BidValue, GameState, PlayerId, Suit } from "@/engine/types";

export type BidStrength = "weak" | "medium" | "strong";

export type BidAnnouncement = {
  playerId: PlayerId;
  teamId: ReturnType<typeof playerTeam>;
  value: BidValue;
  trump: Suit;
  strength: BidStrength;
};

export type BiddingContext = {
  lastBid: BidAnnouncement | null;
  lastPartnerBid: BidAnnouncement | null;
  lastOpponentBid: BidAnnouncement | null;
  isOpening: boolean;
  isSupportingPartner: boolean;
  isContestingOpponent: boolean;
  isLateBidding: boolean;
  partnerHasBid: boolean;
  opponentHasBid: boolean;
  opponentOpened: boolean;
  opponentHasOvercalled: boolean;
  partnerStrength: BidStrength | null;
  opponentStrength: BidStrength | null;
};

function isBidAnnouncement(bid: Bid): bid is Extract<Bid, { action: "bid" }> {
  return bid.action === "bid";
}

export function bidStrengthFromValue(value: BidValue): BidStrength {
  if (value >= 120) return "strong";
  if (value >= 100) return "medium";
  return "weak";
}

export function toBidAnnouncement(bid: Extract<Bid, { action: "bid" }>): BidAnnouncement {
  return {
    playerId: bid.playerId,
    teamId: playerTeam(bid.playerId),
    value: bid.value,
    trump: bid.trump,
    strength: bidStrengthFromValue(bid.value),
  };
}

export function getBidAnnouncements(state: GameState): BidAnnouncement[] {
  return state.bids.filter(isBidAnnouncement).map(toBidAnnouncement);
}

export function getLastBidAnnouncement(state: GameState): BidAnnouncement | null {
  const bids = getBidAnnouncements(state);
  return bids.at(-1) ?? null;
}

export function getLastPartnerBidAnnouncement(state: GameState): BidAnnouncement | null {
  const currentTeam = playerTeam(state.currentPlayerId);
  const bids = getBidAnnouncements(state).filter((bid) => bid.teamId === currentTeam);
  return bids.at(-1) ?? null;
}

export function getLastOpponentBidAnnouncement(state: GameState): BidAnnouncement | null {
  const currentTeam = playerTeam(state.currentPlayerId);
  const bids = getBidAnnouncements(state).filter((bid) => bid.teamId !== currentTeam);
  return bids.at(-1) ?? null;
}

export function hasPartnerBid(state: GameState): boolean {
  return getLastPartnerBidAnnouncement(state) !== null;
}

export function hasOpponentBid(state: GameState): boolean {
  return getLastOpponentBidAnnouncement(state) !== null;
}

export function isOpeningSituation(state: GameState): boolean {
  return getBidAnnouncements(state).length === 0;
}

export function isSupportingPartnerSituation(state: GameState): boolean {
  const lastBid = getLastBidAnnouncement(state);
  const lastPartnerBid = getLastPartnerBidAnnouncement(state);

  return Boolean(lastBid && lastPartnerBid && lastBid.teamId === playerTeam(state.currentPlayerId));
}

export function isContestingOpponentSituation(state: GameState): boolean {
  const lastBid = getLastBidAnnouncement(state);
  return Boolean(lastBid && lastBid.teamId !== playerTeam(state.currentPlayerId));
}

export function isLateBiddingSituation(state: GameState): boolean {
  const lastBid = getLastBidAnnouncement(state);
  return state.bids.length >= 4 || Boolean(lastBid && lastBid.value >= 120);
}

export function hasOpponentOpened(state: GameState): boolean {
  const firstBid = getBidAnnouncements(state)[0];
  return Boolean(firstBid && firstBid.teamId !== playerTeam(state.currentPlayerId));
}

export function hasOpponentOvercalled(state: GameState): boolean {
  const currentTeam = playerTeam(state.currentPlayerId);
  const announcements = getBidAnnouncements(state);
  const partnerIndex = announcements.findIndex((bid) => bid.teamId === currentTeam);

  if (partnerIndex === -1) return false;

  return announcements.slice(partnerIndex + 1).some((bid) => bid.teamId !== currentTeam);
}

export function buildBiddingContext(state: GameState): BiddingContext {
  const lastBid = getLastBidAnnouncement(state);
  const lastPartnerBid = getLastPartnerBidAnnouncement(state);
  const lastOpponentBid = getLastOpponentBidAnnouncement(state);

  return {
    lastBid,
    lastPartnerBid,
    lastOpponentBid,
    isOpening: isOpeningSituation(state),
    isSupportingPartner: isSupportingPartnerSituation(state),
    isContestingOpponent: isContestingOpponentSituation(state),
    isLateBidding: isLateBiddingSituation(state),
    partnerHasBid: hasPartnerBid(state),
    opponentHasBid: hasOpponentBid(state),
    opponentOpened: hasOpponentOpened(state),
    opponentHasOvercalled: hasOpponentOvercalled(state),
    partnerStrength: lastPartnerBid?.strength ?? null,
    opponentStrength: lastOpponentBid?.strength ?? null,
  };
}
