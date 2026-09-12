import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { captureBotReviewScenario, isBotReviewModeEnabled } from "@/bots/botReview";
import { chooseBotBidWithTrace, chooseBotCard } from "@/bots/simpleBot";
import {
  SoloBotHandsPanel,
  sortCardsForAnalysis,
} from "@/components/BotHandAnalysis";
import { BotReviewPanel } from "@/components/BotReviewPanel";
import { cardId } from "@/engine/cards";
import { createInitialGame, makeBid } from "@/engine/game";
import { createSeededRandom } from "@/engine/random";
import type { Card, GameState } from "@/engine/types";

(globalThis as typeof globalThis & { React: typeof React }).React = React;

function playingState(seed = 8200): GameState {
  let state = createInitialGame(createSeededRandom(seed));
  state = makeBid(state, state.currentPlayerId, { action: "bid", value: 80, trump: "hearts" });
  for (let pass = 0; pass < 3; pass += 1) {
    state = makeBid(state, state.currentPlayerId, { action: "pass" });
  }
  if (state.phase !== "playing") throw new Error("La fixture devait atteindre la phase de jeu.");
  return state;
}

describe("solo bot hand analysis", () => {
  it("is unavailable by default and available only with the public flag", () => {
    expect(isBotReviewModeEnabled(undefined)).toBe(false);
    expect(isBotReviewModeEnabled("false")).toBe(false);
    expect(isBotReviewModeEnabled("true")).toBe(true);
  });

  it("sorts cards by display suit and rank strength", () => {
    const cards: Card[] = [
      { suit: "clubs", rank: "7" },
      { suit: "hearts", rank: "7" },
      { suit: "hearts", rank: "J" },
      { suit: "spades", rank: "A" },
      { suit: "spades", rank: "10" },
    ];

    expect(sortCardsForAnalysis(cards, "hearts").map(cardId)).toEqual([
      "J-hearts",
      "7-hearts",
      "A-spades",
      "10-spades",
      "7-clubs",
    ]);
    expect(cards.map(cardId)).toEqual([
      "7-clubs",
      "7-hearts",
      "J-hearts",
      "A-spades",
      "10-spades",
    ]);
  });

  it("renders all three live bot hands without the human hand", () => {
    const state = playingState(8201);
    const markup = renderToStaticMarkup(React.createElement(SoloBotHandsPanel, { state }));

    for (const botPlayerId of [1, 2, 3] as const) {
      for (const card of state.hands[botPlayerId]) {
        expect(markup).toContain(`data-card-id="${cardId(card)}"`);
      }
    }
    for (const card of state.hands[0]) {
      expect(markup).not.toContain(`data-card-id="${cardId(card)}"`);
    }
  });

  it("renders the pre-decision hand, chosen card, and legal cards in Bot Review", () => {
    const state = playingState(8202);
    const chosenCard = chooseBotCard(state);
    const scenario = captureBotReviewScenario(state, {
      decisionNumber: 1,
      elapsedMs: 1,
      chosenCard,
      capturedAt: "2026-09-11T12:00:00.000Z",
    });
    const markup = renderToStaticMarkup(React.createElement(BotReviewPanel, {
      onClose: () => undefined,
      scenario,
    }));

    expect(markup).toContain("Main du bot avant la décision");
    expect(markup).toContain("Cartes légales");
    for (const card of scenario.ownHand) {
      expect(markup).toContain(`data-card-id="${cardId(card)}"`);
    }
    expect(markup).toContain(`data-card-id="${cardId(chosenCard)}" data-chosen="true"`);
  });

  it("renders every available official V3 auction diagnostic", () => {
    const state = createInitialGame(createSeededRandom(8203));
    const { bid, biddingTrace } = chooseBotBidWithTrace(state);
    const scenario = captureBotReviewScenario(state, {
      decisionNumber: 2,
      elapsedMs: 1,
      chosenBid: bid,
      biddingTrace,
    });
    const markup = renderToStaticMarkup(React.createElement(BotReviewPanel, {
      onClose: () => undefined,
      scenario,
    }));

    for (const label of [
      "Fondation atout",
      "Fit partenaire",
      "Override",
      "Palier minimal",
      "Plafond intrinsèque",
      "Plafond de rebid",
      "Intention",
      "Raison",
    ]) {
      expect(markup).toContain(label);
    }
  });
});
