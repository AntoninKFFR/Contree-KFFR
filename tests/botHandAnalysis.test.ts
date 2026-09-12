import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { captureBotReviewScenario, createBotReviewBundle, isBotReviewModeEnabled } from "@/bots/botReview";
import { chooseBotBidWithTrace, chooseBotCard } from "@/bots/simpleBot";
import {
  SoloBotHandsPanel,
  sortCardsForAnalysis,
} from "@/components/BotHandAnalysis";
import { BotReviewHistory, BotReviewPanel } from "@/components/BotReviewPanel";
import { cardId } from "@/engine/cards";
import { createInitialGame, makeBid } from "@/engine/game";
import { createSeededRandom } from "@/engine/random";
import type { Card, GameState } from "@/engine/types";
import {
  isSoloDesktopAnalysisLayout,
  soloContentClassName,
  soloGridClassName,
  soloMainClassName,
} from "@/app/solo/soloAnalysis";

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

  it("renders selectable recent history and complete-analysis export controls", () => {
    const state = playingState(8204);
    const chosenCard = chooseBotCard(state);
    const first = captureBotReviewScenario(state, {
      decisionNumber: 1,
      elapsedMs: 1,
      chosenCard,
    });
    const second = { ...first, decisionId: "second-decision" };
    const historyMarkup = renderToStaticMarkup(React.createElement(BotReviewHistory, {
      decisions: [first, second],
      onSelect: () => undefined,
      playerNames: state.playerNames,
      selectedDecisionId: first.decisionId,
    }));
    const panelMarkup = renderToStaticMarkup(React.createElement(BotReviewPanel, {
      createFullBundle: (humanComment: string) => createBotReviewBundle(state, [first, second], {
        gameId: "game-ui",
        humanComment,
        selectedDecisionId: first.decisionId,
      }),
      onClose: () => undefined,
      scenario: first,
    }));

    expect(historyMarkup).toContain("Historique des décisions");
    expect(historyMarkup).toContain("2 conservées");
    expect(historyMarkup).toContain("D2");
    expect(historyMarkup).toContain("D1");
    expect(panelMarkup).toContain("Télécharger analyse complète");
    expect(panelMarkup).toContain("Copier analyse complète");
    expect(panelMarkup).toContain("Télécharger JSON");
    expect(panelMarkup).toContain("Copier le scénario");
  });

  it("enables desktop scrolling only for active analysis mode", () => {
    const analysisDesktop = isSoloDesktopAnalysisLayout(true, true, false);
    expect(analysisDesktop).toBe(true);
    expect(soloMainClassName(analysisDesktop, false)).toContain("lg:h-auto");
    expect(soloMainClassName(analysisDesktop, false)).toContain("lg:overflow-y-auto");
    expect(soloContentClassName(analysisDesktop)).toContain("h-auto min-h-full");
    expect(soloGridClassName(analysisDesktop, false, true)).toContain("flex-none");

    const normalDesktop = isSoloDesktopAnalysisLayout(true, false, false);
    expect(normalDesktop).toBe(false);
    expect(soloMainClassName(normalDesktop, false)).toContain("lg:h-[calc(100dvh-56px)]");
    expect(soloMainClassName(normalDesktop, false)).toContain("lg:overflow-hidden");
    expect(soloContentClassName(normalDesktop)).toContain("h-full");
    expect(soloGridClassName(normalDesktop, false, true)).toContain("flex-1");

    const mobileLandscape = isSoloDesktopAnalysisLayout(true, true, true);
    expect(mobileLandscape).toBe(false);
    expect(soloMainClassName(mobileLandscape, true)).toContain("overflow-hidden px-0 py-0");
  });
});
