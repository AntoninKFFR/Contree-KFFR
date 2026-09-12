import { describe, expect, it } from "vitest";
import {
  declareAnnouncementsForPlayer,
  detectAnnouncements,
  resolveAnnouncements,
} from "@/engine/announcements";
import type { Card, CardAnnouncement, PlayerId, Rank, Suit } from "@/engine/types";
import { createTestRuleset, rulesetWithAnnouncements } from "@/tests/helpers/rulesets";

function card(rank: Rank, suit: Suit): Card {
  return { rank, suit };
}

function announcement(
  playerId: PlayerId,
  value: CardAnnouncement["value"],
  details: Partial<CardAnnouncement> = {},
): CardAnnouncement {
  return {
    playerId,
    teamId: playerId % 2 as 0 | 1,
    type: value === 20 ? "tierce" : value === 50 ? "fifty" : value === 100 ? "hundred" : "square",
    value,
    ...details,
  };
}

describe("configurable card announcements", () => {
  it("detects no tierce when announcements are disabled", () => {
    expect(detectAnnouncements(
      [card("7", "clubs"), card("8", "clubs"), card("9", "clubs")],
      0,
      "hearts",
    )).toEqual([]);
  });

  it.each([
    { ranks: ["7", "8", "9"] as Rank[], type: "tierce", value: 20 },
    { ranks: ["9", "10", "J", "Q"] as Rank[], type: "fifty", value: 50 },
    { ranks: ["9", "10", "J", "Q", "K"] as Rank[], type: "hundred", value: 100 },
  ])("detects $type when its option is enabled", ({ ranks, type, value }) => {
    expect(detectAnnouncements(
      ranks.map((rank) => card(rank, "clubs")),
      0,
      "hearts",
      rulesetWithAnnouncements.announcements,
    )).toEqual([expect.objectContaining({ type, value, highestRank: ranks.at(-1) })]);
  });

  it.each([
    { rank: "J" as Rank, value: 200 },
    { rank: "9" as Rank, value: 150 },
    { rank: "A" as Rank, value: 100 },
    { rank: "10" as Rank, value: 100 },
    { rank: "K" as Rank, value: 100 },
    { rank: "Q" as Rank, value: 100 },
  ])("scores the square of $rank at $value", ({ rank, value }) => {
    expect(detectAnnouncements(
      (["clubs", "diamonds", "hearts", "spades"] as Suit[]).map((suit) => card(rank, suit)),
      0,
      "hearts",
      rulesetWithAnnouncements.announcements,
    )).toEqual([expect.objectContaining({ type: "square", squareRank: rank, value })]);
  });

  it("honors every announcement subtype independently", () => {
    const tierceAndSquares = createTestRuleset({
      announcements: { enabled: true, tierce: true, fifty: false, hundred: false, squares: true },
    }).announcements;
    expect(detectAnnouncements(
      [card("7", "clubs"), card("8", "clubs"), card("9", "clubs")],
      0,
      "hearts",
      tierceAndSquares,
    )).toHaveLength(1);
    expect(detectAnnouncements(
      [card("9", "clubs"), card("10", "clubs"), card("J", "clubs"), card("Q", "clubs")],
      0,
      "hearts",
      tierceAndSquares,
    )).toEqual([]);
    expect(detectAnnouncements(
      [card("A", "clubs"), card("A", "diamonds"), card("A", "hearts"), card("A", "spades")],
      0,
      "hearts",
      tierceAndSquares,
    )).toHaveLength(1);
  });

  it("does not count one card in both a square and a sequence", () => {
    const hand = [
      card("Q", "clubs"), card("Q", "diamonds"), card("Q", "hearts"), card("Q", "spades"),
      card("9", "clubs"), card("10", "clubs"), card("J", "clubs"), card("K", "clubs"),
    ];
    expect(detectAnnouncements(hand, 0, "hearts", rulesetWithAnnouncements.announcements))
      .toEqual([expect.objectContaining({ type: "square", squareRank: "Q", value: 100 })]);
  });

  it("resolves by value, nature, height and trump, with no winner on an exact tie", () => {
    expect(resolveAnnouncements([
      announcement(0, 100, { type: "hundred", suit: "clubs", highestRank: "A" }),
      announcement(1, 100, { type: "square", squareRank: "Q" }),
    ], [0, 1, 2, 3], "hearts").winningTeam).toBe(1);
    expect(resolveAnnouncements([
      announcement(0, 20, { suit: "clubs", highestRank: "A" }),
      announcement(1, 20, { suit: "spades", highestRank: "K" }),
    ], [0, 1, 2, 3], "spades").winningTeam).toBe(0);
    expect(resolveAnnouncements([
      announcement(0, 20, { suit: "clubs", highestRank: "A" }),
      announcement(1, 20, { suit: "hearts", highestRank: "A" }),
    ], [0, 1, 2, 3], "hearts").winningTeam).toBe(1);
    expect(resolveAnnouncements([
      announcement(0, 20, { suit: "clubs", highestRank: "A" }),
      announcement(1, 20, { suit: "spades", highestRank: "A" }),
    ], [0, 1, 2, 3], "hearts").pointsByTeam).toEqual({ 0: 0, 1: 0 });
  });

  it("awards every non-overlapping declaration of the winning team", () => {
    const resolved = resolveAnnouncements([
      announcement(0, 50, { suit: "clubs", highestRank: "Q" }),
      announcement(2, 20, { suit: "diamonds", highestRank: "J" }),
      announcement(1, 20, { suit: "hearts", highestRank: "A" }),
    ], [0, 1, 2, 3], "hearts");
    expect(resolved).toMatchObject({ winningTeam: 0, pointsByTeam: { 0: 70, 1: 0 } });
  });

  it("declares once per player and resolves as soon as all four players declared", () => {
    let state = declareAnnouncementsForPlayer(
      undefined,
      [card("7", "clubs"), card("8", "clubs"), card("9", "clubs")],
      0,
      "hearts",
      rulesetWithAnnouncements.announcements,
    );
    expect(declareAnnouncementsForPlayer(
      state, [], 0, "hearts", rulesetWithAnnouncements.announcements,
    )).toEqual(state);
    for (const playerId of [1, 2, 3] as PlayerId[]) {
      state = declareAnnouncementsForPlayer(
        state, [], playerId, "hearts", rulesetWithAnnouncements.announcements,
      );
    }
    expect(state).toMatchObject({ declaredPlayerIds: [0, 1, 2, 3], winningTeam: 0, pointsByTeam: { 0: 20, 1: 0 } });
  });
});
