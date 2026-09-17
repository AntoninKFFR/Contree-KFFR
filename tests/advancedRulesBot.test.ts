import { describe, expect, it } from "vitest";
import { evaluateAdvancedModeHand, evaluateCapotHand, ruleBonusForHand } from "@/bots/evaluation/advancedRulesEvaluation";
import { chooseAdvancedRulesBid } from "@/bots/strategy/advancedRulesBidding";
import { chooseAdvancedRulesCard } from "@/bots/strategy/advancedRulesCard";
import { createInitialGame, makeBid, playCard, playableCardsForCurrentPlayer } from "@/engine/game";
import { createDeck } from "@/engine/cards";
import type { Card, ContractMode, GameState, PlayerId } from "@/engine/types";
import { createTestRuleset } from "@/tests/helpers/rulesets";

const c = (rank: Card["rank"], suit: Card["suit"]): Card => ({ rank, suit });
const SA: ContractMode = { kind: "no-trump" };
const TA: ContractMode = { kind: "all-trump" };
const strongSA = [c("A", "clubs"), c("10", "clubs"), c("A", "diamonds"), c("10", "diamonds"),
  c("A", "hearts"), c("K", "hearts"), c("A", "spades"), c("10", "spades")];
const strongTA = [c("J", "clubs"), c("9", "clubs"), c("J", "diamonds"), c("9", "diamonds"),
  c("A", "hearts"), c("10", "hearts"), c("7", "spades"), c("8", "spades")];
const dominantTA = [c("J", "clubs"), c("9", "clubs"), c("J", "diamonds"), c("9", "diamonds"),
  c("J", "hearts"), c("A", "hearts"), c("J", "spades"), c("9", "spades")];
const weak = [c("7", "clubs"), c("8", "clubs"), c("7", "diamonds"), c("8", "diamonds"),
  c("7", "hearts"), c("8", "hearts"), c("7", "spades"), c("8", "spades")];

function biddingState(hand: Card[], options: { sa?: boolean; ta?: boolean; capot?: boolean; generale?: boolean; generaleTA?: boolean; announcements?: boolean } = {}) {
  const ruleset = createTestRuleset({
    bidding: { allowNoTrump: options.sa ?? false, allowAllTrump: options.ta ?? false,
      allowCapot: options.capot ?? true, allowGenerale: options.generale ?? false,
      generaleAllowAllTrump: options.generaleTA ?? false },
    announcements: { enabled: options.announcements ?? false, tierce: options.announcements ?? false,
      fifty: options.announcements ?? false, hundred: options.announcements ?? false,
      squares: options.announcements ?? false },
  });
  const initial = createInitialGame(() => 0.34, { ruleset });
  return { ...initial, currentPlayerId: 0 as PlayerId, hands: { ...initial.hands, 0: hand } };
}

function playMode(mode: ContractMode, hand: Card[], player: PlayerId = 0): GameState {
  const state = biddingState(hand, { sa: true, ta: true });
  const bid = mode.kind === "suit" ? { action: "bid" as const, value: 80 as const, trump: mode.suit }
    : { action: "bid" as const, value: 80 as const, contractMode: mode };
  let next = makeBid(state, 0, bid);
  for (let count = 0; count < 3; count += 1) next = makeBid(next, next.currentPlayerId, { action: "pass" });
  return { ...next, currentPlayerId: player, hands: { ...next.hands, [player]: hand } };
}

describe("advanced rules bidding", () => {
  it("selects strong SA and TA hands only when each mode is enabled", () => {
    expect(chooseAdvancedRulesBid(biddingState(strongSA, { sa: true }))).toMatchObject({ action: "bid", contractMode: SA });
    expect(chooseAdvancedRulesBid(biddingState(dominantTA, { ta: true, capot: false }))).toMatchObject({ action: "bid", contractMode: TA });
    expect(chooseAdvancedRulesBid(biddingState(strongSA)).action).not.toBe("capot");
    expect(chooseAdvancedRulesBid(biddingState(weak, { sa: true, ta: true })).action).toBe("pass");
  });

  it("keeps a strong suit contract ahead of a weaker SA alternative", () => {
    const hand = [c("J", "hearts"), c("9", "hearts"), c("A", "hearts"), c("7", "hearts"),
      c("A", "clubs"), c("10", "clubs"), c("A", "diamonds"), c("7", "spades")];
    expect(chooseAdvancedRulesBid(biddingState(hand, { sa: true })))
      .toMatchObject({ action: "bid", trump: "hearts" });
  });

  it("preserves a supported partner rebid over an attractive special mode", () => {
    const hand = [c("J", "diamonds"), c("9", "diamonds"), c("A", "diamonds"), c("K", "diamonds"),
      c("Q", "diamonds"), c("A", "hearts"), c("10", "hearts"), c("K", "spades")];
    const base = biddingState(hand, { sa: true, ta: true });
    const state = { ...base, bids: [
      { playerId: 1 as PlayerId, action: "bid" as const, value: 80 as const, trump: "clubs" as const },
      { playerId: 0 as PlayerId, action: "bid" as const, value: 90 as const, trump: "diamonds" as const },
      { playerId: 3 as PlayerId, action: "pass" as const },
      { playerId: 2 as PlayerId, action: "bid" as const, value: 100 as const, trump: "diamonds" as const },
      { playerId: 1 as PlayerId, action: "pass" as const },
    ] };
    expect(chooseAdvancedRulesBid(state)).toMatchObject({ action: "bid", trump: "diamonds" });
  });

  it("ties the maximum SA bid to strength rather than the next legal step", () => {
    const medium = [c("A", "clubs"), c("10", "clubs"), c("A", "diamonds"), c("10", "diamonds"),
      c("K", "hearts"), c("Q", "hearts"), c("7", "spades"), c("8", "spades")];
    const opening = biddingState(medium, { sa: true });
    const evaluation = evaluateAdvancedModeHand(medium, SA, opening);
    expect(evaluation.ceiling).not.toBeNull();
    expect(evaluation.ceiling).toBeLessThan(140);
    const overcall = { ...opening, bids: [{ playerId: 1 as PlayerId, action: "bid" as const, value: 130 as const, contractMode: SA }] };
    const decision = chooseAdvancedRulesBid(overcall);
    expect(decision.action).not.toBe("bid");
  });

  it("counts possible announcements only when enabled and discounts them", () => {
    const hand = [c("7", "clubs"), c("8", "clubs"), c("9", "clubs"), c("A", "diamonds"),
      c("10", "diamonds"), c("K", "diamonds"), c("A", "hearts"), c("7", "spades")];
    const off = biddingState(hand, { sa: true });
    const on = biddingState(hand, { sa: true, announcements: true });
    const baseline = evaluateAdvancedModeHand(hand, SA, off);
    const enabled = evaluateAdvancedModeHand(hand, SA, on);
    expect(baseline.announcementPotential).toBe(0);
    expect(enabled.announcementPotential).toBeGreaterThan(0);
    expect(enabled.announcementPotential).toBeLessThan(20);
    expect(enabled.strength).toBeGreaterThan(baseline.strength);
    const suitHand = [c("K", "hearts"), c("Q", "hearts"), c("7", "clubs"), c("8", "clubs"),
      c("9", "clubs"), c("A", "diamonds"), c("10", "diamonds"), c("A", "spades")];
    const color = { kind: "suit" as const, suit: "hearts" as const };
    const offBonus = ruleBonusForHand(suitHand, 0, color, off.settings.ruleset!);
    const onBonus = ruleBonusForHand(suitHand, 0, color, on.settings.ruleset!);
    expect(onBonus.announcements).toBeGreaterThan(offBonus.announcements);
    expect(onBonus.belote).toBeGreaterThan(0);
  });

  it("requires eight controlled cards for Capot and an exceptional hand for Générale", () => {
    const capot = [c("J", "clubs"), c("9", "clubs"), c("A", "clubs"), c("10", "clubs"), c("K", "clubs"),
      c("A", "diamonds"), c("A", "hearts"), c("A", "spades")];
    expect(evaluateCapotHand(capot, { kind: "suit", suit: "clubs" })).not.toBeNull();
    expect(evaluateCapotHand(strongTA, TA)).toBeNull();
    expect(chooseAdvancedRulesBid(biddingState(capot, { capot: true })).action).toBe("capot");
    expect(chooseAdvancedRulesBid(biddingState(capot, { generale: true })).action).toBe("generale");
    expect(chooseAdvancedRulesBid(biddingState(strongTA, { capot: true })).action).not.toBe("capot");
    const teamCapot = [c("J", "hearts"), c("9", "hearts"), c("A", "hearts"), c("10", "hearts"),
      c("K", "hearts"), c("A", "clubs"), c("A", "diamonds"), c("7", "spades")];
    expect(chooseAdvancedRulesBid(biddingState(teamCapot)).action).not.toBe("capot");
    const partnerBid = { ...biddingState(teamCapot), bids: [
      { playerId: 2 as PlayerId, action: "bid" as const, value: 110 as const, trump: "hearts" as const },
    ] };
    expect(chooseAdvancedRulesBid(partnerBid)).toMatchObject({ action: "capot", contractMode: { kind: "suit", suit: "hearts" } });
    const allTrumpGenerale = [c("J", "clubs"), c("9", "clubs"), c("J", "diamonds"), c("9", "diamonds"),
      c("J", "hearts"), c("9", "hearts"), c("J", "spades"), c("9", "spades")];
    expect(chooseAdvancedRulesBid(biddingState(allTrumpGenerale, { ta: true, generale: true, generaleTA: true })))
      .toMatchObject({ action: "generale", contractMode: TA });
  });

  it("can Coinche SA and Surcoinche TA with demonstrated controls", () => {
    const defense = { ...biddingState(strongSA, { sa: true }), currentPlayerId: 1 as PlayerId,
      hands: { ...biddingState(strongSA, { sa: true }).hands, 1: strongSA },
      bids: [{ playerId: 0 as PlayerId, action: "bid" as const, value: 120 as const, contractMode: SA }] };
    expect(chooseAdvancedRulesBid(defense).action).toBe("coinche");
    const attack = { ...biddingState(dominantTA, { ta: true }), currentPlayerId: 2 as PlayerId,
      hands: { ...biddingState(dominantTA, { ta: true }).hands, 2: dominantTA },
      bids: [{ playerId: 0 as PlayerId, action: "bid" as const, value: 80 as const, contractMode: TA },
        { playerId: 1 as PlayerId, action: "coinche" as const }] };
    expect(chooseAdvancedRulesBid(attack).action).toBe("surcoinche");
    const allTrumpDefense = { ...biddingState(dominantTA, { ta: true }), currentPlayerId: 1 as PlayerId,
      hands: { ...biddingState(dominantTA, { ta: true }).hands, 1: dominantTA },
      bids: [{ playerId: 0 as PlayerId, action: "bid" as const, value: 100 as const, contractMode: TA }] };
    expect(chooseAdvancedRulesBid(allTrumpDefense).action).toBe("coinche");
  });

  it("never selects disabled special contracts", () => {
    const capot = [c("J", "clubs"), c("9", "clubs"), c("A", "clubs"), c("10", "clubs"), c("K", "clubs"),
      c("A", "diamonds"), c("A", "hearts"), c("A", "spades")];
    const state = biddingState(capot, { capot: false, generale: false });
    expect(["capot", "generale"].includes(chooseAdvancedRulesBid(state).action)).toBe(false);
  });
});

describe("advanced rules card play", () => {
  it("uses visible master ordering in SA and TA, always returning a legal card", () => {
    for (const [mode, hand, rank] of [[SA, strongSA, "A"], [TA, strongTA, "J"]] as const) {
      const state = playMode(mode, hand);
      const chosen = chooseAdvancedRulesCard(state);
      expect(playableCardsForCurrentPlayer(state)).toContainEqual(chosen);
      expect(chosen.rank).toBe(rank);
    }
  });

  it("avoids a voluntary defensive trump lead when reasonable side suits remain", () => {
    const hand = [c("J", "hearts"), c("9", "hearts"), c("A", "clubs"), c("7", "clubs"),
      c("K", "diamonds"), c("7", "diamonds"), c("8", "spades"), c("7", "spades")];
    const state = playMode({ kind: "suit", suit: "hearts" }, hand, 1);
    expect(chooseAdvancedRulesCard(state).suit).not.toBe("hearts");
  });

  it("still lets a strong taker draw trump", () => {
    const hand = [c("J", "hearts"), c("9", "hearts"), c("A", "hearts"), c("10", "hearts"),
      c("K", "hearts"), c("Q", "hearts"), c("A", "clubs"), c("7", "spades")];
    const state = playMode({ kind: "suit", suit: "hearts" }, hand, 0);
    expect(playableCardsForCurrentPlayer(state).some((card) => card.suit !== "hearts")).toBe(true);
    expect(chooseAdvancedRulesCard(state).suit).toBe("hearts");
  });

  it("still plays legal trump when forced or holding only trump", () => {
    const hand = [c("J", "hearts"), c("9", "hearts"), c("A", "hearts"), c("10", "hearts"),
      c("K", "hearts"), c("Q", "hearts"), c("8", "hearts"), c("7", "hearts")];
    const state = playMode({ kind: "suit", suit: "hearts" }, hand, 1);
    expect(chooseAdvancedRulesCard(state).suit).toBe("hearts");
  });

  it("honors compulsory cutting without treating it as a voluntary trump lead", () => {
    const hand = [c("J", "hearts"), c("9", "hearts"), c("A", "spades"), c("10", "spades"),
      c("K", "diamonds"), c("7", "diamonds"), c("8", "spades"), c("7", "spades")];
    const initial = playMode({ kind: "suit", suit: "hearts" }, hand, 1);
    const state = { ...initial, currentTrick: { leaderId: 0 as PlayerId,
      cards: [{ playerId: 0 as PlayerId, card: c("A", "clubs") }] } };
    const legal = playableCardsForCurrentPlayer(state);
    expect(legal.every((card) => card.suit === "hearts")).toBe(true);
    expect(legal).toContainEqual(chooseAdvancedRulesCard(state));
  });

  it("permits a late defensive trump lead when both remaining trumps are controlled", () => {
    const hand = [c("J", "hearts"), c("9", "hearts"), c("7", "clubs")];
    const initial = playMode({ kind: "suit", suit: "hearts" }, hand, 1);
    const played = createDeck().filter((card) => card.suit === "hearts" && card.rank !== "J" && card.rank !== "9")
      .concat(createDeck().filter((card) => card.suit !== "hearts" && !(card.suit === "clubs" && card.rank === "7")).slice(0, 14));
    const completedTricks = Array.from({ length: 5 }, (_, index) => ({
      leaderId: 0 as PlayerId, winnerId: 0 as PlayerId, points: 0,
      cards: played.slice(index * 4, index * 4 + 4).map((card, seat) => ({ card, playerId: seat as PlayerId })),
    }));
    const state = { ...initial, completedTricks, hands: { ...initial.hands, 1: hand } };
    expect(playableCardsForCurrentPlayer(state).some((card) => card.suit !== "hearts")).toBe(true);
    expect(chooseAdvancedRulesCard(state)).toEqual(c("J", "hearts"));
  });

  it("keeps decisions invariant when only hidden hands change", () => {
    const bidState = biddingState(strongSA, { sa: true });
    const changedBidState = { ...bidState, hands: { ...bidState.hands, 1: weak, 2: strongTA, 3: dominantTA } };
    expect(chooseAdvancedRulesBid(changedBidState)).toEqual(chooseAdvancedRulesBid(bidState));
    const cardState = playMode(SA, strongSA);
    const changedCardState = { ...cardState, hands: { ...cardState.hands, 1: weak, 2: dominantTA, 3: strongTA } };
    expect(chooseAdvancedRulesCard(changedCardState)).toEqual(chooseAdvancedRulesCard(cardState));
  });

  it("plays legal actions throughout seeded rounds in each supported variant", () => {
    for (const options of [
      {}, { announcements: true }, { sa: true }, { ta: true }, { capot: true },
      { generale: true }, { sa: true, ta: true, capot: true, generale: true, announcements: true },
    ]) {
      const starting = biddingState(weak, options);
      let state = createInitialGame(() => 0.41, { ruleset: starting.settings.ruleset });
      let guard = 0;
      while ((state.phase === "bidding" || state.phase === "playing") && guard < 80) {
        if (state.phase === "bidding") {
          const bid = chooseAdvancedRulesBid(state);
          state = makeBid(state, state.currentPlayerId, bid.action === "bid"
            ? { action: "bid", value: bid.value, ...(bid.contractMode ? { contractMode: bid.contractMode } : { trump: bid.trump! }) }
            : bid.action === "capot" || bid.action === "generale"
              ? { action: bid.action, contractMode: bid.contractMode }
              : { action: bid.action });
        } else {
          const card = chooseAdvancedRulesCard(state);
          expect(playableCardsForCurrentPlayer(state)).toContainEqual(card);
          state = playCard(state, state.currentPlayerId, card);
        }
        guard += 1;
      }
      expect(["finished", "game-over"].includes(state.phase)).toBe(true);
    }
  }, 30_000);
});
