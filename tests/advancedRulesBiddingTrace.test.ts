import { describe, expect, it } from "vitest";
import { chooseAdvancedRulesBid, chooseAdvancedRulesBidWithTrace } from "@/bots/strategy/advancedRulesBidding";
import { estimateDefensiveTricks } from "@/bots/evaluation/advancedRulesEvaluation";
import { createDeck } from "@/engine/cards";
import { createInitialGame, makeBid } from "@/engine/game";
import type { BidValue, Card, GameState, PlayerId } from "@/engine/types";
import { createTestRuleset } from "@/tests/helpers/rulesets";

const c = (rank: Card["rank"], suit: Card["suit"]): Card => ({ rank, suit });
const hearts = { kind: "suit" as const, suit: "hearts" as const };
const classic = [c("J", "hearts"), c("9", "hearts"), c("A", "clubs"), c("10", "clubs"),
  c("A", "diamonds"), c("10", "diamonds"), c("A", "spades"), c("10", "spades")];
const exceptional = [c("7", "hearts"), c("8", "hearts"), c("A", "clubs"), c("10", "clubs"),
  c("A", "diamonds"), c("10", "diamonds"), c("A", "spades"), c("10", "spades")];
const strong = [c("7", "hearts"), c("8", "hearts"), c("A", "clubs"), c("10", "clubs"),
  c("A", "diamonds"), c("10", "diamonds"), c("A", "spades"), c("K", "spades")];
const twoPairs = [c("7", "hearts"), c("8", "hearts"), c("A", "clubs"), c("10", "clubs"),
  c("A", "diamonds"), c("10", "diamonds"), c("K", "spades"), c("Q", "spades")];
const deceptive = [c("7", "hearts"), c("8", "hearts"), c("A", "clubs"), c("K", "clubs"),
  c("A", "diamonds"), c("K", "diamonds"), c("A", "spades"), c("K", "spades")];
const weak = [c("7", "hearts"), c("8", "hearts"), c("Q", "hearts"), c("K", "hearts"),
  c("7", "clubs"), c("8", "clubs"), c("7", "diamonds"), c("8", "diamonds")];
const show80 = [c("7", "hearts"), c("8", "hearts"), c("Q", "hearts"), c("K", "hearts"),
  c("A", "clubs"), c("10", "clubs"), c("A", "diamonds"), c("10", "diamonds")];

function stateWithHand(seat: PlayerId, hand: Card[], options: { generale?: boolean; sa?: boolean } = {}): GameState {
  expect(hand).toHaveLength(8);
  expect(new Set(hand.map((card) => `${card.rank}-${card.suit}`)).size).toBe(8);
  const initial = createInitialGame(() => 0.1, { ruleset: createTestRuleset({
    bidding: { allowGenerale: options.generale ?? false, allowNoTrump: options.sa ?? false },
  }) });
  const remaining = createDeck().filter((card) => !hand.some((held) => held.rank === card.rank && held.suit === card.suit));
  const hands = { 0: [] as Card[], 1: [] as Card[], 2: [] as Card[], 3: [] as Card[] };
  let cursor = 0;
  for (const player of [0, 1, 2, 3] as PlayerId[]) {
    hands[player] = player === seat ? [...hand] : remaining.slice(cursor, cursor += 8);
  }
  return { ...initial, hands };
}

function against(hand: Card[], value: BidValue): GameState {
  return makeBid(stateWithHand(1, hand), 0, { action: "bid", value, trump: "hearts" });
}

function permuteHidden(state: GameState): GameState {
  const seat = state.currentPlayerId;
  const hidden = ([0, 1, 2, 3] as PlayerId[]).filter((player) => player !== seat);
  return { ...state, hands: { ...state.hands,
    [hidden[0]]: [...state.hands[hidden[1]]],
    [hidden[1]]: [...state.hands[hidden[2]]],
    [hidden[2]]: [...state.hands[hidden[0]]],
  } };
}

describe("advanced rules V4.1 defensive bidding", () => {
  it("keeps the classical J+9 path at 120 and 4.5 estimated tricks", () => {
    const state = against(classic, 140);
    const result = chooseAdvancedRulesBidWithTrace(state);
    expect(result.bid).toEqual({ action: "coinche" });
    expect(result.trace).toMatchObject({ decisionBranch: "coinche-control",
      reasonCode: "coinche-strong-trump-control", coincheReason: "control" });
    expect(() => makeBid(state, state.currentPlayerId, result.bid)).not.toThrow();
  });

  it.each([
    [140, exceptional, 4.65, "coinche"],
    [140, strong, 3.95, "pass"],
    [150, strong, 3.95, "coinche"],
    [150, deceptive, 2.55, "pass"],
    [160, twoPairs, 3.1, "coinche"],
    [160, weak, 0.4, "pass"],
  ] as const)("decides a %i overbid from real defensive controls", (value, hand, estimate, action) => {
    const state = against(hand, value);
    expect(estimateDefensiveTricks(hand, hearts)).toBeCloseTo(estimate);
    const result = chooseAdvancedRulesBidWithTrace(state);
    expect(result.bid.action).toBe(action);
    if (action === "coinche") {
      expect(result.trace).toMatchObject({ decisionBranch: "coinche-overbid",
        reasonCode: "coinche-obvious-overbid", coincheReason: "overbid" });
    }
    expect(() => makeBid(state, state.currentPlayerId, result.bid)).not.toThrow();
  });

  it("does not turn a strong defense into an automatic Coinche at 100 or 110", () => {
    for (const value of [100, 110] as const) {
      const result = chooseAdvancedRulesBidWithTrace(against(exceptional, value));
      expect(result.bid.action).not.toBe("coinche");
      expect(result.trace.defensiveAssessment?.overbidThreshold).toBeNull();
    }
  });

  it("gives the same bid and trace when all three hidden hands are permuted", () => {
    for (const state of [against(strong, 150), stateWithHand(0, show80)]) {
      expect(chooseAdvancedRulesBidWithTrace(permuteHidden(state)))
        .toEqual(chooseAdvancedRulesBidWithTrace(state));
    }
  });

  it("traces Surcoinche, Capot, Générale, and an enabled special mode", () => {
    const masters = [c("J", "hearts"), c("9", "hearts"), c("A", "hearts"), c("10", "hearts"),
      c("K", "hearts"), c("A", "clubs"), c("A", "diamonds"), c("A", "spades")];
    const capot = chooseAdvancedRulesBidWithTrace(stateWithHand(0, masters));
    expect(capot.trace).toMatchObject({ decisionBranch: "capot", reasonCode: "capot-full-control" });
    const generale = chooseAdvancedRulesBidWithTrace(stateWithHand(0, masters, { generale: true }));
    expect(generale.trace).toMatchObject({ decisionBranch: "generale", reasonCode: "generale-full-control" });

    let doubled = stateWithHand(2, masters);
    doubled = makeBid(doubled, 0, { action: "bid", value: 120, trump: "hearts" });
    doubled = makeBid(doubled, 1, { action: "coinche" });
    expect(chooseAdvancedRulesBidWithTrace(doubled).trace)
      .toMatchObject({ decisionBranch: "surcoinche", reasonCode: "surcoinche-large-margin" });

    const noTrump = [c("A", "clubs"), c("10", "clubs"), c("A", "diamonds"), c("10", "diamonds"),
      c("A", "hearts"), c("K", "hearts"), c("A", "spades"), c("10", "spades")];
    expect(chooseAdvancedRulesBidWithTrace(stateWithHand(0, noTrump, { sa: true })).trace)
      .toMatchObject({ decisionBranch: "special-mode", reasonCode: "special-mode-strength" });
  });

  it("distinguishes a partner-supported Capot from full personal control", () => {
    const oneGap = [c("J", "hearts"), c("9", "hearts"), c("A", "hearts"), c("10", "hearts"),
      c("K", "hearts"), c("A", "clubs"), c("A", "diamonds"), c("7", "spades")];
    let state = stateWithHand(0, oneGap);
    state = makeBid(state, 0, { action: "pass" });
    state = makeBid(state, 1, { action: "pass" });
    state = makeBid(state, 2, { action: "bid", value: 110, trump: "hearts" });
    state = makeBid(state, 3, { action: "pass" });
    expect(chooseAdvancedRulesBidWithTrace(state)).toMatchObject({
      bid: { action: "capot" }, trace: { decisionBranch: "capot", reasonCode: "capot-partner-supported" },
    });
  });
});

describe("advanced rules V4.1 weak long trump", () => {
  it("passes with four small trumps and no outside control", () => {
    const result = chooseAdvancedRulesBidWithTrace(stateWithHand(0, weak));
    expect(result.bid).toEqual({ action: "pass" });
    expect(result.trace).toMatchObject({ weakTrumpCapApplied: true, effectiveCeiling: null,
      reasonCode: "weak-trump-foundation" });
  });

  it("shows 80 with two protected outside Ace-Ten controls, but never 90 in that suit", () => {
    const opening = stateWithHand(0, show80);
    const result = chooseAdvancedRulesBidWithTrace(opening);
    expect(result.bid).toEqual({ action: "bid", value: 80, trump: "hearts" });
    expect(result.trace).toMatchObject({ weakTrumpCapApplied: true, effectiveCeiling: 80,
      reasonCode: "weak-long-trump-show-80" });
    expect(() => makeBid(opening, 0, result.bid)).not.toThrow();

    const response = against(show80, 80);
    const afterOpponent80 = chooseAdvancedRulesBidWithTrace(response);
    expect(afterOpponent80.bid).toEqual({ action: "pass" });
    expect(afterOpponent80.trace).toMatchObject({ weakTrumpCapApplied: true, effectiveCeiling: 80 });
  });

  it("does not raise its own weak 80 after partner support or partner's weak suit", () => {
    let rebid = stateWithHand(0, show80);
    rebid = makeBid(rebid, 0, { action: "bid", value: 80, trump: "hearts" });
    rebid = makeBid(rebid, 1, { action: "pass" });
    rebid = makeBid(rebid, 2, { action: "bid", value: 90, trump: "hearts" });
    rebid = makeBid(rebid, 3, { action: "pass" });
    expect(chooseAdvancedRulesBidWithTrace(rebid)).toMatchObject({
      bid: { action: "pass" },
      trace: { weakTrumpCapApplied: true, effectiveCeiling: 80, reasonCode: "weak-trump-foundation" },
    });

    let partner = stateWithHand(0, show80);
    partner = makeBid(partner, 0, { action: "pass" });
    partner = makeBid(partner, 1, { action: "pass" });
    partner = makeBid(partner, 2, { action: "bid", value: 80, trump: "hearts" });
    partner = makeBid(partner, 3, { action: "pass" });
    expect(chooseAdvancedRulesBidWithTrace(partner).bid).toEqual({ action: "pass" });
  });

  it.each(["J", "9"] as const)("removes the weak-trump cap when %s is present", (rank) => {
    const hand = [c(rank, "hearts"), ...show80.slice(1)];
    const result = chooseAdvancedRulesBidWithTrace(stateWithHand(0, hand));
    expect(result.trace.weakTrumpCapApplied).toBe(false);
    expect(result.trace.effectiveCeiling).toBeGreaterThan(80);
    expect(result.bid).toEqual(chooseAdvancedRulesBid(stateWithHand(0, hand)));
  });
});

describe("advanced rules V4.1 suit conversation", () => {
  const probe = [c("9", "hearts"), c("A", "hearts"), c("7", "hearts"), c("10", "spades"),
    c("10", "diamonds"), c("K", "diamonds"), c("7", "diamonds"), c("8", "clubs")];

  it("keeps the single-major 80 message and partner-supported rebid", () => {
    const opening = chooseAdvancedRulesBidWithTrace(stateWithHand(0, probe));
    expect(opening).toMatchObject({ bid: { action: "bid", value: 80, trump: "hearts" },
      trace: { reasonCode: "single-major-probe", suitFoundation: "one-major" } });

    let rebid = stateWithHand(0, probe);
    rebid = makeBid(rebid, 0, { action: "bid", value: 80, trump: "hearts" });
    rebid = makeBid(rebid, 1, { action: "pass" });
    rebid = makeBid(rebid, 2, { action: "bid", value: 90, trump: "hearts" });
    rebid = makeBid(rebid, 3, { action: "pass" });
    const supported = chooseAdvancedRulesBidWithTrace(rebid);
    expect(supported).toMatchObject({
      bid: { action: "bid", value: 100, trump: "hearts" },
      trace: { reasonCode: "rebid-after-support", weakTrumpCapApplied: false,
        communicationIntent: "rebid-after-support" },
    });
    expect(supported.trace.effectiveCeiling).toBeGreaterThanOrEqual(100);
  });

  it("respects the partner's suit unless a different foundation is exceptional", () => {
    const hand = [c("J", "hearts"), c("9", "hearts"), c("A", "hearts"), c("K", "hearts"),
      c("A", "diamonds"), c("7", "clubs"), c("8", "clubs"), c("7", "spades")];
    let partner = stateWithHand(0, hand);
    partner = makeBid(partner, 0, { action: "pass" });
    partner = makeBid(partner, 1, { action: "pass" });
    partner = makeBid(partner, 2, { action: "bid", value: 80, trump: "clubs" });
    partner = makeBid(partner, 3, { action: "pass" });
    expect(chooseAdvancedRulesBidWithTrace(partner)).toMatchObject({
      bid: { action: "bid", value: 90, trump: "hearts" },
      trace: { reasonCode: "partner-suit-override", partnerSuitOverride: "allowed" },
    });
  });
});
