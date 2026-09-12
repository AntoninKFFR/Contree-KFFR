import { describe, expect, it } from "vitest";
import { applyGameAction } from "@/engine/actions";
import { cardId } from "@/engine/cards";
import { createInitialGame } from "@/engine/game";
import { getLegalCards, isLegalCard } from "@/engine/rules";
import { createGameSettings } from "@/engine/rulesets/resolve";
import type { Card, GameState, Trick } from "@/engine/types";
import {
  freeDiscardVariant,
  mustTrumpBehindPartnerVariant,
  mustUndertrumpVariant,
  noOvertrumpVariant,
  noRaiseAtTrumpVariant,
  relaxedFollowSuitVariant,
} from "@/tests/helpers/rulesets";
import { CONTREE_KFFR_RULESET } from "@/engine/rulesets/presets";

function card(rank: Card["rank"], suit: Card["suit"]): Card {
  return { rank, suit };
}

function ids(cards: Card[]): string[] {
  return cards.map(cardId).sort();
}

const clubsLed: Trick = {
  leaderId: 1,
  cards: [{ playerId: 1, card: card("K", "clubs") }],
};

const partnerWinningClubs: Trick = {
  leaderId: 2,
  cards: [{ playerId: 2, card: card("A", "clubs") }],
};

const opponentCut: Trick = {
  leaderId: 1,
  cards: [
    { playerId: 1, card: card("K", "clubs") },
    { playerId: 3, card: card("9", "hearts") },
  ],
};

const trumpLed: Trick = {
  leaderId: 1,
  cards: [{ playerId: 1, card: card("9", "hearts") }],
};

describe("configurable card-play legality", () => {
  it("requires following suit when enabled and permits every card when disabled", () => {
    const hand = [card("7", "clubs"), card("A", "hearts"), card("8", "diamonds")];
    expect(ids(getLegalCards(hand, clubsLed, 0, "hearts", CONTREE_KFFR_RULESET.cardPlay)))
      .toEqual(ids([card("7", "clubs")]));
    expect(ids(getLegalCards(hand, clubsLed, 0, "hearts", relaxedFollowSuitVariant.cardPlay)))
      .toEqual(ids(hand));
  });

  it("requires cutting when void only when mustTrumpWhenVoid is enabled", () => {
    const hand = [card("7", "diamonds"), card("A", "hearts")];
    expect(ids(getLegalCards(hand, clubsLed, 0, "hearts", CONTREE_KFFR_RULESET.cardPlay)))
      .toEqual(ids([card("A", "hearts")]));
    expect(ids(getLegalCards(hand, clubsLed, 0, "hearts", freeDiscardVariant.cardPlay)))
      .toEqual(ids(hand));
  });

  it("allows discard behind a winning partner or forces a trump independently", () => {
    const hand = [card("7", "diamonds"), card("A", "hearts"), card("J", "hearts")];
    expect(ids(getLegalCards(hand, partnerWinningClubs, 0, "hearts", CONTREE_KFFR_RULESET.cardPlay)))
      .toEqual(ids(hand));
    expect(ids(getLegalCards(hand, partnerWinningClubs, 0, "hearts", mustTrumpBehindPartnerVariant.cardPlay)))
      .toEqual(ids([card("A", "hearts"), card("J", "hearts")]));
  });

  it("requires overtrumping an opponent only when mustOvertrump is enabled", () => {
    const hand = [card("A", "hearts"), card("J", "hearts"), card("7", "diamonds")];
    expect(ids(getLegalCards(hand, opponentCut, 0, "hearts", CONTREE_KFFR_RULESET.cardPlay)))
      .toEqual(ids([card("J", "hearts")]));
    expect(ids(getLegalCards(hand, opponentCut, 0, "hearts", noOvertrumpVariant.cardPlay)))
      .toEqual(ids([card("A", "hearts"), card("J", "hearts")]));
  });

  it("allows discard when unable to overtrump or forces an inferior trump", () => {
    const hand = [card("A", "hearts"), card("10", "hearts"), card("7", "diamonds")];
    expect(ids(getLegalCards(hand, opponentCut, 0, "hearts", CONTREE_KFFR_RULESET.cardPlay)))
      .toEqual(ids(hand));
    expect(ids(getLegalCards(hand, opponentCut, 0, "hearts", mustUndertrumpVariant.cardPlay)))
      .toEqual(ids([card("A", "hearts"), card("10", "hearts")]));
  });

  it("requires raising when trump is led only when mustRaiseAtTrump is enabled", () => {
    const hand = [card("A", "hearts"), card("J", "hearts"), card("7", "clubs")];
    expect(ids(getLegalCards(hand, trumpLed, 0, "hearts", CONTREE_KFFR_RULESET.cardPlay)))
      .toEqual(ids([card("J", "hearts")]));
    expect(ids(getLegalCards(hand, trumpLed, 0, "hearts", noRaiseAtTrumpVariant.cardPlay)))
      .toEqual(ids([card("A", "hearts"), card("J", "hearts")]));
  });

  it("keeps raising at trump independent from overtrumping after a cut", () => {
    const hand = [card("A", "hearts"), card("J", "hearts"), card("7", "diamonds")];
    expect(ids(getLegalCards(hand, trumpLed, 0, "hearts", noOvertrumpVariant.cardPlay)))
      .toEqual(ids([card("J", "hearts")]));
    expect(ids(getLegalCards(hand, opponentCut, 0, "hearts", noRaiseAtTrumpVariant.cardPlay)))
      .toEqual(ids([card("J", "hearts")]));
  });

  it("constrains a voluntary trump to an overtrump when cutting itself is optional", () => {
    const hand = [card("A", "hearts"), card("J", "hearts"), card("7", "diamonds")];
    expect(ids(getLegalCards(hand, opponentCut, 0, "hearts", freeDiscardVariant.cardPlay)))
      .toEqual(ids([card("J", "hearts"), card("7", "diamonds")]));
  });

  it("treats relaxed follow suit as the highest-precedence permission", () => {
    const hand = [card("A", "hearts"), card("J", "hearts"), card("7", "clubs")];
    expect(ids(getLegalCards(hand, trumpLed, 0, "hearts", relaxedFollowSuitVariant.cardPlay)))
      .toEqual(ids(hand));
  });

  it("keeps isLegalCard exactly coherent with getLegalCards for every fixture", () => {
    const hand = [card("A", "hearts"), card("J", "hearts"), card("7", "diamonds")];
    for (const rules of [
      CONTREE_KFFR_RULESET.cardPlay,
      freeDiscardVariant.cardPlay,
      mustUndertrumpVariant.cardPlay,
      noOvertrumpVariant.cardPlay,
      noRaiseAtTrumpVariant.cardPlay,
      relaxedFollowSuitVariant.cardPlay,
    ]) {
      const legalIds = ids(getLegalCards(hand, opponentCut, 0, "hearts", rules));
      for (const candidate of hand) {
        expect(isLegalCard(hand, opponentCut, candidate, 0, "hearts", rules))
          .toBe(legalIds.includes(cardId(candidate)));
      }
    }
  });

  it("makes applyGameAction reject the classic illegal discard and accept it in the relaxed variant", () => {
    const hand = [card("7", "clubs"), card("8", "diamonds")];
    const state = (ruleset = CONTREE_KFFR_RULESET): GameState => ({
      ...createInitialGame(() => 0.1, createGameSettings({ ruleset })),
      phase: "playing",
      trump: "hearts",
      currentPlayerId: 0,
      currentTrick: clubsLed,
      hands: { 0: hand, 1: [], 2: [], 3: [] },
      bids: [{ playerId: 1, action: "bid", value: 80, trump: "hearts" }],
      contract: { playerId: 1, teamId: 1, value: 80, trump: "hearts", status: "normal" },
    });
    const discard = { type: "play-card" as const, playerId: 0 as const, card: card("8", "diamonds") };

    expect(() => applyGameAction(state(), discard)).toThrow("not legal");
    expect(applyGameAction(state(relaxedFollowSuitVariant), discard).hands[0])
      .toEqual([card("7", "clubs")]);
  });
});
