import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { HumanHand } from "@/components/HumanHand";
import { PlayerPreferencesProvider } from "@/components/settings/PlayerPreferencesProvider";
import type { Card } from "@/engine/types";
import { sortHandForDisplay } from "@/lib/preferences/handSorting";
import { clonePlayerPreferences } from "@/lib/preferences/playerPreferences";

const hand: Card[] = [
  { rank: "7", suit: "spades" },
  { rank: "A", suit: "clubs" },
  { rank: "J", suit: "hearts" },
  { rank: "10", suit: "clubs" },
];

describe("local hand presentation", () => {
  const suits = (cards: Card[]) => [...new Set(cards.map((card) => card.suit))];
  const handFor = (...listedSuits: Card["suit"][]): Card[] => listedSuits.map((suit, index) => ({
    suit,
    rank: (["7", "8", "9", "10"] as Card["rank"][])[index],
  }));

  it("sorts by suit then rank while alternating the three present suit colors", () => expect(sortHandForDisplay(hand, clonePlayerPreferences().cards).map((card) => `${card.suit}-${card.rank}`)).toEqual(["clubs-A", "clubs-10", "hearts-J", "spades-7"]));
  it("sorts by rank then suit", () => { const preferences = clonePlayerPreferences(); preferences.cards.sortMode = "rank-suit"; expect(sortHandForDisplay(hand, preferences.cards).map((card) => card.rank)).toEqual(["A", "10", "J", "7"]); });
  it("preserves the dealt order when automatic sorting is off", () => { const preferences = clonePlayerPreferences(); preferences.cards.autoSortHand = false; expect(sortHandForDisplay(hand, preferences.cards)).toEqual(hand); });
  it("respects a custom suit order", () => { const preferences = clonePlayerPreferences(); preferences.cards.suitOrder = ["spades", "hearts", "diamonds", "clubs"]; expect(sortHandForDisplay(hand, preferences.cards)[0].suit).toBe("spades"); });
  it("places clubs between hearts and diamonds", () => {
    const preferences = clonePlayerPreferences();
    preferences.cards.suitOrder = ["hearts", "diamonds", "clubs", "spades"];
    expect(suits(sortHandForDisplay(handFor("hearts", "diamonds", "clubs"), preferences.cards)))
      .toEqual(["hearts", "clubs", "diamonds"]);
  });
  it("keeps an already alternating three-suit preference order", () => {
    const preferences = clonePlayerPreferences();
    preferences.cards.suitOrder = ["hearts", "clubs", "diamonds", "spades"];
    expect(suits(sortHandForDisplay(handFor("hearts", "clubs", "diamonds"), preferences.cards)))
      .toEqual(["hearts", "clubs", "diamonds"]);
  });
  it("places hearts between clubs and spades", () => {
    const preferences = clonePlayerPreferences();
    preferences.cards.suitOrder = ["clubs", "spades", "hearts", "diamonds"];
    expect(suits(sortHandForDisplay(handFor("clubs", "spades", "hearts"), preferences.cards)))
      .toEqual(["clubs", "hearts", "spades"]);
  });
  it.each([
    [["hearts", "diamonds"], ["hearts", "diamonds"]],
    [["clubs", "spades"], ["clubs", "spades"]],
  ] as const)("keeps the preferred order when only %s are present", (present, expected) => {
    const preferences = clonePlayerPreferences();
    const presentSuits: Card["suit"][] = [...present];
    preferences.cards.suitOrder = [
      ...presentSuits,
      ...preferences.cards.suitOrder.filter((suit) => !presentSuits.includes(suit)),
    ];
    expect(suits(sortHandForDisplay(handFor(...present), preferences.cards))).toEqual(expected);
  });
  it("alternates red and black suits when all four are present", () => {
    const preferences = clonePlayerPreferences();
    preferences.cards.suitOrder = ["hearts", "diamonds", "clubs", "spades"];
    expect(suits(sortHandForDisplay(handFor("hearts", "diamonds", "clubs", "spades"), preferences.cards)))
      .toEqual(["hearts", "clubs", "diamonds", "spades"]);
  });
  it("does not apply the dynamic suit order when automatic sorting is disabled", () => {
    const preferences = clonePlayerPreferences();
    preferences.cards.autoSortHand = false;
    const dealt = handFor("diamonds", "hearts", "clubs");
    expect(sortHandForDisplay(dealt, preferences.cards)).toEqual(dealt);
  });
  it("keeps the persistent suit preference for rank-suit ties", () => {
    const preferences = clonePlayerPreferences();
    preferences.cards.sortMode = "rank-suit";
    preferences.cards.suitOrder = ["hearts", "diamonds", "clubs", "spades"];
    const equalRanks = (["hearts", "diamonds", "clubs", "spades"] as const)
      .map((suit) => ({ suit, rank: "7" as const }));
    expect(sortHandForDisplay(equalRanks, preferences.cards).map((card) => card.suit))
      .toEqual(preferences.cards.suitOrder);
  });
  it.each(["small", "medium", "large"] as const)("renders the %s card size", (size) => { vi.stubGlobal("React", React); const preferences = clonePlayerPreferences(); preferences.cards.cardSize = size; const markup = renderToStaticMarkup(React.createElement(PlayerPreferencesProvider, { initialPreferences: preferences }, React.createElement(HumanHand, { cards: hand.slice(0, 1), legalCards: hand.slice(0, 1), canPlay: true, onPlayCard: () => undefined }))); expect(markup).toContain(`data-card-size="${size}"`); });
  it("never mutates card identity or source order after a play", () => { const source = hand.map((card) => ({ ...card })); const preferences = clonePlayerPreferences(); const sorted = sortHandForDisplay(source, preferences.cards); const remaining = source.filter((card) => card !== sorted[0]); sortHandForDisplay(remaining, preferences.cards); expect(source).toEqual(hand); expect(new Set(sorted).size).toBe(hand.length); });
});
