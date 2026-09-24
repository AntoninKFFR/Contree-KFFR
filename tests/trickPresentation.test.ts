import { describe, expect, it } from "vitest";
import type { Card, CompletedTrick, PlayedCard, PlayerId } from "@/engine/types";
import {
  observeCompletedTricks,
  currentTrickLeaderId,
  planCardPresentation,
  playedCardKey,
  selectVisualTrick,
  type TrickObservation,
} from "@/lib/trickPresentation";
import { clonePlayerPreferences } from "@/lib/preferences/playerPreferences";
import { getTrickPresentationPolicy } from "@/lib/preferences/presentation";
import { createInitialGame } from "@/engine/game";

const cards: Card[] = [
  { rank: "7", suit: "clubs" },
  { rank: "8", suit: "clubs" },
  { rank: "9", suit: "clubs" },
  { rank: "J", suit: "clubs" },
];

function trick(winnerId: PlayerId, offset = 0): CompletedTrick {
  return {
    leaderId: 0,
    cards: cards.map((card, index): PlayedCard => ({
      playerId: ((index + offset) % 4) as PlayerId,
      card,
    })),
    winnerId,
    points: 20,
  };
}

function observe(
  previous: TrickObservation | null,
  completedTricks: CompletedTrick[],
  roundNumber = 1,
  scope = "room-a",
) {
  return observeCompletedTricks(previous, { completedTricks, roundNumber, scope });
}

describe("visual completed-trick transition", () => {
  it("animates each new card only once, including the fourth, through collection and the next trick", () => {
    const key = "game-1-trick-1";
    let plan = planCardPresentation(null, key, [], true);
    for (let count = 1; count <= 4; count += 1) {
      const next = planCardPresentation(plan, key, trick(0).cards.slice(0, count), true);
      expect(next.newKeys).toEqual([playedCardKey(trick(0).cards[count - 1])]);
      expect(next.animatedKeys).toHaveLength(count);
      plan = next;
    }
    const collecting = planCardPresentation(plan, key, trick(0).cards, true);
    expect(collecting.newKeys).toEqual([]);
    expect(collecting.animatedKeys).toEqual(plan.animatedKeys);
    const nextFirst: PlayedCard = { playerId: 2, card: { rank: "A", suit: "hearts" } };
    const nextTrick = planCardPresentation(collecting, "game-1-trick-2", [nextFirst], true);
    expect(nextTrick.newKeys).toEqual([playedCardKey(nextFirst)]);
    expect(planCardPresentation(nextTrick, "game-1-trick-2", [nextFirst], true).newKeys).toEqual([]);
  });

  it("keeps an optimistic card as the same visual card when the server confirms it", () => {
    const played = trick(0).cards[0];
    const initial = planCardPresentation(null, "trick-1", [], true);
    const optimistic = planCardPresentation(initial, "trick-1", [played], true, playedCardKey(played));
    const confirmed = planCardPresentation(optimistic, "trick-1", [{ ...played }], true);
    expect(optimistic.newKeys).toEqual([playedCardKey(played)]);
    expect(confirmed.newKeys).toEqual([]);
    expect(confirmed.animatedKeys).toEqual(optimistic.animatedKeys);
  });

  it("keeps reduced-motion card positions without an entry animation", () => {
    const initial = planCardPresentation(null, "trick-1", [], false);
    const reduced = planCardPresentation(initial, "trick-1", trick(0).cards.slice(0, 1), false);
    expect(reduced.seenKeys).toHaveLength(1);
    expect(reduced.newKeys).toHaveLength(1);
    expect(reduced.animatedKeys).toEqual([]);
    expect(planCardPresentation(reduced, "trick-1", trick(0).cards.slice(0, 1), true).animatedKeys).toEqual([]);
  });

  it("keeps P on the actual leader until the next trick starts", () => {
    const state = createInitialGame(() => 0.1);
    state.phase = "playing";
    state.startingPlayerId = 0;
    state.currentPlayerId = 1;
    state.currentTrick = { leaderId: 1, cards: [] };
    expect(currentTrickLeaderId(state)).toBe(1);
    for (let count = 1; count <= 4; count += 1) {
      state.currentTrick.cards = trick(2, 1).cards.slice(0, count);
      state.currentPlayerId = ((count + 1) % 4) as PlayerId;
      expect(currentTrickLeaderId(state)).toBe(1);
    }
    state.currentTrick.cards = [];
    state.currentPlayerId = 3;
    expect(currentTrickLeaderId(state)).toBe(3);
    state.currentTrick.cards = [{ playerId: 3, card: cards[0] }];
    state.currentPlayerId = 0;
    expect(currentTrickLeaderId(state)).toBe(3);
  });
  it("uses the preference-controlled client-only presentation window", () => {
    expect(getTrickPresentationPolicy(clonePlayerPreferences()).delayMs).toBe(1_800);
  });

  it("does not replay historical tricks on refresh or reconnection", () => {
    const initial = observe(null, [trick(0)]);
    expect(initial.reset).toBe(true);
    expect(initial.additions).toEqual([]);
  });

  it("keeps each newly completed four-card trick available for presentation", () => {
    const initial = observe(null, []);
    const completed = observe(initial.observation, [trick(2)]);
    expect(completed.additions).toHaveLength(1);
    expect(completed.additions[0].trick.cards).toHaveLength(4);
    expect(completed.additions[0].trick.winnerId).toBe(2);
  });

  it("queues multiple authoritative completions without discarding the latest state", () => {
    const initial = observe(null, []);
    const first = trick(0);
    const second = trick(1, 1);
    const update = observe(initial.observation, [first, second]);
    expect(update.additions.map((item) => item.trick)).toEqual([first, second]);
    expect(update.observation.completedCount).toBe(2);
  });

  it("does not create a new presentation when only the current server trick changes", () => {
    const first = trick(0);
    const initial = observe(null, [first]);
    const unchanged = observe(initial.observation, [first]);
    expect(unchanged.additions).toEqual([]);
  });

  it("shows the held completed trick, then reveals the latest server trick unchanged", () => {
    const completed = trick(2);
    const held = observe(observe(null, []).observation, [completed]).additions[0];
    const nextServerCard: PlayedCard = { playerId: 2, card: { rank: "A", suit: "hearts" } };
    expect(selectVisualTrick([nextServerCard], held)).toMatchObject({
      cards: completed.cards, completed: true, winnerId: 2,
    });
    expect(selectVisualTrick([nextServerCard], null)).toEqual({
      cards: [nextServerCard], completed: false, winnerId: null,
    });
  });

  it.each([
    { roundNumber: 2, scope: "room-a", label: "new round" },
    { roundNumber: 1, scope: "room-b", label: "room navigation" },
  ])("resets pending presentation on $label", ({ roundNumber, scope }) => {
    const initial = observe(null, [trick(0)]);
    const reset = observe(initial.observation, [], roundNumber, scope);
    expect(reset.reset).toBe(true);
    expect(reset.additions).toEqual([]);
  });
});
