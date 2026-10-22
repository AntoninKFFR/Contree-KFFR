import { describe, it, expect } from "vitest";
import { handDisplayMode, sortHandForDisplay } from "../lib/preferences/handSorting";
import { clonePlayerPreferences } from "../lib/preferences/playerPreferences";
import type { Bid, Card, ContractMode, Rank, Suit } from "../engine/types";

const ranks: Rank[] = ["7", "8", "9", "J", "Q", "K", "10", "A"];
const trump = ["J", "9", "A", "10", "K", "Q", "8", "7"];
const plain = ["A", "10", "K", "Q", "J", "9", "8", "7"];
const hand = (suit: Suit): Card[] => ranks.map((rank) => ({ rank, suit }));
const bid = (mode: ContractMode, playerId: 0 | 1 = 0, value: 80 | 90 = 80): Bid => ({ action: "bid", playerId, value, contractMode: mode });
const game = (bids: Bid[], phase = "bidding", mode: ContractMode | null = null) => ({ phase, bids, contractMode: mode, trump: null });
const prefs = clonePlayerPreferences().cards;
const order = (cards: Card[], bids: Bid[], phase?: string, mode?: ContractMode | null) => sortHandForDisplay(cards, prefs, handDisplayMode(game(bids, phase, mode))).map((c) => c.rank);

describe("one display-only auction mode for native and web hands", () => {
  it("uses standard ranking before an announcement, provisional trump, and the same final ranking", () => {
    expect(order(hand("hearts"), [])).toEqual(plain);
    const bids = [bid({ kind: "suit", suit: "hearts" })];
    expect(order(hand("hearts"), bids)).toEqual(trump);
    expect(order(hand("clubs"), bids)).toEqual(plain);
    expect(order(hand("hearts"), bids, "playing", { kind: "suit", suit: "hearts" })).toEqual(trump);
    expect(handDisplayMode(game([]))).toBeNull();
  });
  it("changes only on an announced overbid, and preserves ordering on pass, coinche, surcoinche and refresh", () => {
    const bids: Bid[] = [bid({ kind: "suit", suit: "hearts" }), bid({ kind: "suit", suit: "clubs" }, 1, 90)];
    expect(order(hand("hearts"), bids)).toEqual(plain); expect(order(hand("clubs"), bids)).toEqual(trump);
    for (const action of ["pass", "coinche", "surcoinche"] as const) {
      expect(order(hand("clubs"), [...bids, { playerId: 0, action }])).toEqual(trump);
      expect(order(hand("clubs"), structuredClone(bids))).toEqual(trump);
    }
  });
  it.each(["no-trump", "all-trump"] as const)("respects %s in bidding and play", (kind) => {
    for (const suit of ["hearts", "diamonds", "clubs", "spades"] as const) {
      expect(order(hand(suit), [bid({ kind })])).toEqual(kind === "all-trump" ? trump : plain);
      expect(order(hand(suit), [], "playing", { kind })).toEqual(kind === "all-trump" ? trump : plain);
    }
  });
  it("preserves manual order, configured suit grouping and rank/suit preferences without mutating cards", () => {
    const cards = [hand("clubs")[0], hand("hearts")[0], hand("hearts")[3], hand("clubs")[7]];
    const original = structuredClone(cards), mode = handDisplayMode(game([bid({ kind: "suit", suit: "hearts" })]));
    expect(sortHandForDisplay(cards, { ...prefs, autoSortHand: false }, mode)).toEqual(original);
    const suits = sortHandForDisplay(cards, { ...prefs, suitOrder: ["hearts", "clubs", "diamonds", "spades"] }, mode);
    expect(suits.map((c) => `${c.rank}:${c.suit}`)).toEqual(["J:hearts", "7:hearts", "A:clubs", "7:clubs"]);
    // Equal strengths keep the configured suit tiebreaker (A off-trump and J trump are both 7).
    expect(sortHandForDisplay(cards, { ...prefs, sortMode: "rank-suit" }, mode).map((c) => `${c.rank}:${c.suit}`)).toEqual(["A:clubs", "J:hearts", "7:clubs", "7:hearts"]);
    expect(cards).toEqual(original);
  });
});
