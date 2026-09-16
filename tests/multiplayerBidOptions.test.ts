import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { BiddingPanel } from "@/components/BiddingPanel";
import { BID_VALUES, getAvailableBidValues, getCurrentContractFromBids } from "@/engine/bidding";
import { createInitialGame, getCurrentContract, makeBid } from "@/engine/game";
import { resolveGameRules } from "@/engine/rulesets/resolve";
import type { GameState, PlayerId } from "@/engine/types";
import { toPlayerGameView } from "@/engine/views";

function optionsFromMultiplayerView(state: GameState, viewerId: PlayerId = state.currentPlayerId) {
  const view = toPlayerGameView(state, viewerId);
  const currentContract = getCurrentContractFromBids(view.bids);
  expect(currentContract).toEqual(getCurrentContract(state));
  return getAvailableBidValues(currentContract, resolveGameRules(view.settings).bidding);
}

describe("multiplayer auction options match solo", () => {
  it("offers all numeric values before any bid, then starts at 90 after an 80 bid", () => {
    const initial = createInitialGame(() => 0.1);
    expect(optionsFromMultiplayerView(initial)).toEqual(BID_VALUES);
    const after80 = makeBid(initial, 0, { action: "bid", value: 80, trump: "hearts" });
    expect(after80.phase).toBe("bidding");
    expect(toPlayerGameView(after80, 1).contract).toBeNull();
    expect(optionsFromMultiplayerView(after80, 1)).toEqual([90, 100, 110, 120, 130, 140, 150, 160]);

    const view = toPlayerGameView(after80, 1);
    const markup = renderToStaticMarkup(React.createElement(BiddingPanel, {
      bids: view.bids,
      canBid: true,
      canCoinche: true,
      canSurcoinche: false,
      currentContract: getCurrentContractFromBids(view.bids),
      biddingRules: resolveGameRules(view.settings).bidding,
      onBid: () => undefined,
      onCapot: () => undefined,
      onGenerale: () => undefined,
      onCoinche: () => undefined,
      onPass: () => undefined,
      onSurcoinche: () => undefined,
      playerId: 1,
    }));
    expect(markup).toContain('aria-label="Valeur 90"');
    expect(markup).not.toContain('aria-label="Valeur 80"');
  });

  it("starts at 100 after 90, leaves only 160 after 150, and none after 160", () => {
    let state = createInitialGame(() => 0.1);
    state = makeBid(state, 0, { action: "bid", value: 90, trump: "clubs" });
    expect(optionsFromMultiplayerView(state, 1)).toEqual([100, 110, 120, 130, 140, 150, 160]);
    state = makeBid(state, 1, { action: "bid", value: 150, trump: "spades" });
    expect(optionsFromMultiplayerView(state, 2)).toEqual([160]);
    state = makeBid(state, 2, { action: "bid", value: 160, trump: "diamonds" });
    expect(optionsFromMultiplayerView(state, 3)).toEqual([]);
  });

  it("offers no numeric bid after Capot, counter or overcounter", () => {
    let state = createInitialGame(() => 0.1);
    state = makeBid(state, 0, { action: "capot", trump: "hearts" });
    expect(optionsFromMultiplayerView(state, 1)).toEqual([]);
    state = makeBid(state, 1, { action: "coinche" });
    expect(getCurrentContractFromBids(toPlayerGameView(state, 2).bids)?.status).toBe("coinched");
    expect(optionsFromMultiplayerView(state, 2)).toEqual([]);
    state = makeBid(state, 2, { action: "surcoinche" });
    expect(getCurrentContractFromBids(toPlayerGameView(state, 3).bids)?.status).toBe("surcoinched");
    expect(optionsFromMultiplayerView(state, 3)).toEqual([]);
  });

  it("allows a player who passed to speak again, but only above the current bid", () => {
    let state = createInitialGame(() => 0.1);
    state = makeBid(state, 0, { action: "pass" });
    state = makeBid(state, 1, { action: "bid", value: 80, trump: "clubs" });
    state = makeBid(state, 2, { action: "pass" });
    state = makeBid(state, 3, { action: "pass" });
    expect(state.phase).toBe("bidding");
    expect(state.currentPlayerId).toBe(0);
    expect(optionsFromMultiplayerView(state, 0)).toEqual([90, 100, 110, 120, 130, 140, 150, 160]);
  });
});
