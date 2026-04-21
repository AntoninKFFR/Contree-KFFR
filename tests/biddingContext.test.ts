import { describe, expect, it } from "vitest";
import {
  bidStrengthFromValue,
  buildBiddingContext,
  getLastBidAnnouncement,
  getLastOpponentBidAnnouncement,
  getLastPartnerBidAnnouncement,
} from "@/bots/strategy/biddingContext";
import type { GameState } from "@/engine/types";

function createBiddingState(bids: GameState["bids"], currentPlayerId: GameState["currentPlayerId"]): GameState {
  return {
    settings: { scoringMode: "made-points", targetScore: 1000 },
    phase: "bidding",
    roundNumber: 1,
    startingPlayerId: 0,
    totalScore: { 0: 0, 1: 0 },
    roundHistory: [],
    winnerTeam: null,
    trump: null,
    hands: {
      0: [],
      1: [],
      2: [],
      3: [],
    },
    currentPlayerId,
    currentTrick: { leaderId: 0, cards: [] },
    completedTricks: [],
    bids,
    contract: null,
    result: null,
    trickPoints: { 0: 0, 1: 0 },
    roundScore: { 0: 0, 1: 0 },
    message: "Test",
  };
}

describe("bidding context", () => {
  it("classifies bid strength from bid value", () => {
    expect(bidStrengthFromValue(80)).toBe("weak");
    expect(bidStrengthFromValue(100)).toBe("medium");
    expect(bidStrengthFromValue(130)).toBe("strong");
  });

  it("detects an opening with no previous bid", () => {
    const state = createBiddingState([], 0);
    const context = buildBiddingContext(state);

    expect(context.isOpening).toBe(true);
    expect(context.partnerHasBid).toBe(false);
    expect(context.opponentHasBid).toBe(false);
    expect(context.lastBid).toBeNull();
  });

  it("detects partner support context when the current camp already owns the auction", () => {
    const state = createBiddingState(
      [
        { playerId: 2, action: "bid", value: 90, trump: "hearts" },
        { playerId: 3, action: "pass" },
      ],
      0,
    );
    const context = buildBiddingContext(state);

    expect(getLastPartnerBidAnnouncement(state)).toMatchObject({
      playerId: 2,
      value: 90,
      trump: "hearts",
      strength: "weak",
    });
    expect(context.isSupportingPartner).toBe(true);
    expect(context.partnerHasBid).toBe(true);
    expect(context.partnerStrength).toBe("weak");
  });

  it("detects contesting an opponent contract and late bidding", () => {
    const state = createBiddingState(
      [
        { playerId: 1, action: "bid", value: 100, trump: "clubs" },
        { playerId: 2, action: "bid", value: 110, trump: "hearts" },
        { playerId: 3, action: "bid", value: 120, trump: "spades" },
        { playerId: 0, action: "pass" },
      ],
      2,
    );
    const context = buildBiddingContext(state);

    expect(getLastBidAnnouncement(state)).toMatchObject({
      playerId: 3,
      value: 120,
      trump: "spades",
      strength: "strong",
    });
    expect(getLastOpponentBidAnnouncement(state)).toMatchObject({
      playerId: 3,
      value: 120,
      trump: "spades",
    });
    expect(context.isContestingOpponent).toBe(true);
    expect(context.opponentHasBid).toBe(true);
    expect(context.opponentOpened).toBe(true);
    expect(context.opponentHasOvercalled).toBe(true);
    expect(context.isLateBidding).toBe(true);
    expect(context.opponentStrength).toBe("strong");
  });
});
