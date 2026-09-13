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
  it("sorts by suit then rank", () => expect(sortHandForDisplay(hand, clonePlayerPreferences().cards).map((card) => `${card.suit}-${card.rank}`)).toEqual(["clubs-A", "clubs-10", "hearts-J", "spades-7"]));
  it("sorts by rank then suit", () => { const preferences = clonePlayerPreferences(); preferences.cards.sortMode = "rank-suit"; expect(sortHandForDisplay(hand, preferences.cards).map((card) => card.rank)).toEqual(["A", "10", "J", "7"]); });
  it("manual mode preserves the dealt order", () => { const preferences = clonePlayerPreferences(); preferences.cards.sortMode = "manual"; expect(sortHandForDisplay(hand, preferences.cards)).toEqual(hand); });
  it("respects a custom suit order", () => { const preferences = clonePlayerPreferences(); preferences.cards.suitOrder = ["spades", "hearts", "diamonds", "clubs"]; expect(sortHandForDisplay(hand, preferences.cards)[0].suit).toBe("spades"); });
  it.each(["small", "medium", "large"] as const)("renders the %s card size", (size) => { vi.stubGlobal("React", React); const preferences = clonePlayerPreferences(); preferences.cards.cardSize = size; const markup = renderToStaticMarkup(React.createElement(PlayerPreferencesProvider, { initialPreferences: preferences }, React.createElement(HumanHand, { cards: hand.slice(0, 1), legalCards: hand.slice(0, 1), canPlay: true, onPlayCard: () => undefined }))); expect(markup).toContain(`data-card-size="${size}"`); });
  it("never mutates card identity or source order after a play", () => { const source = hand.map((card) => ({ ...card })); const preferences = clonePlayerPreferences(); const sorted = sortHandForDisplay(source, preferences.cards); const remaining = source.filter((card) => card !== sorted[0]); sortHandForDisplay(remaining, preferences.cards); expect(source).toEqual(hand); expect(new Set(sorted).size).toBe(hand.length); });
});
