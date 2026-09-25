import { afterEach, describe, expect, it, vi } from "vitest";
import { createInitialGame, makeBid, playCard, playableCardsForCurrentPlayer } from "@/engine/game";
import type { GameState } from "@/engine/types";
import { clonePlayerPreferences, GAME_SPEED_PRESETS, type PresetGameSpeed } from "@/lib/preferences/playerPreferences";
import { scheduleSoloBotTurn, soloBotCollectionKey } from "@/lib/soloBotPacing";

afterEach(() => vi.useRealTimers());

function botWinnerStartingNextTrick(): GameState {
  for (const seed of [0.1, 0.2, 0.3, 0.4, 0.5]) {
    let state = createInitialGame(() => seed);
    state = makeBid(state, state.currentPlayerId, { action: "bid", value: 80, trump: "clubs" });
    for (let index = 0; index < 3; index += 1) state = makeBid(state, state.currentPlayerId, { action: "pass" });
    while (state.phase === "playing") {
      state = playCard(state, state.currentPlayerId, playableCardsForCurrentPlayer(state)[0]);
      if (state.currentTrick.cards.length === 0 && state.completedTricks.length > 0
        && (state.currentPlayerId === 1 || state.currentPlayerId === 2)) return state;
    }
  }
  throw new Error("Seeded Solo positions did not produce a bot lead.");
}

function preferencesFor(speed: PresetGameSpeed) {
  const preferences = clonePlayerPreferences();
  preferences.gameplay.gameSpeed = speed;
  Object.assign(preferences.gameplay, GAME_SPEED_PRESETS[speed]);
  return preferences;
}

describe("Solo bot lead after a completed trick", () => {
  it.each(["slow", "normal", "fast"] as const)("waits for automatic collection in %s, then restores the usual bot delay", (speed) => {
    vi.useFakeTimers();
    const preferences = preferencesFor(speed);
    let state = botWinnerStartingNextTrick();
    const completedCount = state.completedTricks.length;
    const winner = state.completedTricks.at(-1)!.winnerId;
    expect(state.currentPlayerId).toBe(winner);
    const key = soloBotCollectionKey(state, preferences, false);
    expect(key).not.toBeNull();
    const first = scheduleSoloBotTurn(preferences.gameplay.botDelayMs, key, () => {
      state = playCard(state, state.currentPlayerId, playableCardsForCurrentPlayer(state)[0]);
    });

    vi.advanceTimersByTime(preferences.gameplay.botDelayMs);
    expect(state.currentTrick.cards).toHaveLength(0);
    expect(state.completedTricks).toHaveLength(completedCount);
    first.autoCollected("another-trick");
    expect(state.currentTrick.cards).toHaveLength(0);
    first.autoCollected(key!);
    expect(state.currentTrick.cards).toHaveLength(1);
    expect(state.currentTrick.cards[0].playerId).toBe(winner);
    expect(state.completedTricks).toHaveLength(completedCount);

    expect(soloBotCollectionKey(state, preferences, false)).toBeNull();
    expect(state.currentPlayerId).not.toBe(0);
    const second = scheduleSoloBotTurn(preferences.gameplay.botDelayMs, null, () => {
      state = playCard(state, state.currentPlayerId, playableCardsForCurrentPlayer(state)[0]);
    });
    if (preferences.gameplay.botDelayMs > 0) {
      vi.advanceTimersByTime(preferences.gameplay.botDelayMs - 1);
      expect(state.currentTrick.cards).toHaveLength(1);
      vi.advanceTimersByTime(1);
    } else vi.runOnlyPendingTimers();
    expect(state.currentTrick.cards).toHaveLength(2);
    first.cancel();
    second.cancel();
  });

  it("does not add a collection pause to instant or reduced-motion play", () => {
    vi.useFakeTimers();
    const state = botWinnerStartingNextTrick();
    const instant = preferencesFor("instant");
    expect(soloBotCollectionKey(state, instant, false)).toBeNull();
    const instantReady = vi.fn();
    scheduleSoloBotTurn(instant.gameplay.botDelayMs, soloBotCollectionKey(state, instant, false), instantReady);
    vi.runOnlyPendingTimers();
    expect(instantReady).toHaveBeenCalledOnce();

    const slow = preferencesFor("slow");
    slow.visual.reducedMotion = true;
    expect(soloBotCollectionKey(state, slow, true)).toBeNull();
    const reducedReady = vi.fn();
    scheduleSoloBotTurn(slow.gameplay.botDelayMs, soloBotCollectionKey(state, slow, true), reducedReady);
    vi.advanceTimersByTime(slow.gameplay.botDelayMs);
    expect(reducedReady).toHaveBeenCalledOnce();
  });

  it("preserves manual collection and cancels stale bot turns", () => {
    vi.useFakeTimers();
    const state = botWinnerStartingNextTrick();
    const manual = preferencesFor("fast");
    manual.gameplay.autoCollectTricks = false;
    expect(soloBotCollectionKey(state, manual, false)).toBeNull();
    const ready = vi.fn();
    scheduleSoloBotTurn(manual.gameplay.botDelayMs, null, ready);
    vi.advanceTimersByTime(manual.gameplay.botDelayMs);
    expect(ready).toHaveBeenCalledOnce();

    const cancelled = vi.fn();
    const pending = scheduleSoloBotTurn(manual.gameplay.botDelayMs, "previous-trick", cancelled);
    pending.cancel();
    vi.runOnlyPendingTimers();
    pending.autoCollected("previous-trick");
    expect(cancelled).not.toHaveBeenCalled();
  });

  it("keeps the normal bot delay when collection finishes first and releases a pending turn if collection is disabled", () => {
    vi.useFakeTimers();
    const ready = vi.fn();
    const earlyCollection = scheduleSoloBotTurn(700, "finished-trick", ready);
    earlyCollection.autoCollected("finished-trick");
    vi.advanceTimersByTime(699);
    expect(ready).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(ready).toHaveBeenCalledOnce();
    earlyCollection.autoCollected("finished-trick");
    expect(ready).toHaveBeenCalledOnce();

    const released = vi.fn();
    const manualSwitch = scheduleSoloBotTurn(300, "another-trick", released);
    vi.advanceTimersByTime(300);
    expect(released).not.toHaveBeenCalled();
    manualSwitch.releaseCollection();
    expect(released).toHaveBeenCalledOnce();
  });
});
