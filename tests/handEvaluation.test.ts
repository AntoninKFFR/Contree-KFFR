import { describe, expect, it } from "vitest";
import { evaluateHandForTrump } from "@/bots/evaluation/handEvaluation";
import type { Card } from "@/engine/types";

function card(rank: Card["rank"], suit: Card["suit"]): Card {
  return { rank, suit };
}

describe("hand evaluation", () => {
  it("values a petit jeu with jack or nine and supporting trumps", () => {
    const petitJeu = [
      card("J", "hearts"),
      card("A", "hearts"),
      card("10", "hearts"),
      card("8", "hearts"),
      card("7", "clubs"),
      card("8", "clubs"),
      card("7", "spades"),
      card("8", "diamonds"),
    ];
    const weakTrump = [
      card("A", "hearts"),
      card("10", "hearts"),
      card("8", "hearts"),
      card("7", "hearts"),
      card("7", "clubs"),
      card("8", "clubs"),
      card("7", "spades"),
      card("8", "diamonds"),
    ];

    expect(evaluateHandForTrump(petitJeu, "hearts").score).toBeGreaterThan(
      evaluateHandForTrump(weakTrump, "hearts").score,
    );
  });

  it("strongly rewards jack plus nine with side master tricks", () => {
    const ninetyStyle = [
      card("J", "hearts"),
      card("9", "hearts"),
      card("A", "hearts"),
      card("A", "clubs"),
      card("10", "clubs"),
      card("K", "diamonds"),
      card("8", "spades"),
      card("7", "spades"),
    ];
    const singlePiece = [
      card("J", "hearts"),
      card("A", "hearts"),
      card("10", "hearts"),
      card("A", "clubs"),
      card("10", "clubs"),
      card("K", "diamonds"),
      card("8", "spades"),
      card("7", "spades"),
    ];

    expect(evaluateHandForTrump(ninetyStyle, "hearts").score).toBeGreaterThan(
      evaluateHandForTrump(singlePiece, "hearts").score,
    );
  });

  it("recognizes a stronger 110-like hand with two side aces", () => {
    const hundred = [
      card("J", "hearts"),
      card("9", "hearts"),
      card("A", "hearts"),
      card("10", "hearts"),
      card("A", "clubs"),
      card("K", "diamonds"),
      card("8", "spades"),
      card("7", "spades"),
    ];
    const hundredTen = [
      card("J", "hearts"),
      card("9", "hearts"),
      card("A", "hearts"),
      card("10", "hearts"),
      card("A", "clubs"),
      card("A", "diamonds"),
      card("8", "spades"),
      card("7", "spades"),
    ];

    expect(evaluateHandForTrump(hundredTen, "hearts").score).toBeGreaterThan(
      evaluateHandForTrump(hundred, "hearts").score,
    );
  });

  it("values a strong bicolor hand for 120-like situations", () => {
    const bicolor = [
      card("J", "hearts"),
      card("9", "hearts"),
      card("A", "hearts"),
      card("10", "hearts"),
      card("A", "clubs"),
      card("10", "clubs"),
      card("K", "clubs"),
      card("7", "spades"),
    ];
    const flat = [
      card("J", "hearts"),
      card("9", "hearts"),
      card("A", "hearts"),
      card("10", "hearts"),
      card("A", "clubs"),
      card("8", "diamonds"),
      card("7", "spades"),
      card("8", "spades"),
    ];

    expect(evaluateHandForTrump(bicolor, "hearts").score).toBeGreaterThan(
      evaluateHandForTrump(flat, "hearts").score,
    );
  });

  it("detects near-capot hands as clearly stronger", () => {
    const strong = [
      card("J", "hearts"),
      card("9", "hearts"),
      card("A", "hearts"),
      card("10", "hearts"),
      card("K", "hearts"),
      card("A", "clubs"),
      card("A", "diamonds"),
      card("10", "clubs"),
    ];
    const justGood = [
      card("J", "hearts"),
      card("9", "hearts"),
      card("A", "hearts"),
      card("10", "hearts"),
      card("8", "hearts"),
      card("A", "clubs"),
      card("K", "diamonds"),
      card("8", "spades"),
    ];

    const strongEvaluation = evaluateHandForTrump(strong, "hearts");
    const goodEvaluation = evaluateHandForTrump(justGood, "hearts");

    expect(strongEvaluation.capotPotential).toBeGreaterThan(0);
    expect(strongEvaluation.score).toBeGreaterThan(goodEvaluation.score);
  });
});
