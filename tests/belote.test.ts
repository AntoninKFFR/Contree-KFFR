import { describe, expect, it } from "vitest";
import { emptyBeloteState, playBeloteCard } from "@/engine/belote";
import type { Card, Rank, Suit } from "@/engine/types";

function card(rank: Rank, suit: Suit): Card {
  return { rank, suit };
}

describe("belote/rebelote", () => {
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
