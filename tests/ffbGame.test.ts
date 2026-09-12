import { describe, expect, it } from "vitest";
import { playCard } from "@/engine/game";
import { emptyBeloteState } from "@/engine/belote";
import type { Card, CompletedTrick, GameState, PlayerId, Rank, Suit } from "@/engine/types";

function card(rank: Rank, suit: Suit): Card {
  return { rank, suit };
}

function playingState(overrides: Partial<GameState> = {}): GameState {
  return {
    settings: { scoringMode: "ffb", targetScore: 1000 },
    phase: "playing",
    roundNumber: 1,
    startingPlayerId: 0,
    totalScore: { 0: 0, 1: 0 },
    roundHistory: [],
    winnerTeam: null,
    trump: "hearts",
    hands: { 0: [], 1: [], 2: [], 3: [] },
    currentPlayerId: 0,
    currentTrick: { leaderId: 0, cards: [] },
    completedTricks: [],
    bids: [{ playerId: 0, action: "bid", value: 80, trump: "hearts" }],
    contract: { kind: "points", playerId: 0, teamId: 0, value: 80, trump: "hearts", status: "normal" },
    result: null,
    trickPoints: { 0: 0, 1: 0 },
    announcements: { declarations: [], declaredPlayerIds: [], winningTeam: null, pointsByTeam: { 0: 0, 1: 0 } },
    belote: emptyBeloteState(),
    roundScore: { 0: 0, 1: 0 },
    message: "Test FFB",
    ...overrides,
  };
}

function play(state: GameState, playerId: PlayerId, selected: Card): GameState {
  return playCard(state, playerId, selected);
}

describe("FFB game integration", () => {
  it.each([
    {
      label: "a tierce",
      hand: [card("7", "clubs"), card("8", "clubs"), card("9", "clubs")],
    },
    {
      label: "a square of jacks",
      hand: [card("J", "clubs"), card("J", "diamonds"), card("J", "hearts"), card("J", "spades")],
    },
    {
      label: "five consecutive cards",
      hand: [card("7", "clubs"), card("8", "clubs"), card("9", "clubs"), card("10", "clubs"), card("J", "clubs")],
    },
  ])("does not detect or award $label", ({ hand }) => {
    const state = play(playingState({
      hands: { 0: hand, 1: [], 2: [], 3: [] },
    }), 0, hand[0]);

    expect(state.announcements).toEqual({
      declarations: [], declaredPlayerIds: [], winningTeam: null, pointsByTeam: { 0: 0, 1: 0 },
    });
  });

  it("tracks belote then rebelote as their cards are played", () => {
    let state = playingState({
      hands: {
        0: [card("Q", "hearts"), card("K", "hearts")],
        1: [card("7", "clubs"), card("8", "clubs")],
        2: [card("8", "diamonds"), card("9", "diamonds")],
        3: [card("9", "clubs"), card("10", "clubs")],
      },
    });
    state = play(state, 0, card("Q", "hearts"));
    expect(state.belote).toMatchObject({ declaration: { firstRank: "Q", completed: false } });
    state = play(state, 1, card("7", "clubs"));
    state = play(state, 2, card("8", "diamonds"));
    state = play(state, 3, card("9", "clubs"));
    state = play(state, 0, card("K", "hearts"));
    expect(state.belote).toMatchObject({
      declaration: { playerId: 0, teamId: 0, completed: true },
      pointsByTeam: { 0: 20, 1: 0 },
    });
  });

  it("awards 100 for the final trick and 252 trick points for a realized capot", () => {
    const priorTricks: CompletedTrick[] = Array.from({ length: 7 }, (_, index) => ({
      leaderId: 0,
      cards: [],
      winnerId: 0,
      points: index === 0 ? 152 : 0,
    }));
    let state = playingState({
      hands: {
        0: [card("7", "clubs")],
        1: [card("8", "clubs")],
        2: [card("9", "clubs")],
        3: [card("7", "diamonds")],
      },
      completedTricks: priorTricks,
      trickPoints: { 0: 152, 1: 0 },
    });
    state = play(state, 0, card("7", "clubs"));
    state = play(state, 1, card("8", "clubs"));
    state = play(state, 2, card("9", "clubs"));
    state = play(state, 3, card("7", "diamonds"));
    expect(state.completedTricks.at(-1)?.points).toBe(100);
    expect(state.trickPoints).toEqual({ 0: 252, 1: 0 });
    expect(state.result).toMatchObject({ capotTeam: 0, trickPointsByTeam: { 0: 252, 1: 0 } });
  });

  it("does not validate the target through belote alone when the takers fall", () => {
    let state = playingState({
      totalScore: { 0: 990, 1: 0 },
      hands: {
        0: [card("7", "clubs")],
        1: [card("A", "clubs")],
        2: [card("8", "clubs")],
        3: [card("9", "clubs")],
      },
      trickPoints: { 0: 60, 1: 71 },
      belote: {
        declaration: { playerId: 0, teamId: 0, firstRank: "Q", completed: true },
        pointsByTeam: { 0: 20, 1: 0 },
      },
    });
    state = play(state, 0, card("7", "clubs"));
    state = play(state, 1, card("A", "clubs"));
    state = play(state, 2, card("8", "clubs"));
    state = play(state, 3, card("9", "clubs"));
    expect(state.result).toMatchObject({ contractSucceeded: false, roundScore: { 0: 20, 1: 240 } });
    expect(state.totalScore).toEqual({ 0: 1010, 1: 240 });
    expect(state.phase).toBe("finished");
    expect(state.winnerTeam).toBeNull();
  });
});
