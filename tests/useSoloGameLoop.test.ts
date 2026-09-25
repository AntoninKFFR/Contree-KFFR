// @vitest-environment jsdom

import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { clonePlayerPreferences } from "@/lib/preferences/playerPreferences";
import { soloBotCollectionKey } from "@/lib/soloBotPacing";
import { useSoloGameLoop } from "@/lib/solo/useSoloGameLoop";

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

function preferences() {
  const value = clonePlayerPreferences();
  value.gameplay.botDelayMs = 40;
  value.gameplay.biddingDelayMs = 25;
  return value;
}

function advance(ms: number) {
  act(() => vi.advanceTimersByTime(ms));
}

type SoloLoop = ReturnType<typeof useSoloGameLoop>;

function driveUntil(result: { current: SoloLoop }, reached: (loop: SoloLoop) => boolean) {
  for (let guard = 0; guard < 200; guard += 1) {
    if (reached(result.current)) return;
    const state = result.current.gameState!;
    if (state.phase === "bidding" && state.currentPlayerId === 0) {
      act(() => result.current.dispatchGameAction(state.bids.length === 0
        ? { type: "bid", playerId: 0, value: 80, trump: "clubs" }
        : { type: "pass", playerId: 0 }));
    } else if (state.phase === "playing" && state.currentPlayerId === 0) {
      // The hook, rather than a simulated click, must play the final human card.
      if (state.completedTricks.length === 7) advance(40);
      else act(() => result.current.dispatchGameAction({
        type: "play-card", playerId: 0, card: result.current.legalHumanCards[0],
      }));
    } else if (state.phase === "playing") {
      const key = soloBotCollectionKey(state, preferences(), false);
      if (key) act(() => result.current.onAutoCollectComplete(key));
      advance(40);
    } else if (state.phase === "bidding") advance(25);
    else break;
  }
  throw new Error(`Unable to reach target Solo state; phase=${result.current.gameState?.phase}`);
}

describe("useSoloGameLoop", () => {
  it("starts and replaces a game, then applies a human GameAction through the engine", () => {
    vi.useFakeTimers();
    vi.spyOn(Math, "random").mockReturnValue(0.1);
    const onGameStart = vi.fn();
    const onBiddingStateChange = vi.fn();
    const { result } = renderHook(() => useSoloGameLoop({
      preferences: preferences(), effectiveReducedMotion: false, onGameStart, onBiddingStateChange,
    }));

    expect(result.current.gameState).toBeNull();
    act(() => result.current.startGame());
    const first = result.current.gameState!;
    expect(first.phase).toBe("bidding");
    expect(first.currentPlayerId).toBe(0);
    act(() => result.current.dispatchGameAction({ type: "bid", playerId: 0, value: 80, trump: "spades" }));
    expect(result.current.gameState!.bids).toEqual([{ action: "bid", playerId: 0, value: 80, trump: "spades" }]);
    expect(onBiddingStateChange).toHaveBeenCalledWith(result.current.gameState);
    act(() => result.current.startGame());
    expect(result.current.gameState!.bids).toHaveLength(0);
    expect(result.current.gameState).not.toBe(first);
    expect(onGameStart).toHaveBeenCalledTimes(2);
  });

  it("keeps the original bidding delay and does not schedule twice on a presentation rerender", () => {
    vi.useFakeTimers();
    vi.spyOn(Math, "random").mockReturnValue(0.1);
    const settings = preferences();
    const onBotDecision = vi.fn();
    const { result, rerender, unmount } = renderHook(
      ({ tableVisible }) => useSoloGameLoop({
        preferences: settings, effectiveReducedMotion: false, tableVisible, onBotDecision,
      }), { initialProps: { tableVisible: true } },
    );
    act(() => result.current.startGame());
    act(() => result.current.dispatchGameAction({ type: "bid", playerId: 0, value: 80, trump: "spades" }));
    const pending = result.current.gameState!;
    expect(pending.currentPlayerId).toBe(1);
    expect(onBotDecision).toHaveBeenCalledTimes(1);
    rerender({ tableVisible: false });
    rerender({ tableVisible: true });
    expect(onBotDecision).toHaveBeenCalledTimes(1);
    advance(24);
    expect(result.current.gameState).toBe(pending);
    advance(1);
    expect(result.current.gameState).not.toBe(pending);
    expect(result.current.gameState!.currentPlayerId).toBe(2);
    unmount();
  });

  it("cancels a pending bot action when a game is replaced or the hook unmounts", () => {
    vi.useFakeTimers();
    vi.spyOn(Math, "random").mockReturnValue(0.1);
    const onBotDecision = vi.fn();
    const { result, unmount } = renderHook(() => useSoloGameLoop({
      preferences: preferences(), effectiveReducedMotion: false, onBotDecision,
    }));
    act(() => result.current.startGame());
    act(() => result.current.dispatchGameAction({ type: "bid", playerId: 0, value: 80, trump: "spades" }));
    advance(10);
    act(() => result.current.startGame());
    const replacement = result.current.gameState;
    advance(100);
    expect(result.current.gameState).toBe(replacement);
    act(() => result.current.dispatchGameAction({ type: "bid", playerId: 0, value: 80, trump: "spades" }));
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("keeps collection gating inside the hook and restores the normal delay on the next bot card", () => {
    vi.useFakeTimers();
    const settings = preferences();
    vi.spyOn(Math, "random").mockReturnValue(0.1);
    const { result } = renderHook(() => useSoloGameLoop({ preferences: settings, effectiveReducedMotion: false }));
    act(() => result.current.startGame());
    driveUntil(result, ({ gameState }) => gameState?.phase === "playing"
      && gameState.currentTrick.cards.length === 0 && gameState.completedTricks.length > 0
      && soloBotCollectionKey(gameState, settings, false) !== null);
    const lead = result.current.gameState!;
    expect(lead.phase).toBe("playing");
    const leadKey = soloBotCollectionKey(lead, settings, false);
    expect(leadKey).not.toBeNull();
    advance(40);
    expect(result.current.gameState).toBe(lead);
    act(() => result.current.onAutoCollectComplete(leadKey!));
    expect(result.current.gameState!.currentTrick.cards).toHaveLength(1);
    const next = result.current.gameState!;
    expect(next.currentPlayerId).not.toBe(0);
    advance(39);
    expect(result.current.gameState).toBe(next);
    advance(1);
    expect(result.current.gameState!.currentTrick.cards).toHaveLength(2);
  });

  it("keeps the forced last human card and next-round transition in the hook", () => {
    vi.useFakeTimers();
    vi.spyOn(Math, "random").mockReturnValue(0.1);
    const { result } = renderHook(() => useSoloGameLoop({
      preferences: preferences(), effectiveReducedMotion: false,
    }));
    act(() => result.current.startGame());
    driveUntil(result, ({ gameState }) => gameState?.phase === "playing"
      && gameState.completedTricks.length === 7 && gameState.currentPlayerId === 0);
    const before = result.current.gameState!;
    expect(before.hands[0]).toHaveLength(1);
    advance(39);
    expect(result.current.gameState).toBe(before);
    advance(1);
    expect(result.current.gameState).not.toBe(before);
    driveUntil(result, ({ gameState }) => gameState?.phase === "finished");
    const round = result.current.gameState!.roundNumber;
    act(() => result.current.startNextRound());
    expect(result.current.gameState!.roundNumber).toBe(round + 1);
    expect(result.current.gameState!.phase).toBe("bidding");
  });

  it.each([
    { label: "manual collection", configure: (value: ReturnType<typeof preferences>) => { value.gameplay.autoCollectTricks = false; }, reduced: false },
    { label: "reduced motion", configure: () => {}, reduced: true },
    { label: "instant", configure: (value: ReturnType<typeof preferences>) => {
      value.gameplay.gameSpeed = "instant";
      value.gameplay.botDelayMs = 0;
      value.gameplay.biddingDelayMs = 0;
      value.gameplay.trickDisplayMs = 0;
    }, reduced: false },
  ])("does not wait for collection in $label", ({ configure, reduced }) => {
    vi.useFakeTimers();
    vi.spyOn(Math, "random").mockReturnValue(0.1);
    const settings = preferences();
    configure(settings);
    const { result } = renderHook(() => useSoloGameLoop({
      preferences: settings, effectiveReducedMotion: reduced,
    }));
    act(() => result.current.startGame());
    // Drive with the actual delays, including a zero-delay instant turn.
    for (let guard = 0; guard < 200; guard += 1) {
      const state = result.current.gameState!;
      if (state.phase === "playing" && state.currentTrick.cards.length === 0
        && state.completedTricks.length > 0 && state.currentPlayerId !== 0) break;
      if (state.phase === "bidding" && state.currentPlayerId === 0) {
        act(() => result.current.dispatchGameAction(state.bids.length === 0
          ? { type: "bid", playerId: 0, value: 80, trump: "clubs" }
          : { type: "pass", playerId: 0 }));
      } else if (state.phase === "playing" && state.currentPlayerId === 0) {
        act(() => result.current.dispatchGameAction({ type: "play-card", playerId: 0, card: result.current.legalHumanCards[0] }));
      } else advance(state.phase === "bidding" ? settings.gameplay.biddingDelayMs : settings.gameplay.botDelayMs);
    }
    const lead = result.current.gameState!;
    expect(lead.phase).toBe("playing");
    expect(lead.currentTrick.cards).toHaveLength(0);
    expect(lead.currentPlayerId).not.toBe(0);
    expect(soloBotCollectionKey(lead, settings, reduced)).toBeNull();
    advance(settings.gameplay.botDelayMs);
    expect(result.current.gameState!.currentTrick.cards).toHaveLength(1);
  });

  it("pauses a pending bot bid, blocks human bidding, then resumes exactly one bid", () => {
    vi.useFakeTimers();
    vi.spyOn(Math, "random").mockReturnValue(0.1);
    const settings = preferences();
    const { result, rerender } = renderHook(({ paused }) => useSoloGameLoop({
      preferences: settings, effectiveReducedMotion: false, paused,
    }), { initialProps: { paused: false } });
    act(() => result.current.startGame());
    rerender({ paused: true });
    expect(result.current.humanCanBid).toBe(false);
    act(() => result.current.dispatchGameAction({ type: "bid", playerId: 0, value: 80, trump: "clubs" }));
    expect(result.current.gameState!.bids).toHaveLength(0);
    rerender({ paused: false });
    act(() => result.current.dispatchGameAction({ type: "bid", playerId: 0, value: 80, trump: "clubs" }));
    const waiting = result.current.gameState!;
    advance(10);
    rerender({ paused: true });
    advance(100);
    expect(result.current.gameState).toBe(waiting);
    expect(vi.getTimerCount()).toBe(0);
    rerender({ paused: false });
    advance(24);
    expect(result.current.gameState).toBe(waiting);
    advance(1);
    expect(result.current.gameState!.bids).toHaveLength(2);
    expect(result.current.gameState!.currentPlayerId).toBe(2);
  });

  it("pauses the automatic human last card and blocks human card actions", () => {
    vi.useFakeTimers();
    vi.spyOn(Math, "random").mockReturnValue(0.1);
    const settings = preferences();
    const { result, rerender } = renderHook(({ paused }) => useSoloGameLoop({
      preferences: settings, effectiveReducedMotion: false, paused,
    }), { initialProps: { paused: false } });
    act(() => result.current.startGame());
    driveUntil(result, ({ gameState }) => gameState?.phase === "playing"
      && gameState.completedTricks.length === 7 && gameState.currentPlayerId === 0);
    const waiting = result.current.gameState!;
    expect(result.current.humanCanPlay).toBe(true);
    rerender({ paused: true });
    expect(result.current.humanCanPlay).toBe(false);
    act(() => result.current.dispatchGameAction({ type: "play-card", playerId: 0, card: waiting.hands[0][0] }));
    advance(100);
    expect(result.current.gameState).toBe(waiting);
    rerender({ paused: false });
    advance(39);
    expect(result.current.gameState).toBe(waiting);
    advance(1);
    expect(result.current.gameState).not.toBe(waiting);
  });

  it("remembers collection completed while paused and lets the winning bot lead after its normal delay", () => {
    vi.useFakeTimers();
    vi.spyOn(Math, "random").mockReturnValue(0.1);
    const settings = preferences();
    const { result, rerender } = renderHook(({ paused }) => useSoloGameLoop({
      preferences: settings, effectiveReducedMotion: false, paused,
    }), { initialProps: { paused: false } });
    act(() => result.current.startGame());
    driveUntil(result, ({ gameState }) => gameState?.phase === "playing"
      && gameState.currentTrick.cards.length === 0 && gameState.completedTricks.length > 0
      && soloBotCollectionKey(gameState, settings, false) !== null);
    const waiting = result.current.gameState!;
    const key = soloBotCollectionKey(waiting, settings, false)!;
    rerender({ paused: true });
    advance(100);
    expect(result.current.gameState).toBe(waiting);
    act(() => result.current.onAutoCollectComplete(key));
    rerender({ paused: false });
    advance(39);
    expect(result.current.gameState).toBe(waiting);
    advance(1);
    expect(result.current.gameState!.currentTrick.cards).toHaveLength(1);
    advance(100);
    expect(result.current.gameState!.currentTrick.cards.length).toBeGreaterThanOrEqual(1);
  });
});
