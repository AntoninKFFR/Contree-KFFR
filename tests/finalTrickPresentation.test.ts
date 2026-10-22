import { describe, expect, it, vi } from "vitest";
import { completedTrickKey, isResultPresentationPending, observeCompletedTricks, pendingTricksForState, scheduleTrickCollection, type TrickPresentationClock, type PresentedTrick } from "@/lib/trickPresentation";
import states from "../apps/mobile/tests/final-trick/states.json";
import type { PlayerGameView } from "@/engine/views";
import { GAME_SPEED_PRESETS } from "@/lib/preferences/playerPreferences";

const game = states.game.after[0].game! as PlayerGameView;
const final = game.completedTricks.at(-1)!;
const presented: PresentedTrick = { key: completedTrickKey(game.roundNumber, 8, final), trickIndex: 8, trick: final };
describe("authoritative final trick presentation", () => {
  it("observes a real third-to-fourth-card transition and blocks the result until its queue drains", () => {
    const previous = observeCompletedTricks(null, { scope: "game", roundNumber: game.roundNumber, completedTricks: game.completedTricks.slice(0, 7) });
    const next = observeCompletedTricks(previous.observation, { scope: "game", roundNumber: game.roundNumber, completedTricks: game.completedTricks });
    expect(next.additions).toEqual([presented]);
    expect(isResultPresentationPending(game, presented)).toBe(true);
    expect(isResultPresentationPending(game, null)).toBe(false);
  });
  it("does not replay historical tricks on a late join, new game or new round", () => {
    for (const previous of [null, { scope: "other", roundNumber: game.roundNumber, completedCount: 7 }, { scope: "game", roundNumber: game.roundNumber - 1, completedCount: 7 }]) {
      expect(observeCompletedTricks(previous, { scope: "game", roundNumber: game.roundNumber, completedTricks: game.completedTricks }).additions).toEqual([]);
    }
  });
  it("keeps only the actual last trick on terminal catch-up, and bypasses collection on forfeit", () => {
    const backlog = game.completedTricks.map((trick, i) => ({ trick, trickIndex: i + 1, key: completedTrickKey(game.roundNumber, i + 1, trick) }));
    expect(pendingTricksForState(backlog.slice(0, 3), backlog.slice(3), game)).toEqual([presented]);
    expect(pendingTricksForState([presented], [], { ...game, endReason: "forfeit" })).toEqual([]);
    expect(isResultPresentationPending({ ...game, endReason: "forfeit" }, presented)).toBe(false);
  });
  it.each(Object.entries(GAME_SPEED_PRESETS).filter(([name]) => name !== "instant"))("uses one existing %s collection deadline, without stacking another result delay", (_name, policy) => {
    vi.useFakeTimers(); const done = vi.fn();
    try {
      const clock: TrickPresentationClock = { wait: (ms, callback) => { const t = setTimeout(callback, ms); return () => clearTimeout(t); }, frame: () => { throw new Error("Timed mode must not request frames"); } };
      const cancel = scheduleTrickCollection(policy.trickDisplayMs, done, clock);
      expect(vi.getTimerCount()).toBe(1);
      vi.advanceTimersByTime(policy.trickDisplayMs - 1); expect(done).not.toHaveBeenCalled();
      vi.advanceTimersByTime(1); expect(done).toHaveBeenCalledOnce();
      cancel(); expect(vi.getTimerCount()).toBe(0);
    } finally { vi.useRealTimers(); }
  });
  it("instant mode paints the confirmed four cards before opening a result, and cancels either frame", () => {
    for (const interrupt of [0, 1, 2]) {
      const frames = new Map<number, () => void>(); let nextId = 0; const done = vi.fn();
      const clock: TrickPresentationClock = { wait: () => { throw new Error("No arbitrary instant timeout"); }, frame: (callback) => { const id = ++nextId; frames.set(id, callback); return () => { frames.delete(id); }; } };
      const tick = () => { const callbacks = [...frames.values()]; frames.clear(); callbacks.forEach((callback) => callback()); };
      const cancel = scheduleTrickCollection(0, done, clock);
      if (interrupt >= 1) tick(); expect(done).not.toHaveBeenCalled();
      if (interrupt === 2) tick();
      cancel(); tick(); expect(done).toHaveBeenCalledTimes(interrupt === 2 ? 1 : 0); expect(frames.size).toBe(0);
    }
  });
  it("ignores an already queued timeout or frame even when the platform cancellation arrives too late", () => {
    for (const delay of [0, 1200]) {
      const queued: (() => void)[] = [], done = vi.fn();
      const enqueue = (callback: () => void) => { queued.push(callback); return () => {}; };
      const clock: TrickPresentationClock = { wait: (_ms, callback) => enqueue(callback), frame: enqueue };
      const cancel = scheduleTrickCollection(delay, done, clock);
      if (delay === 0) queued.shift()!(); // first frame already reached
      cancel(); queued.forEach((callback) => callback());
      expect(done).not.toHaveBeenCalled();
    }
  });
});
