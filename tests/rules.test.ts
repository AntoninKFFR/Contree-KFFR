import { describe, expect, it } from "vitest";
import { cardPoints, getLegalCards, getTrickWinner, trickPoints } from "@/engine/rules";
import type { Card, Trick } from "@/engine/types";

describe("rules", () => {
  it("uses belote-style points for trump and non-trump cards", () => {
    expect(cardPoints({ rank: "J", suit: "hearts" }, "hearts")).toBe(20);
    expect(cardPoints({ rank: "9", suit: "hearts" }, "hearts")).toBe(14);
    expect(cardPoints({ rank: "J", suit: "spades" }, "hearts")).toBe(2);
    expect(cardPoints({ rank: "A", suit: "clubs" }, "hearts")).toBe(11);
  });

  it("adds 10 points to the last trick", () => {
    const cards = [
      { playerId: 0, card: { rank: "A", suit: "clubs" } },
      { playerId: 1, card: { rank: "10", suit: "clubs" } },
      { playerId: 2, card: { rank: "K", suit: "clubs" } },
      { playerId: 3, card: { rank: "7", suit: "clubs" } },
    ] as const;

    expect(trickPoints([...cards], "hearts", false)).toBe(25);
    expect(trickPoints([...cards], "hearts", true)).toBe(35);
  });

  it("requires following the lead suit when possible", () => {
    const hand: Card[] = [
      { rank: "7", suit: "clubs" },
      { rank: "A", suit: "hearts" },
    ];
    const trick: Trick = {
      leaderId: 1,
      cards: [{ playerId: 1, card: { rank: "K", suit: "clubs" } }],
    };

    expect(getLegalCards(hand, trick, 0, "hearts")).toEqual([{ rank: "7", suit: "clubs" }]);
  });

  it("requires cutting when player cannot follow suit and opponent is winning", () => {
    const hand: Card[] = [
      { rank: "7", suit: "diamonds" },
      { rank: "A", suit: "hearts" },
    ];
    const trick: Trick = {
      leaderId: 1,
      cards: [{ playerId: 1, card: { rank: "K", suit: "clubs" } }],
    };

    expect(getLegalCards(hand, trick, 0, "hearts")).toEqual([{ rank: "A", suit: "hearts" }]);
  });

  it("allows pissing when player cannot follow suit and partner is winning", () => {
    const hand: Card[] = [
      { rank: "7", suit: "diamonds" },
      { rank: "A", suit: "hearts" },
    ];
    const trick: Trick = {
      leaderId: 2,
      cards: [{ playerId: 2, card: { rank: "K", suit: "clubs" } }],
    };

    expect(getLegalCards(hand, trick, 0, "hearts")).toEqual(hand);
  });

  it("allows any card when player cannot follow suit and has no trump", () => {
    const hand: Card[] = [
      { rank: "7", suit: "diamonds" },
      { rank: "A", suit: "spades" },
    ];
    const trick: Trick = {
      leaderId: 1,
      cards: [{ playerId: 1, card: { rank: "K", suit: "clubs" } }],
    };

    expect(getLegalCards(hand, trick, 0, "hearts")).toEqual(hand);
  });

  it("lets trump beat the requested suit", () => {
    const trick: Trick = {
      leaderId: 0,
      cards: [
        { playerId: 0, card: { rank: "A", suit: "clubs" } },
        { playerId: 1, card: { rank: "7", suit: "hearts" } },
        { playerId: 2, card: { rank: "10", suit: "clubs" } },
        { playerId: 3, card: { rank: "K", suit: "clubs" } },
      ],
    };

    expect(getTrickWinner(trick, "hearts")).toBe(1);
  });

  it("uses trump order where jack beats nine", () => {
    const trick: Trick = {
      leaderId: 0,
      cards: [
        { playerId: 0, card: { rank: "9", suit: "hearts" } },
        { playerId: 1, card: { rank: "J", suit: "hearts" } },
        { playerId: 2, card: { rank: "A", suit: "hearts" } },
        { playerId: 3, card: { rank: "10", suit: "hearts" } },
      ],
    };

    expect(getTrickWinner(trick, "hearts")).toBe(1);
  });
});
