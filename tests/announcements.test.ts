import { describe, expect, it } from "vitest";
import {
  declareAnnouncementsForPlayer,
  detectAnnouncements,
  emptyBeloteState,
  playBeloteCard,
  resolveAnnouncements,
} from "@/engine/announcements";
import type { Card, CardAnnouncement, PlayerId, Rank, Suit } from "@/engine/types";

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

describe("FFB announcements", () => {
  it.each([
    { ranks: ["7", "8", "9"] as Rank[], type: "tierce", value: 20 },
    { ranks: ["9", "10", "J", "Q"] as Rank[], type: "fifty", value: 50 },
    { ranks: ["9", "10", "J", "Q", "K"] as Rank[], type: "hundred", value: 100 },
    { ranks: ["8", "9", "10", "J", "Q", "K"] as Rank[], type: "hundred", value: 100 },
  ])("detects one $type for a maximal consecutive run", ({ ranks, type, value }) => {
    const detected = detectAnnouncements(ranks.map((rank) => card(rank, "clubs")), 0, "hearts");
    expect(detected).toEqual([
      expect.objectContaining({ type, value, suit: "clubs", highestRank: ranks.at(-1) }),
    ]);
  });

  it.each([
    { rank: "J" as Rank, value: 200 },
    { rank: "9" as Rank, value: 150 },
    { rank: "A" as Rank, value: 100 },
    { rank: "10" as Rank, value: 100 },
    { rank: "K" as Rank, value: 100 },
    { rank: "Q" as Rank, value: 100 },
  ])("scores the square of $rank at $value", ({ rank, value }) => {
    const detected = detectAnnouncements(
      (["clubs", "diamonds", "hearts", "spades"] as Suit[]).map((suit) => card(rank, suit)),
      0,
      "hearts",
    );
    expect(detected).toEqual([
      expect.objectContaining({ type: "square", squareRank: rank, value }),
    ]);
  });

  it.each(["7", "8"] as Rank[])("does not score a square of %s", (rank) => {
    expect(detectAnnouncements(
      (["clubs", "diamonds", "hearts", "spades"] as Suit[]).map((suit) => card(rank, suit)),
      0,
      "hearts",
    )).toEqual([]);
  });

  it("does not count one card in both a square and a sequence", () => {
    const hand = [
      card("Q", "clubs"), card("Q", "diamonds"), card("Q", "hearts"), card("Q", "spades"),
      card("9", "clubs"), card("10", "clubs"), card("J", "clubs"), card("K", "clubs"),
    ];
    expect(detectAnnouncements(hand, 0, "hearts")).toEqual([
      expect.objectContaining({ type: "square", squareRank: "Q", value: 100 }),
    ]);
  });

  it("compares value, square priority, height, trump, then cancels an exact tie", () => {
    const declarations = [
      announcement(0, 100, { type: "hundred", suit: "clubs", highestRank: "A" }),
      announcement(1, 100, { type: "square", squareRank: "Q" }),
    ];
    expect(resolveAnnouncements(declarations, [0, 1, 2, 3], "hearts")).toMatchObject({
      winningTeam: 1,
      pointsByTeam: { 0: 0, 1: 100 },
    });

    const higherSequence = [
      announcement(0, 20, { suit: "clubs", highestRank: "A" }),
      announcement(1, 20, { suit: "spades", highestRank: "K" }),
    ];
    expect(resolveAnnouncements(higherSequence, [0, 1, 2, 3], "spades").winningTeam).toBe(0);

    const trumpWins = [
      announcement(0, 20, { suit: "clubs", highestRank: "A" }),
      announcement(1, 20, { suit: "hearts", highestRank: "A" }),
    ];
    expect(resolveAnnouncements(trumpWins, [0, 1, 2, 3], "hearts").winningTeam).toBe(1);

    const tied = [
      announcement(0, 20, { suit: "clubs", highestRank: "A" }),
      announcement(1, 20, { suit: "spades", highestRank: "A" }),
    ];
    expect(resolveAnnouncements(tied, [0, 1, 2, 3], "hearts")).toMatchObject({
      winningTeam: null,
      pointsByTeam: { 0: 0, 1: 0 },
    });
  });

  it("awards every valid declaration of the team with the strongest announcement", () => {
    const declarations = [
      announcement(0, 50, { suit: "clubs", highestRank: "Q" }),
      announcement(2, 20, { suit: "diamonds", highestRank: "J" }),
      announcement(1, 20, { suit: "hearts", highestRank: "A" }),
    ];
    expect(resolveAnnouncements(declarations, [0, 1, 2, 3], "hearts")).toMatchObject({
      winningTeam: 0,
      pointsByTeam: { 0: 70, 1: 0 },
    });
  });

  it("records declarations once and leaves their resolution for the second trick", () => {
    const once = declareAnnouncementsForPlayer(
      undefined,
      [card("7", "clubs"), card("8", "clubs"), card("9", "clubs")],
      0,
      "hearts",
    );
    const twice = declareAnnouncementsForPlayer(once, [], 0, "hearts");
    expect(twice).toEqual(once);
    expect(once.winningTeam).toBeNull();
  });
});

describe("FFB belote/rebelote", () => {
  const hand = [card("K", "hearts"), card("Q", "hearts"), card("7", "clubs")];

  it("records belote on the first trump honour and awards 20 after the second", () => {
    const belote = playBeloteCard(emptyBeloteState(), hand, 0, card("Q", "hearts"), "hearts");
    expect(belote).toMatchObject({
      declaration: { playerId: 0, teamId: 0, firstRank: "Q", completed: false },
      pointsByTeam: { 0: 0, 1: 0 },
    });
    const rebelote = playBeloteCard(belote, [card("K", "hearts")], 0, card("K", "hearts"), "hearts");
    expect(rebelote).toMatchObject({
      declaration: { completed: true },
      pointsByTeam: { 0: 20, 1: 0 },
    });
  });

  it("does not award belote without both cards, the right trump, player, and second rank", () => {
    expect(playBeloteCard(undefined, [card("K", "hearts")], 0, card("K", "hearts"), "hearts"))
      .toEqual(emptyBeloteState());
    const belote = playBeloteCard(undefined, hand, 0, card("K", "hearts"), "hearts");
    expect(playBeloteCard(belote, [card("Q", "hearts")], 1, card("Q", "hearts"), "hearts"))
      .toEqual(belote);
    expect(playBeloteCard(belote, [card("Q", "hearts")], 0, card("Q", "hearts"), "spades"))
      .toEqual(belote);
  });
});
