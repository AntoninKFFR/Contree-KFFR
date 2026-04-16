import { describe, expect, it } from "vitest";
import { createDeck, shuffleDeck } from "@/engine/cards";

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
});
