import { describe, expect, it } from "vitest";
import { handWithoutPendingCard, visiblePendingCard } from "@/lib/multiplayerOptimisticPlay";
import type { Card } from "@/engine/types";

const played: Card = { rank: "A", suit: "spades" };
const other: Card = { rank: "7", suit: "hearts" };

describe("multiplayer pending card presentation", () => {
  it("removes a clicked card from the visual hand before a server response", () => {
    const pending = { card: played, version: 8 };
    const visible = visiblePendingCard(pending, 8, [played, other]);
    expect(visible).toEqual(played);
    expect(handWithoutPendingCard([played, other], visible)).toEqual([other]);
  });

  it("reconciles a realtime update before HTTP without duplicating the card", () => {
    const pending = { card: played, version: 8 };
    expect(visiblePendingCard(pending, 9, [other])).toBeNull();
    expect(visiblePendingCard(pending, 8, [other])).toBeNull();
    expect(handWithoutPendingCard([other], null)).toEqual([other]);
  });

  it("restores the card after a refused request clears pending state", () => {
    expect(visiblePendingCard(null, 8, [played, other])).toBeNull();
    expect(handWithoutPendingCard([played, other], null)).toEqual([played, other]);
  });
});
