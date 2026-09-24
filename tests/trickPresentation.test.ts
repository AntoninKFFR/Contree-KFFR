import { describe, expect, it } from "vitest";
import type { Card, CompletedTrick, PlayedCard, PlayerId } from "@/engine/types";
import {
  observeCompletedTricks,
  currentTrickLeaderId,
  planCardPresentation,
  planTrickLayerPresentations,
  playedCardKey,
  selectVisualTrick,
  selectTrickLayers,
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
  it("keeps the fourth card on its stable key while the next trick grows under manual collection", () => {
    const firstTrick = trick(2);
    const input = { scope: "solo", roundNumber: 1, completedCount: 0, currentCards: firstTrick.cards.slice(0, 3), presented: null };
    const before = selectTrickLayers(input);
    const beforePlan = planTrickLayerPresentations(new Map(), before, true);
    const completed = { key: "completed-1", trickIndex: 1, trick: firstTrick };
    const atFourth = selectTrickLayers({ ...input, completedCount: 1, currentCards: [], presented: completed });
    expect(atFourth.map((layer) => [layer.kind, layer.key])).toEqual([
      ["completed", before[0].key], ["current", "solo-1-2"],
    ]);
    let plan = planTrickLayerPresentations(beforePlan, atFourth, true);
    expect(plan.get(atFourth[0].key)?.newKeys).toEqual([playedCardKey(firstTrick.cards[3])]);
    expect(atFourth.flatMap((layer) => layer.cards.map(playedCardKey))).toHaveLength(4);

    const nextCards: PlayedCard[] = [
      { playerId: 2, card: { rank: "A", suit: "hearts" } },
      { playerId: 3, card: { rank: "10", suit: "hearts" } },
    ];
    for (let count = 1; count <= 2; count += 1) {
      const layers = selectTrickLayers({ ...input, completedCount: 1, currentCards: nextCards.slice(0, count), presented: completed });
      plan = planTrickLayerPresentations(plan, layers, true);
      expect(layers[0].cards).toHaveLength(4);
      expect(layers[1].cards).toHaveLength(count);
      expect(plan.get(layers[0].key)?.newKeys).toEqual([]);
      expect(plan.get(layers[1].key)?.newKeys).toEqual([playedCardKey(nextCards[count - 1])]);
    }
    const afterClick = selectTrickLayers({ ...input, completedCount: 1, currentCards: nextCards, presented: null });
    const afterPlan = planTrickLayerPresentations(plan, afterClick, true);
    expect(afterClick).toHaveLength(1);
    expect(afterClick[0].key).toBe("solo-1-2");
    expect(afterPlan.get(afterClick[0].key)?.newKeys).toEqual([]);
    expect(afterPlan.get(afterClick[0].key)?.animatedKeys).toEqual(plan.get(afterClick[0].key)?.animatedKeys);
  });

  it("shows an optimistic next-trick card immediately and retains it after server confirmation", () => {
    const completed = { key: "completed-1", trickIndex: 1, trick: trick(1) };
    const optimistic: PlayedCard = { playerId: 0, card: { rank: "A", suit: "spades" } };
    const input = { scope: "room-a", roundNumber: 1, completedCount: 1, currentCards: [], presented: completed };
    const pending = selectTrickLayers({ ...input, optimisticCard: optimistic });
    expect(pending[0].cards).toHaveLength(4);
    expect(pending[1].cards).toEqual([optimistic]);
    let plan = planTrickLayerPresentations(new Map(), pending, true);
    expect(plan.get(pending[1].key)?.newKeys).toEqual([playedCardKey(optimistic)]);
    const confirmed = selectTrickLayers({ ...input, currentCards: [{ ...optimistic }], optimisticCard: optimistic });
    expect(confirmed[1].cards).toHaveLength(1);
    plan = planTrickLayerPresentations(plan, confirmed, true);
    expect(plan.get(confirmed[1].key)?.newKeys).toEqual([]);
    expect(plan.get(confirmed[1].key)?.animatedKeys).toEqual([playedCardKey(optimistic)]);
    const settled = selectTrickLayers({ ...input, currentCards: [optimistic], optimisticCard: null });
    expect(planTrickLayerPresentations(plan, settled, true).get(settled[1].key)?.newKeys).toEqual([]);
  });

  it("records every fast next-trick update before the prior trick has finished collecting", () => {
    const completed = { key: "completed-1", trickIndex: 1, trick: trick(2) };
    const next = trick(0, 1).cards.slice(0, 3);
    let plan = new Map();
    for (let count = 0; count <= 3; count += 1) {
      const layers = selectTrickLayers({ scope: "solo", roundNumber: 1, completedCount: 1, currentCards: next.slice(0, count), presented: completed });
      plan = planTrickLayerPresentations(plan, layers, true);
      expect(plan.get(layers[1].key)?.newKeys).toEqual(count === 0 ? [] : [playedCardKey(next[count - 1])]);
    }
  });

  it("keeps a queued completed trick mounted when an even faster round reaches the third trick", () => {
    const first = { key: "completed-1", trickIndex: 1, trick: trick(2) };
    const second = trick(1, 1);
    const common = { scope: "solo", roundNumber: 1, presented: first };
    const partial = selectTrickLayers({ ...common, completedCount: 1, currentCards: second.cards.slice(0, 3) });
    const partialPlan = planTrickLayerPresentations(new Map(), partial, true);
    const queued = selectTrickLayers({ ...common, completedCount: 2, currentCards: [], followingCompletedTricks: [second] });
    expect(queued.map((layer) => [layer.kind, layer.key, layer.cards.length])).toEqual([
      ["completed", "solo-1-1", 4], ["queued", "solo-1-2", 4], ["current", "solo-1-3", 0],
    ]);
    expect(selectTrickLayers({ ...common, completedCount: 2, currentCards: [], followingCompletedTricks: [second],
      optimisticCard: second.cards[3] })[2].cards).toEqual([]);
    const queuedPlan = planTrickLayerPresentations(partialPlan, queued, true);
    expect(queuedPlan.get("solo-1-2")?.newKeys).toEqual([playedCardKey(second.cards[3])]);
    const afterDismissal = selectTrickLayers({ ...common, completedCount: 2, currentCards: [], presented: { key: "completed-2", trickIndex: 2, trick: second } });
    expect(afterDismissal[0].key).toBe(queued[1].key);
    expect(planTrickLayerPresentations(queuedPlan, afterDismissal, true).get("solo-1-2")?.newKeys).toEqual([]);
  });

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
