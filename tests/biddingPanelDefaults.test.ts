import { describe, expect, it } from "vitest";
import { biddingTurnKey, preferredBidMode, shouldInitializeBidMode } from "@/components/BiddingPanel";
import { createInitialGame } from "@/engine/game";
import type { Bid } from "@/engine/types";
import { toPlayerGameView } from "@/engine/views";

describe("contextual bidding defaults", () => {
  it("prioritizes the player's own latest mode over a later partner bid", () => {
    const bids: Bid[] = [
      { action: "bid", playerId: 0, value: 90, contractMode: { kind: "suit", suit: "hearts" }, trump: "hearts" },
      { action: "bid", playerId: 2, value: 100, contractMode: { kind: "suit", suit: "diamonds" }, trump: "diamonds" },
    ];
    expect(preferredBidMode(bids, 0)).toEqual({ kind: "suit", suit: "hearts" });
  });

  it("uses the partner's latest mode when the player has not announced", () => {
    const bids: Bid[] = [
      { action: "bid", playerId: 2, value: 90, contractMode: { kind: "suit", suit: "clubs" }, trump: "clubs" },
      { action: "bid", playerId: 2, value: 100, contractMode: { kind: "suit", suit: "diamonds" }, trump: "diamonds" },
    ];
    expect(preferredBidMode(bids, 0)).toEqual({ kind: "suit", suit: "diamonds" });
  });

  it("ignores opponents and keeps the existing hearts fallback", () => {
    const bids: Bid[] = [{ action: "bid", playerId: 1, value: 100, contractMode: { kind: "suit", suit: "spades" }, trump: "spades" }];
    expect(preferredBidMode(bids, 0)).toEqual({ kind: "suit", suit: "hearts" });
    expect(preferredBidMode([], 0)).toEqual({ kind: "suit", suit: "hearts" });
  });

  it.each([
    ["no-trump", { kind: "no-trump" }],
    ["all-trump", { kind: "all-trump" }],
  ] as const)("preserves a previous %s bid without converting it to a suit", (_label, mode) => {
    const bids: Bid[] = [{ action: "bid", playerId: 0, value: 90, contractMode: mode }];
    expect(preferredBidMode(bids, 0)).toEqual(mode);
  });

  it("does not reinitialize a manual choice during the same turn", () => {
    const key = biddingTurnKey(true, 0, 4);
    expect(shouldInitializeBidMode(null, key)).toBe(true);
    expect(shouldInitializeBidMode(key, key)).toBe(false);
    expect(shouldInitializeBidMode(key, biddingTurnKey(true, 0, 8))).toBe(true);
  });

  it("derives the same public default from solo state and multiplayer view", () => {
    const state = createInitialGame(() => 0.1);
    state.bids = [{ action: "bid", playerId: 2, value: 90, contractMode: { kind: "all-trump" } }];
    const playerView = toPlayerGameView(state, 0);
    expect(preferredBidMode(state.bids, 0)).toEqual(preferredBidMode(playerView.bids, playerView.viewerPlayerId));
  });
});
