import { describe, expect, it } from "vitest";
import { getAvailableBidValues } from "@/engine/bidding";
import { createInitialGame, getCurrentContract, makeBid, playCard } from "@/engine/game";
import type { Card, GameState } from "@/engine/types";

function card(rank: Card["rank"], suit: Card["suit"]): Card {
  return { rank, suit };
}

describe("game", () => {
  it("deals 8 cards to each player", () => {
    const state = createInitialGame(() => 0.5);

    expect(state.phase).toBe("bidding");
    expect(state.hands[0]).toHaveLength(8);
    expect(state.hands[1]).toHaveLength(8);
    expect(state.hands[2]).toHaveLength(8);
    expect(state.hands[3]).toHaveLength(8);
  });

  it("moves from bidding to playing with the highest contract", () => {
    const state = createInitialGame(() => 0.5);
    const afterAnto = makeBid(state, 0, { action: "bid", value: 80, trump: "spades" });
    const afterMax = makeBid(afterAnto, 1, { action: "pass" });
    const afterBoulais = makeBid(afterMax, 2, { action: "bid", value: 90, trump: "hearts" });
    const afterAllan = makeBid(afterBoulais, 3, { action: "pass" });
    const afterAntoAgain = makeBid(afterAllan, 0, { action: "pass" });
    const afterMaxAgain = makeBid(afterAntoAgain, 1, { action: "pass" });

    expect(afterMaxAgain.phase).toBe("playing");
    expect(afterMaxAgain.trump).toBe("hearts");
    expect(afterMaxAgain.contract).toMatchObject({
      playerId: 2,
      teamId: 0,
      value: 90,
      trump: "hearts",
    });
  });

  it("lets Anto speak again when someone bids after Anto passed", () => {
    const state = createInitialGame(() => 0.5);
    const afterAnto = makeBid(state, 0, { action: "pass" });
    const afterMax = makeBid(afterAnto, 1, { action: "bid", value: 80, trump: "clubs" });
    const afterBoulais = makeBid(afterMax, 2, { action: "pass" });
    const afterAllan = makeBid(afterBoulais, 3, { action: "pass" });

    expect(afterAllan.phase).toBe("bidding");
    expect(afterAllan.currentPlayerId).toBe(0);
    expect(getAvailableBidValues(getCurrentContract(afterAllan))).toEqual([
      90,
      100,
      110,
      120,
      130,
      140,
      150,
      160,
    ]);

    const afterAntoAgain = makeBid(afterAllan, 0, { action: "bid", value: 90, trump: "hearts" });
    const afterMaxAgain = makeBid(afterAntoAgain, 1, { action: "pass" });
    const afterBoulaisAgain = makeBid(afterMaxAgain, 2, { action: "pass" });
    const afterAllanAgain = makeBid(afterBoulaisAgain, 3, { action: "pass" });

    expect(afterAllanAgain.phase).toBe("playing");
    expect(afterAllanAgain.contract).toMatchObject({
      playerId: 0,
      value: 90,
      trump: "hearts",
    });
  });

  it("finishes the round without points when everybody passes", () => {
    const state = createInitialGame(() => 0.5);
    const afterAnto = makeBid(state, 0, { action: "pass" });
    const afterMax = makeBid(afterAnto, 1, { action: "pass" });
    const afterBoulais = makeBid(afterMax, 2, { action: "pass" });
    const afterAllan = makeBid(afterBoulais, 3, { action: "pass" });

    expect(afterAllan.phase).toBe("finished");
    expect(afterAllan.result).toEqual({
      kind: "all-pass",
      roundScore: { 0: 0, 1: 0 },
    });
  });

  it("moves turn to the next player after a card is played", () => {
    const state = createInitialGame(() => 0.5);
    const afterAnto = makeBid(state, 0, { action: "bid", value: 80, trump: "hearts" });
    const afterMax = makeBid(afterAnto, 1, { action: "pass" });
    const afterBoulais = makeBid(afterMax, 2, { action: "pass" });
    const playingState = makeBid(afterBoulais, 3, { action: "pass" });
    const firstCard = playingState.hands[0][0];
    const nextState = playCard(playingState, 0, firstCard);

    expect(nextState.currentPlayerId).toBe(1);
    expect(nextState.currentTrick.cards).toHaveLength(1);
    expect(nextState.hands[0]).toHaveLength(7);
  });

  it("completes a trick, gives points to the winner team, and lets winner lead", () => {
    const state: GameState = {
      phase: "playing",
      trump: "hearts",
      hands: {
        0: [card("A", "clubs")],
        1: [card("7", "hearts")],
        2: [card("10", "clubs")],
        3: [card("K", "clubs")],
      },
      currentPlayerId: 0,
      currentTrick: { leaderId: 0, cards: [] },
      completedTricks: [],
      bids: [{ playerId: 1, action: "bid", value: 80, trump: "hearts" }],
      contract: { playerId: 1, teamId: 1, value: 80, trump: "hearts" },
      result: null,
      trickPoints: { 0: 0, 1: 0 },
      roundScore: { 0: 0, 1: 0 },
      message: "Test",
    };

    const afterPlayer0 = playCard(state, 0, card("A", "clubs"));
    const afterPlayer1 = playCard(afterPlayer0, 1, card("7", "hearts"));
    const afterPlayer2 = playCard(afterPlayer1, 2, card("10", "clubs"));
    const afterPlayer3 = playCard(afterPlayer2, 3, card("K", "clubs"));

    expect(afterPlayer3.phase).toBe("finished");
    expect(afterPlayer3.completedTricks).toHaveLength(1);
    expect(afterPlayer3.completedTricks[0].winnerId).toBe(1);
    expect(afterPlayer3.trickPoints[1]).toBe(35);
    expect(afterPlayer3.result).toMatchObject({
      kind: "played",
      contractSucceeded: false,
      roundScore: { 0: 242, 1: 0 },
    });
    expect(afterPlayer3.currentPlayerId).toBe(1);
  });
});
