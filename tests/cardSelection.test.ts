import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { CardSelection } from "@/components/training/CardSelection";
import { cardId, createDeck } from "@/engine/cards";

describe("CardSelection", () => {
  const deck = createDeck();
  const render = (cards = deck, selectedCardIds: string[] = [], maxSelections?: number, disabled = false) =>
    renderToStaticMarkup(createElement(CardSelection, { cards, selectedCardIds, maxSelections, disabled, onToggle: () => {} }));

  it("shows 32 accessible card buttons in four stable suit groups", () => {
    const html = render();
    expect(html.match(/aria-pressed=/g)).toHaveLength(32);
    expect(html.match(/<fieldset/g)).toHaveLength(4);
    expect(html).toContain('aria-label="As de cœur"');
    expect(html).toContain('aria-label="Valet de trèfle"');
    expect(html).toContain("grid-cols-4");
    expect(html).toContain("sm:grid-cols-8");
  });

  it("renders a subset or hand without adding other cards", () => {
    const hand = [deck[0], deck[9], deck[20]];
    const html = render(hand);
    expect(html.match(/aria-pressed=/g)).toHaveLength(3);
    expect(html).not.toContain('aria-label="As de cœur"');
  });

  it("keeps selected cards removable at the limit and supports zero selections", () => {
    const selected = cardId(deck[0]);
    const html = render(deck.slice(0, 2), [selected], 1);
    expect(html).toContain('aria-pressed="true"');
    expect(html).toContain('aria-pressed="false" disabled=""');
    expect(render(deck.slice(0, 2), [], 1)).not.toContain('disabled=""');
    expect(render(deck.slice(0, 2), [], undefined, true).match(/disabled=""/g)).toHaveLength(2);
  });
});
