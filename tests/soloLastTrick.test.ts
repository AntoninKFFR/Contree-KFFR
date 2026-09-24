import { afterEach, describe, expect, it, vi } from "vitest";
import { activePlayersForRound } from "@/engine/activePlayers";
import { createInitialGame, makeBid, playCard, playableCardsForCurrentPlayer } from "@/engine/game";
import type { Card, GameState } from "@/engine/types";
import { forcedHumanLastCard, isForcedLastTrick, queueForcedHumanLastCard } from "@/lib/soloLastTrick";

afterEach(() => vi.useRealTimers());

function beforeFinalTrick(): GameState {
  let state = createInitialGame(() => 0.1);
  state = makeBid(state, state.currentPlayerId, { action: "bid", value: 80, trump: "clubs" });
  for (let index = 0; index < 3; index += 1) state = makeBid(state, state.currentPlayerId, { action: "pass" });
  while (state.phase === "playing" && state.completedTricks.length < 7) {
    state = playCard(state, state.currentPlayerId, playableCardsForCurrentPlayer(state)[0]);
  }
  expect(state.phase).toBe("playing");
  expect(state.completedTricks).toHaveLength(7);
  return state;
}

describe("forced final Solo trick", () => {
  it("recognizes one card per active player, including a three-player Générale", () => {
    const state = beforeFinalTrick();
    expect(isForcedLastTrick(state)).toBe(true);
    expect(activePlayersForRound(state)).toEqual([0, 1, 2, 3]);
    const generale = structuredClone(state);
    generale.contract = { ...state.contract!, kind: "generale", value: 500, playerId: 0 };
    generale.hands[2] = [{ rank: "7", suit: "clubs" }, { rank: "8", suit: "clubs" }];
    expect(activePlayersForRound(generale)).toEqual([0, 1, 3]);
    expect(isForcedLastTrick(generale)).toBe(true);
  });

  it("plays one engine action per visual tick without a human click or duplicate play", () => {
    vi.useFakeTimers();
    const initial = beforeFinalTrick();
    let manual = initial;
    while (manual.phase === "playing") manual = playCard(manual, manual.currentPlayerId, playableCardsForCurrentPlayer(manual)[0]);

    let state = initial;
    const snapshots: Array<{ cards: number; tricks: number; playerId: number }> = [];
    const schedule = () => {
      if (state.phase !== "playing") return;
      const expected = state;
      const commit = (card: Card) => {
        if (state !== expected) return;
        const playerId = state.currentPlayerId;
        state = playCard(state, playerId, card);
        snapshots.push({ cards: state.currentTrick.cards.length, tricks: state.completedTricks.length, playerId });
        schedule();
      };
      if (state.currentPlayerId === 0) queueForcedHumanLastCard(state, 0, 40, (_current, card) => commit(card));
      else setTimeout(() => commit(playableCardsForCurrentPlayer(state)[0]), 40);
    };
    schedule();
    expect(snapshots).toEqual([]);
    for (let index = 1; index <= 4; index += 1) {
      vi.advanceTimersByTime(40);
      expect(snapshots).toHaveLength(index);
    }
    expect(snapshots.map((snapshot) => snapshot.cards)).toEqual([1, 2, 3, 0]);
    expect(snapshots.map((snapshot) => snapshot.playerId)).toEqual(manual.completedTricks[7].cards.map((played) => played.playerId));
    expect(state.completedTricks).toHaveLength(8);
    expect(state.completedTricks[7].cards).toHaveLength(4);
    expect(activePlayersForRound(state).every((playerId) => state.hands[playerId].length === 0)).toBe(true);
    expect(state.roundScore).toEqual(manual.roundScore);
    expect(state.trickPoints).toEqual(manual.trickPoints);
    expect(state.phase).toBe(manual.phase);
    vi.advanceTimersByTime(500);
    expect(snapshots).toHaveLength(4);
  });

  it("cancels a pending automatic human play when its state is replaced", () => {
    vi.useFakeTimers();
    const state = beforeFinalTrick();
    state.currentPlayerId = 0;
    const committed = vi.fn();
    const cancel = queueForcedHumanLastCard(state, 0, 40, committed);
    cancel();
    vi.advanceTimersByTime(40);
    expect(committed).not.toHaveBeenCalled();
    expect(forcedHumanLastCard(state, 0)).toEqual(state.hands[0][0]);
  });
});
