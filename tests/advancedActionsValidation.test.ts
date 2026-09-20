import { describe, expect, it } from "vitest";
import { inactivePlayerId } from "@/engine/activePlayers";
import { createDeck } from "@/engine/cards";
import { createInitialGame, makeBid, playCard, playableCardsForCurrentPlayer } from "@/engine/game";
import { chooseAdvancedRulesBid } from "@/bots/strategy/advancedRulesBidding";
import { chooseAdvancedRulesCard } from "@/bots/strategy/advancedRulesCard";
import type { BidValue, Card, ContractMode, GameState, PlayerId } from "@/engine/types";
import { createTestRuleset } from "@/tests/helpers/rulesets";

const c = (rank: Card["rank"], suit: Card["suit"]): Card => ({ rank, suit });
const SA: ContractMode = { kind: "no-trump" };
const TA: ContractMode = { kind: "all-trump" };

type RuleOptions = {
  sa?: boolean;
  ta?: boolean;
  capot?: boolean;
  generale?: boolean;
  generaleTA?: boolean;
};

function sameCard(first: Card, second: Card): boolean {
  return first.rank === second.rank && first.suit === second.suit;
}

/** Builds a real 32-card deal: the tested hand exists once and every hidden hand has eight cards. */
function stateWithHand(playerId: PlayerId, hand: Card[], options: RuleOptions = {}): GameState {
  if (hand.length !== 8 || new Set(hand.map((card) => `${card.rank}-${card.suit}`)).size !== 8) {
    throw new Error("A deterministic hand must contain eight distinct cards.");
  }
  const ruleset = createTestRuleset({
    bidding: {
      allowNoTrump: options.sa ?? false,
      allowAllTrump: options.ta ?? false,
      allowCapot: options.capot ?? true,
      allowGenerale: options.generale ?? false,
      generaleAllowAllTrump: options.generaleTA ?? false,
    },
  });
  const state = createInitialGame(() => 0.1, { ruleset });
  const remaining = createDeck().filter((card) => !hand.some((held) => sameCard(held, card)));
  let cursor = 0;
  const hands = { 0: [] as Card[], 1: [] as Card[], 2: [] as Card[], 3: [] as Card[] };
  for (const seat of [0, 1, 2, 3] as PlayerId[]) {
    if (seat === playerId) hands[seat] = [...hand];
    else {
      hands[seat] = remaining.slice(cursor, cursor + 8);
      cursor += 8;
    }
  }
  return { ...state, hands };
}

function opponentSuitBid(hand: Card[], value: BidValue): GameState {
  return makeBid(stateWithHand(1, hand), 0, { action: "bid", value, trump: "hearts" });
}

function opponentModeBid(hand: Card[], value: BidValue, mode: ContractMode): GameState {
  return makeBid(stateWithHand(1, hand, { sa: true, ta: true }), 0, {
    action: "bid", value, contractMode: mode,
  });
}

function finishBidding(state: GameState): GameState {
  let next = state;
  while (next.phase === "bidding") next = makeBid(next, next.currentPlayerId, { action: "pass" });
  return next;
}

describe("V4 deterministic Coinche validation", () => {
  it("Coinches an obvious 140 suit contract with J-9 trump control and three outside controls", () => {
    const hand = [c("J", "hearts"), c("9", "hearts"), c("A", "clubs"), c("10", "clubs"),
      c("A", "diamonds"), c("10", "diamonds"), c("A", "spades"), c("10", "spades")];
    const state = opponentSuitBid(hand, 140);
    const decision = chooseAdvancedRulesBid(state);
    expect(decision).toEqual({ action: "coinche" });
    expect(() => makeBid(state, state.currentPlayerId, decision)).not.toThrow();
  });

  it("refuses a strong but limited suit defense without enough independent tricks", () => {
    const hand = [c("J", "hearts"), c("9", "hearts"), c("A", "clubs"), c("K", "clubs"),
      c("A", "diamonds"), c("K", "diamonds"), c("7", "spades"), c("8", "spades")];
    expect(chooseAdvancedRulesBid(opponentSuitBid(hand, 140)).action).toBe("pass");
  });

  it("refuses a weak suit Coinche even against a high contract", () => {
    const hand = [c("7", "hearts"), c("8", "hearts"), c("A", "clubs"), c("K", "clubs"),
      c("10", "diamonds"), c("Q", "diamonds"), c("7", "spades"), c("8", "spades")];
    expect(chooseAdvancedRulesBid(opponentSuitBid(hand, 150)).action).toBe("pass");
  });

  it("Coinches obvious No Trump and All Trump contracts", () => {
    const noTrump = [c("A", "clubs"), c("10", "clubs"), c("A", "diamonds"), c("10", "diamonds"),
      c("A", "hearts"), c("K", "hearts"), c("A", "spades"), c("10", "spades")];
    const allTrump = [c("J", "clubs"), c("9", "clubs"), c("J", "diamonds"), c("9", "diamonds"),
      c("J", "hearts"), c("A", "hearts"), c("J", "spades"), c("9", "spades")];
    expect(chooseAdvancedRulesBid(opponentModeBid(noTrump, 120, SA))).toEqual({ action: "coinche" });
    expect(chooseAdvancedRulesBid(opponentModeBid(allTrump, 120, TA))).toEqual({ action: "coinche" });
  });
});

describe("V4 deterministic Surcoinche validation", () => {
  function coinchedByOpponent(hand: Card[], mode: ContractMode, value: BidValue): GameState {
    let state = stateWithHand(2, hand, { sa: true, ta: true });
    state = mode.kind === "suit"
      ? makeBid(state, 0, { action: "bid", value, trump: mode.suit })
      : makeBid(state, 0, { action: "bid", value, contractMode: mode });
    return makeBid(state, 1, { action: "coinche" });
  }

  it("Surcoinches an obvious suit contract with a large intrinsic margin", () => {
    const hand = [c("J", "hearts"), c("9", "hearts"), c("A", "hearts"), c("10", "hearts"),
      c("K", "hearts"), c("A", "clubs"), c("A", "diamonds"), c("A", "spades")];
    const state = coinchedByOpponent(hand, { kind: "suit", suit: "hearts" }, 120);
    expect(chooseAdvancedRulesBid(state))
      .toEqual({ action: "surcoinche" });
  });

  it("refuses a marginal suit Surcoinche", () => {
    const hand = [c("J", "hearts"), c("9", "hearts"), c("A", "hearts"), c("7", "hearts"),
      c("A", "clubs"), c("K", "clubs"), c("Q", "diamonds"), c("7", "spades")];
    expect(chooseAdvancedRulesBid(coinchedByOpponent(hand, { kind: "suit", suit: "hearts" }, 140)).action)
      .toBe("pass");
  });

  it("Surcoinches SA and TA only with the required margin", () => {
    const noTrump = [c("A", "clubs"), c("10", "clubs"), c("A", "diamonds"), c("10", "diamonds"),
      c("A", "hearts"), c("K", "hearts"), c("A", "spades"), c("10", "spades")];
    const allTrump = [c("J", "clubs"), c("9", "clubs"), c("J", "diamonds"), c("9", "diamonds"),
      c("J", "hearts"), c("A", "hearts"), c("J", "spades"), c("9", "spades")];
    expect(chooseAdvancedRulesBid(coinchedByOpponent(noTrump, SA, 100))).toEqual({ action: "surcoinche" });
    expect(chooseAdvancedRulesBid(coinchedByOpponent(allTrump, TA, 100))).toEqual({ action: "surcoinche" });
  });

  it("never Surcoinches a partner's Générale from the inactive partner's hand", () => {
    const hand = [c("J", "clubs"), c("9", "clubs"), c("A", "clubs"), c("10", "clubs"), c("K", "clubs"),
      c("A", "diamonds"), c("A", "hearts"), c("A", "spades")];
    let state = stateWithHand(2, hand, { generale: true });
    state = makeBid(state, 0, { action: "generale", trump: "clubs" });
    state = makeBid(state, 1, { action: "coinche" });
    expect(chooseAdvancedRulesBid(state)).toEqual({ action: "pass" });
  });
});

describe("V4 deterministic Capot validation", () => {
  const perfectSuit = [c("J", "clubs"), c("9", "clubs"), c("A", "clubs"), c("10", "clubs"), c("K", "clubs"),
    c("A", "diamonds"), c("A", "hearts"), c("A", "spades")];
  const falseSuit = [c("J", "clubs"), c("9", "clubs"), c("A", "diamonds"), c("10", "diamonds"),
    c("A", "hearts"), c("10", "hearts"), c("A", "spades"), c("10", "spades")];

  it("accepts a perfect suit Capot and refuses side masters exposed to cuts", () => {
    expect(chooseAdvancedRulesBid(stateWithHand(0, perfectSuit))).toMatchObject({
      action: "capot", contractMode: { kind: "suit", suit: "clubs" },
    });
    expect(chooseAdvancedRulesBid(stateWithHand(0, falseSuit)).action).not.toBe("capot");
  });

  it("accepts one covered gap only after a strong public partner bid in the same suit", () => {
    const oneGap = [c("J", "hearts"), c("9", "hearts"), c("A", "hearts"), c("10", "hearts"), c("K", "hearts"),
      c("A", "clubs"), c("A", "diamonds"), c("7", "spades")];
    expect(chooseAdvancedRulesBid(stateWithHand(0, oneGap)).action).not.toBe("capot");
    let supported = stateWithHand(0, oneGap);
    supported = makeBid(supported, 0, { action: "pass" });
    supported = makeBid(supported, 1, { action: "pass" });
    supported = makeBid(supported, 2, { action: "bid", value: 110, trump: "hearts" });
    supported = makeBid(supported, 3, { action: "pass" });
    expect(chooseAdvancedRulesBid(supported)).toMatchObject({
      action: "capot", contractMode: { kind: "suit", suit: "hearts" },
    });
  });

  it("accepts complete SA and TA Capots only when those modes are enabled", () => {
    const noTrump = [c("A", "clubs"), c("10", "clubs"), c("K", "clubs"), c("Q", "clubs"),
      c("A", "diamonds"), c("10", "diamonds"), c("K", "diamonds"), c("Q", "diamonds")];
    const allTrump = [c("J", "clubs"), c("9", "clubs"), c("A", "clubs"), c("10", "clubs"),
      c("J", "diamonds"), c("9", "diamonds"), c("A", "diamonds"), c("10", "diamonds")];
    expect(chooseAdvancedRulesBid(stateWithHand(0, noTrump, { sa: true })))
      .toMatchObject({ action: "capot", contractMode: SA });
    expect(chooseAdvancedRulesBid(stateWithHand(0, allTrump, { ta: true })))
      .toMatchObject({ action: "capot", contractMode: TA });
    expect(chooseAdvancedRulesBid(stateWithHand(0, noTrump)).action).not.toBe("capot");
  });

  it("plays a perfect suit Capot to the all-team-tricks objective", () => {
    let state = stateWithHand(0, perfectSuit);
    state = makeBid(state, 0, { action: "capot", trump: "clubs" });
    state = finishBidding(state);
    while (state.phase === "playing") {
      const card = chooseAdvancedRulesCard(state);
      expect(playableCardsForCurrentPlayer(state)).toContainEqual(card);
      state = playCard(state, state.currentPlayerId, card);
    }
    expect(state.result).toMatchObject({ kind: "played", contractSucceeded: true, capotTeam: 0 });
  }, 20_000);
});

describe("V4 deterministic Générale and information validation", () => {
  const perfect = [c("J", "clubs"), c("9", "clubs"), c("A", "clubs"), c("10", "clubs"), c("K", "clubs"),
    c("A", "diamonds"), c("A", "hearts"), c("A", "spades")];

  it("accepts a perfect suit Générale and rejects one trump-sequence gap", () => {
    const gap = [c("J", "clubs"), c("9", "clubs"), c("A", "clubs"), c("10", "clubs"), c("Q", "clubs"),
      c("A", "diamonds"), c("A", "hearts"), c("A", "spades")];
    expect(chooseAdvancedRulesBid(stateWithHand(0, perfect, { generale: true }))).toMatchObject({
      action: "generale", contractMode: { kind: "suit", suit: "clubs" },
    });
    expect(chooseAdvancedRulesBid(stateWithHand(0, gap, { generale: true })).action).not.toBe("generale");
  });

  it("accepts a perfect TA Générale only when the ruleset allows that mode", () => {
    const hand = [c("J", "clubs"), c("9", "clubs"), c("J", "diamonds"), c("9", "diamonds"),
      c("J", "hearts"), c("9", "hearts"), c("J", "spades"), c("9", "spades")];
    expect(chooseAdvancedRulesBid(stateWithHand(0, hand, { ta: true, generale: true })).action)
      .not.toBe("generale");
    expect(chooseAdvancedRulesBid(stateWithHand(0, hand, { ta: true, generale: true, generaleTA: true })))
      .toMatchObject({ action: "generale", contractMode: TA });
    expect(chooseAdvancedRulesBid(stateWithHand(0, perfect)).action).not.toBe("generale");
  });

  it("keeps the partner inactive and wins a perfect Générale with eight personal tricks", () => {
    let state = stateWithHand(0, perfect, { generale: true });
    state = makeBid(state, 0, { action: "generale", trump: "clubs" });
    state = finishBidding(state);
    expect(inactivePlayerId(state)).toBe(2);
    const inactiveHand = [...state.hands[2]];
    while (state.phase === "playing") {
      expect(state.currentPlayerId).not.toBe(2);
      const card = chooseAdvancedRulesCard(state);
      expect(playableCardsForCurrentPlayer(state)).toContainEqual(card);
      state = playCard(state, state.currentPlayerId, card);
    }
    expect(state.hands[2]).toEqual(inactiveHand);
    expect(state.result).toMatchObject({
      kind: "played", contractSucceeded: true, tricksWonByPlayer: { 0: 8, 2: 0 },
    });
  }, 20_000);

  it("uses only the tested hand and public bids when hidden hands are permuted", () => {
    const hand = [c("J", "hearts"), c("9", "hearts"), c("A", "clubs"), c("10", "clubs"),
      c("A", "diamonds"), c("10", "diamonds"), c("A", "spades"), c("10", "spades")];
    const state = opponentSuitBid(hand, 140);
    const permuted = { ...state, hands: {
      0: [...state.hands[2]], 1: [...state.hands[1]], 2: [...state.hands[3]], 3: [...state.hands[0]],
    } };
    expect(chooseAdvancedRulesBid(permuted)).toEqual(chooseAdvancedRulesBid(state));
    const decision = chooseAdvancedRulesBid(permuted);
    expect(() => makeBid(permuted, permuted.currentPlayerId, decision)).not.toThrow();
  });

  it("keeps card play identical after a legal permutation of hidden hands", () => {
    const hand = [c("A", "clubs"), c("10", "clubs"), c("A", "diamonds"), c("10", "diamonds"),
      c("A", "hearts"), c("K", "hearts"), c("A", "spades"), c("10", "spades")];
    let state = stateWithHand(0, hand, { sa: true });
    state = makeBid(state, 0, { action: "bid", value: 100, contractMode: SA });
    state = finishBidding(state);
    const permuted = { ...state, hands: {
      0: [...state.hands[0]], 1: [...state.hands[3]], 2: [...state.hands[1]], 3: [...state.hands[2]],
    } };
    const decision = chooseAdvancedRulesCard(state);
    expect(chooseAdvancedRulesCard(permuted)).toEqual(decision);
    expect(playableCardsForCurrentPlayer(permuted)).toContainEqual(decision);
  });
});
