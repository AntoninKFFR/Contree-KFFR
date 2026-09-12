import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { HumanHand } from "@/components/HumanHand";
import { getLegalCards } from "@/engine/rules";
import type { Card, Trick } from "@/engine/types";
import { CONTREE_KFFR_RULESET } from "@/engine/rulesets/presets";
import { relaxedFollowSuitVariant } from "@/tests/helpers/rulesets";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("rules-aware human hand", () => {
  it("enables a newly legal card and keeps the classic illegal card disabled", () => {
    vi.stubGlobal("React", React);
    const cards: Card[] = [
      { rank: "7", suit: "clubs" },
      { rank: "8", suit: "diamonds" },
    ];
    const trick: Trick = {
      leaderId: 1,
      cards: [{ playerId: 1, card: { rank: "K", suit: "clubs" } }],
    };
    const render = (rules: typeof CONTREE_KFFR_RULESET.cardPlay) => renderToStaticMarkup(
      React.createElement(HumanHand, {
        cards,
        legalCards: getLegalCards(cards, trick, 0, "hearts", rules),
        canPlay: true,
        onPlayCard: () => undefined,
      }),
    );

    const classic = render(CONTREE_KFFR_RULESET.cardPlay);
    const relaxed = render(relaxedFollowSuitVariant.cardPlay);

    expect(classic).toMatch(/aria-label="Jouer 8 ♦"[^>]*disabled/);
    expect(relaxed).not.toMatch(/aria-label="Jouer 8 ♦"[^>]*disabled/);
  });
});
