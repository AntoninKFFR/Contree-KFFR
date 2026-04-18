import { describe, expect, it } from "vitest";
import { getAvailableBidValues } from "@/engine/bidding";
import {
  createInitialGame,
  getCurrentContract,
  makeBid,
  playCard,
  startNextRound,
} from "@/engine/game";
import type { Card, GameState } from "@/engine/types";

function card(rank: Card["rank"], suit: Card["suit"]): Card {
  return { rank, suit };
}

describe("game", () => {
  it("deals 8 cards to each player", () => {
    const state = createInitialGame(() => 0.5);

    expect(state.phase).toBe("bidding");
    expect(state.startingPlayerId).toBe(2);
    expect(state.currentPlayerId).toBe(2);
    expect(state.hands[0]).toHaveLength(8);
    expect(state.hands[1]).toHaveLength(8);
    expect(state.hands[2]).toHaveLength(8);
    expect(state.hands[3]).toHaveLength(8);
  });

  it("chooses a random starting player for the first round", () => {
    expect(createInitialGame(() => 0.1).startingPlayerId).toBe(0);
    expect(createInitialGame(() => 0.4).startingPlayerId).toBe(1);
    expect(createInitialGame(() => 0.7).startingPlayerId).toBe(2);
    expect(createInitialGame(() => 0.9).startingPlayerId).toBe(3);
  });

  it("keeps Moi as human and gives bots unique random names", () => {
    const state = createInitialGame(() => 0.1);

    expect(state.playerNames?.[0]).toBe("Moi");

    const botNames = [state.playerNames?.[1], state.playerNames?.[2], state.playerNames?.[3]];
    expect(new Set(botNames).size).toBe(3);
    expect(botNames).not.toContain("Moi");
  });

  it("moves from bidding to playing with the highest contract", () => {
    const state = createInitialGame(() => 0.1);
    const afterMoi = makeBid(state, 0, { action: "bid", value: 80, trump: "spades" });
    const afterMax = makeBid(afterMoi, 1, { action: "pass" });
    const afterBoulais = makeBid(afterMax, 2, { action: "bid", value: 90, trump: "hearts" });
    const afterAllan = makeBid(afterBoulais, 3, { action: "pass" });
    const afterMoiAgain = makeBid(afterAllan, 0, { action: "pass" });
    const afterMaxAgain = makeBid(afterMoiAgain, 1, { action: "pass" });

    expect(afterMaxAgain.phase).toBe("playing");
    expect(afterMaxAgain.trump).toBe("hearts");
    expect(afterMaxAgain.contract).toMatchObject({
      playerId: 2,
      teamId: 0,
      value: 90,
      trump: "hearts",
      status: "normal",
    });
    expect(afterMaxAgain.currentPlayerId).toBe(2);
    expect(afterMaxAgain.currentTrick.leaderId).toBe(2);
  });

  it("lets Moi speak again when someone bids after Moi passed", () => {
    const state = createInitialGame(() => 0.1);
    const afterMoi = makeBid(state, 0, { action: "pass" });
    const afterMax = makeBid(afterMoi, 1, { action: "bid", value: 80, trump: "clubs" });
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

    const afterMoiAgain = makeBid(afterAllan, 0, { action: "bid", value: 90, trump: "hearts" });
    const afterMaxAgain = makeBid(afterMoiAgain, 1, { action: "pass" });
    const afterBoulaisAgain = makeBid(afterMaxAgain, 2, { action: "pass" });
    const afterAllanAgain = makeBid(afterBoulaisAgain, 3, { action: "pass" });

    expect(afterAllanAgain.phase).toBe("playing");
    expect(afterAllanAgain.contract).toMatchObject({
      playerId: 0,
      value: 90,
      trump: "hearts",
      status: "normal",
    });
    expect(afterAllanAgain.currentPlayerId).toBe(0);
  });

  it("finishes the round without points when everybody passes", () => {
    const state = createInitialGame(() => 0.1);
    const afterMoi = makeBid(state, 0, { action: "pass" });
    const afterMax = makeBid(afterMoi, 1, { action: "pass" });
    const afterBoulais = makeBid(afterMax, 2, { action: "pass" });
    const afterAllan = makeBid(afterBoulais, 3, { action: "pass" });

    expect(afterAllan.phase).toBe("finished");
    expect(afterAllan.result).toEqual({
      kind: "all-pass",
      roundScore: { 0: 0, 1: 0 },
    });
  });

  it("moves turn to the next player after a card is played", () => {
    const state = createInitialGame(() => 0.1);
    const afterMoi = makeBid(state, 0, { action: "bid", value: 80, trump: "hearts" });
    const afterMax = makeBid(afterMoi, 1, { action: "pass" });
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
      settings: { scoringMode: "made-points", targetScore: 1000 },
      phase: "playing",
      roundNumber: 1,
      startingPlayerId: 0,
      totalScore: { 0: 0, 1: 0 },
      roundHistory: [],
      winnerTeam: null,
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
      contract: { playerId: 1, teamId: 1, value: 80, trump: "hearts", status: "normal" },
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
    expect(afterPlayer3.totalScore).toEqual({ 0: 242, 1: 0 });
    expect(afterPlayer3.roundHistory).toHaveLength(1);
    expect(afterPlayer3.currentPlayerId).toBe(1);
  });

  it("starts a next round while keeping total score and history", () => {
    const firstRoundFinished = createInitialGame(() => 0.1, { targetScore: 1000 });
    const finishedState: GameState = {
      ...firstRoundFinished,
      phase: "finished",
      roundNumber: 1,
      roundScore: { 0: 120, 1: 40 },
      totalScore: { 0: 120, 1: 40 },
      roundHistory: [
        {
          roundNumber: 1,
          result: {
            kind: "all-pass",
            roundScore: { 0: 120, 1: 40 },
          },
          totalScoreAfterRound: { 0: 120, 1: 40 },
        },
      ],
    };

    const nextRound = startNextRound(finishedState, () => 0.5);

    expect(nextRound.phase).toBe("bidding");
    expect(nextRound.roundNumber).toBe(2);
    expect(nextRound.startingPlayerId).toBe(1);
    expect(nextRound.currentPlayerId).toBe(1);
    expect(nextRound.totalScore).toEqual({ 0: 120, 1: 40 });
    expect(nextRound.roundHistory).toHaveLength(1);
    expect(nextRound.roundScore).toEqual({ 0: 0, 1: 0 });
    expect(nextRound.playerNames).toEqual(finishedState.playerNames);
  });

  it("ends the game when a team reaches the target score", () => {
    const state: GameState = {
      settings: { scoringMode: "made-points", targetScore: 200 },
      phase: "playing",
      roundNumber: 1,
      startingPlayerId: 0,
      totalScore: { 0: 0, 1: 0 },
      roundHistory: [],
      winnerTeam: null,
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
      contract: { playerId: 1, teamId: 1, value: 80, trump: "hearts", status: "normal" },
      result: null,
      trickPoints: { 0: 0, 1: 0 },
      roundScore: { 0: 0, 1: 0 },
      message: "Test",
    };

    const afterPlayer0 = playCard(state, 0, card("A", "clubs"));
    const afterPlayer1 = playCard(afterPlayer0, 1, card("7", "hearts"));
    const afterPlayer2 = playCard(afterPlayer1, 2, card("10", "clubs"));
    const afterPlayer3 = playCard(afterPlayer2, 3, card("K", "clubs"));

    expect(afterPlayer3.phase).toBe("game-over");
    expect(afterPlayer3.winnerTeam).toBe(0);
    expect(afterPlayer3.totalScore).toEqual({ 0: 242, 1: 0 });
  });

  it("allows an opponent to coinche and contract team to surcoinche", () => {
    const state = createInitialGame(() => 0.1);
    const afterMoi = makeBid(state, 0, { action: "bid", value: 80, trump: "hearts" });
    const afterMaxCoinche = makeBid(afterMoi, 1, { action: "coinche" });
    const afterBoulaisSurcoinche = makeBid(afterMaxCoinche, 2, { action: "surcoinche" });

    expect(getCurrentContract(afterMaxCoinche)).toMatchObject({
      status: "coinched",
      coinchedBy: 1,
    });
    expect(getCurrentContract(afterBoulaisSurcoinche)).toMatchObject({
      status: "surcoinched",
      coinchedBy: 1,
      surcoinchedBy: 2,
    });
    expect(afterBoulaisSurcoinche.phase).toBe("playing");
  });

  it("blocks normal bids after a coinche", () => {
    const state = createInitialGame(() => 0.1);
    const afterMoi = makeBid(state, 0, { action: "bid", value: 80, trump: "hearts" });
    const afterMaxCoinche = makeBid(afterMoi, 1, { action: "coinche" });

    expect(getAvailableBidValues(getCurrentContract(afterMaxCoinche))).toEqual([]);
    expect(() =>
      makeBid(afterMaxCoinche, 2, { action: "bid", value: 90, trump: "spades" }),
    ).toThrow("A normal bid is not allowed after a contract has been countered.");
  });

  it("starts playing when the contract holder accepts a coinche by passing", () => {
    const state = createInitialGame(() => 0.1);
    const afterMoi = makeBid(state, 0, { action: "bid", value: 80, trump: "hearts" });
    const afterMaxCoinche = makeBid(afterMoi, 1, { action: "coinche" });
    const afterBoulais = makeBid(afterMaxCoinche, 2, { action: "pass" });
    const afterAllan = makeBid(afterBoulais, 3, { action: "pass" });
    const afterMoiPass = makeBid(afterAllan, 0, { action: "pass" });

    expect(afterMoiPass.phase).toBe("playing");
    expect(afterMoiPass.contract).toMatchObject({
      playerId: 0,
      status: "coinched",
    });
  });
});
