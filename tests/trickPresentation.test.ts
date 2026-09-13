import { describe, expect, it } from "vitest";
import type { Card, CompletedTrick, PlayedCard, PlayerId } from "@/engine/types";
import {
  observeCompletedTricks,
  selectVisualTrick,
  type TrickObservation,
} from "@/lib/trickPresentation";
import { clonePlayerPreferences } from "@/lib/preferences/playerPreferences";
import { getTrickPresentationPolicy } from "@/lib/preferences/presentation";

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
  it("uses the preference-controlled client-only presentation window", () => {
    expect(getTrickPresentationPolicy(clonePlayerPreferences()).delayMs).toBe(1_200);
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
