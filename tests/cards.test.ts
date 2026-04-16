import { describe, expect, it } from "vitest";
import { createDeck, sortHand, shuffleDeck } from "@/engine/cards";

describe("cards", () => {
  it("creates a 32-card deck with unique cards", () => {
    const deck = createDeck();
    const ids = new Set(deck.map((card) => `${card.rank}-${card.suit}`));

    expect(deck).toHaveLength(32);
    expect(ids.size).toBe(32);
  });

  it("keeps all cards when shuffling", () => {
    const deck = createDeck();
    const shuffled = shuffleDeck(deck, () => 0.42);

    expect(shuffled).toHaveLength(32);
    expect(new Set(shuffled.map((card) => `${card.rank}-${card.suit}`)).size).toBe(32);
  });

  it("sorts hands by alternating suit colors and trump order before bidding", () => {
    const sorted = sortHand([
      { rank: "7", suit: "clubs" },
      { rank: "A", suit: "hearts" },
      { rank: "10", suit: "spades" },
      { rank: "K", suit: "hearts" },
      { rank: "J", suit: "diamonds" },
      { rank: "9", suit: "spades" },
    ]);

    expect(sorted).toEqual([
      { rank: "A", suit: "hearts" },
      { rank: "K", suit: "hearts" },
      { rank: "9", suit: "spades" },
      { rank: "10", suit: "spades" },
      { rank: "J", suit: "diamonds" },
      { rank: "7", suit: "clubs" },
    ]);
  });

  it("uses trump strength inside the trump suit", () => {
    const sorted = sortHand(
      [
        { rank: "A", suit: "hearts" },
        { rank: "J", suit: "hearts" },
        { rank: "9", suit: "hearts" },
        { rank: "10", suit: "hearts" },
      ],
      "hearts",
    );

    expect(sorted).toEqual([
      { rank: "J", suit: "hearts" },
      { rank: "9", suit: "hearts" },
      { rank: "A", suit: "hearts" },
      { rank: "10", suit: "hearts" },
    ]);
  });

  it("uses normal strength for non-trump suits after bidding", () => {
    const sorted = sortHand(
      [
        { rank: "9", suit: "spades" },
        { rank: "10", suit: "spades" },
        { rank: "A", suit: "spades" },
      ],
      "hearts",
    );

    expect(sorted).toEqual([
      { rank: "A", suit: "spades" },
      { rank: "10", suit: "spades" },
      { rank: "9", suit: "spades" },
    ]);
  });
});
