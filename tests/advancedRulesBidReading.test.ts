import { describe, expect, it } from "vitest";
import { chooseAdvancedRulesBidWithTrace } from "@/bots/strategy/advancedRulesBidding";
import {
  interpretAdvancedRulesBid, type AdvancedRulesBidPromise, type BidPromiseAssertion,
  type PublicBidReadingContext,
} from "@/bots/strategy/advancedRulesBidReading";
import { cardId, createDeck } from "@/engine/cards";
import { createInitialGame, makeBid } from "@/engine/game";
import { getCurrentContractFromBids } from "@/engine/bidding";
import { CONTREE_KFFR_RULESET } from "@/engine/rulesets/presets";
import { generateBidReadingSeries } from "@/engine/training/bidReading";
import { generatorVersion } from "@/engine/training/generator";
import type { Bid, Card, GameState, Suit } from "@/engine/types";

const c = (rank: Card["rank"], suit: Suit): Card => ({ rank, suit });

function stateWithHand(hand: Card[]): GameState {
  const initial = createInitialGame(() => 0.1, { ruleset: CONTREE_KFFR_RULESET });
  const held = new Set(hand.map(cardId));
  const other = createDeck().filter((card) => !held.has(cardId(card)));
  expect(hand).toHaveLength(8);
  expect(held.size).toBe(8);
  return { ...initial, hands: { 0: hand, 1: other.slice(0, 8), 2: other.slice(8, 16), 3: other.slice(16, 24) } };
}

function publicContext(state: GameState): PublicBidReadingContext {
  return { startingPlayerId: state.startingPlayerId, totalScore: state.totalScore,
    bidsBefore: state.bids, targetPlayerId: state.currentPlayerId,
    rulesetId: "contree-kffr", rulesetVersion: 1 };
}

function forwardAndRead(state: GameState) {
  const decision = chooseAdvancedRulesBidWithTrace(state);
  const next = makeBid(state, state.currentPlayerId, decision.bid);
  const observed = next.bids.at(-1)!;
  return { decision, observed, promise: interpretAdvancedRulesBid(publicContext(state), observed) };
}

function suitOf(bid: Bid): Suit | null {
  return bid.action === "bid" || bid.action === "capot"
    ? bid.contractMode?.kind === "suit" ? bid.contractMode.suit : bid.trump ?? null : null;
}

/** Test-only guard: exact-card promises must hold in every real example hand. */
function assertPromiseSatisfiedByHand(promise: AdvancedRulesBidPromise, hand: Card[], bid: Bid, bidsBefore: readonly Bid[] = []): void {
  const suit = suitOf(bid) ?? getCurrentContractFromBids(bidsBefore)?.trump ?? null;
  const trumps = hand.filter((card) => card.suit === suit);
  const has = (rank: Card["rank"]) => trumps.some((card) => card.rank === rank);
  const outsideAces = hand.filter((card) => card.suit !== suit && card.rank === "A").length;
  const checks: Partial<Record<BidPromiseAssertion, () => boolean>> = {
    "has-jack": () => has("J"), "has-nine": () => has("9"),
    "has-at-least-one-major": () => has("J") || has("9"),
    "has-both-majors": () => has("J") && has("9"),
    "at-least-two-trumps": () => trumps.length >= 2,
    "at-least-three-trumps": () => trumps.length >= 3,
    "at-least-four-trumps": () => trumps.length >= 4,
    "at-least-five-trumps": () => trumps.length >= 5,
    "at-least-one-outside-ace": () => outsideAces >= 1,
    "at-least-two-outside-aces": () => outsideAces >= 2,
    "strong-partner-fit": () => trumps.length >= 2 && (has("J") || has("9")),
    "exceptional-suit-override": () => has("J") && has("9") && trumps.length >= 3 && outsideAces >= 1,
    "classical-defensive-control": () => has("J") && has("9"),
  };
  for (const assertion of promise.guaranteed) {
    if (checks[assertion]) expect(checks[assertion]!(), `False public promise: ${assertion}, suit=${suit}, hand=${hand.map(cardId).join(",")}`).toBe(true);
  }
}

const series = (level: 1 | 2 | 3 | 4) => generateBidReadingSeries({
  seed: 8_000_000_000 + level * 10_000_000, level, generatorVersion, axisVersion: 1,
});

describe("Advanced Rules V4.1 public bid reading", () => {
  it("keeps 80♥ ambiguous across a single-major probe and a weak-long hand", () => {
    const probe = stateWithHand([c("9", "hearts"), c("A", "hearts"), c("7", "hearts"),
      c("10", "spades"), c("10", "diamonds"), c("K", "diamonds"), c("7", "diamonds"), c("8", "clubs")]);
    const weakLong = stateWithHand([c("7", "hearts"), c("8", "hearts"), c("Q", "hearts"), c("K", "hearts"),
      c("A", "clubs"), c("10", "clubs"), c("A", "diamonds"), c("10", "diamonds")]);
    const first = forwardAndRead(probe);
    const second = forwardAndRead(weakLong);
    expect(first.observed).toMatchObject({ action: "bid", value: 80, trump: "hearts" });
    expect(second.observed).toMatchObject({ action: "bid", value: 80, trump: "hearts" });
    expect(first.promise).toEqual(second.promise);
    expect(first.promise.guaranteed).toContain("shows-suit");
    for (const falsePromise of ["has-jack", "has-nine", "has-both-majors", "at-least-four-trumps"] as const) {
      expect(first.promise.guaranteed).not.toContain(falsePromise);
    }
    expect(first.promise.possibleMeanings).toEqual(expect.arrayContaining(["single-major-probe", "weak-long-80"]));
    assertPromiseSatisfiedByHand(first.promise, probe.hands[0], first.observed);
    assertPromiseSatisfiedByHand(second.promise, weakLong.hands[0], second.observed);
  });

  it("reads opening 90 and 100 conservatively", () => {
    const first = series(1);
    for (const index of [2, 3, 8]) {
      const exercise = first[index];
      expect(exercise.targetBid.action).toBe("bid");
      expect(exercise.promise.guaranteed).toContain("has-at-least-one-major");
      expect(exercise.promise.guaranteed).not.toContain("has-both-majors");
      expect(exercise.promise.guaranteed).not.toContain("at-least-four-trumps");
      assertPromiseSatisfiedByHand(exercise.promise, exercise.illustrationHand, exercise.targetBid, exercise.publicContext.bidsBefore);
    }
  });

  it("intersects both exceptional 110 opening branches without promising five trumps or two outside Aces", () => {
    const [fiveOne, fourTwo] = [series(1)[4], series(1)[5]];
    for (const exercise of [fiveOne, fourTwo]) {
      expect(exercise.targetBid).toMatchObject({ action: "bid", value: 110 });
      expect(exercise.promise.guaranteed).toEqual(expect.arrayContaining([
        "has-jack", "has-nine", "at-least-four-trumps", "at-least-one-outside-ace",
      ]));
      expect(exercise.promise.guaranteed).not.toContain("at-least-five-trumps");
      expect(exercise.promise.guaranteed).not.toContain("at-least-two-outside-aces");
      assertPromiseSatisfiedByHand(exercise.promise, exercise.illustrationHand, exercise.targetBid);
    }
    const count = (exercise: typeof fiveOne) => exercise.illustrationHand.filter((card) => card.suit === suitOf(exercise.targetBid)).length;
    const aces = (exercise: typeof fiveOne) => exercise.illustrationHand.filter((card) => card.suit !== suitOf(exercise.targetBid) && card.rank === "A").length;
    expect(count(fiveOne)).toBeGreaterThanOrEqual(5);
    expect(aces(fiveOne)).toBe(1);
    expect(count(fourTwo)).toBe(4);
    expect(aces(fourTwo)).toBeGreaterThanOrEqual(2);
    expect(fiveOne.promise.guaranteed).toEqual(fourTwo.promise.guaranteed);
    expect(fiveOne.promise.possibleMeanings).toEqual(fourTwo.promise.possibleMeanings);
  });

  it("distinguishes 90 partner support, strong support, and exceptional suit override", () => {
    const samples = series(2);
    const support = samples[0];
    expect(support.targetBid).toMatchObject({ action: "bid", value: 90 });
    expect(support.promise.guaranteed).toContain("supports-partner-suit");
    expect(support.promise.guaranteed).toContain("has-at-least-one-major");
    expect(support.promise.guaranteed).not.toContain("has-jack");
    expect(support.promise.guaranteed).not.toContain("has-nine");
    const strong = samples[1];
    expect(strong.promise.guaranteed).toContain("strong-partner-fit");
    expect(strong.promise.guaranteed).not.toContain("has-both-majors");
    const singleMajorStrong = samples[4];
    expect(singleMajorStrong.promise.guaranteed).toContain("strong-partner-fit");
    expect(singleMajorStrong.promise.guaranteed).not.toContain("has-both-majors");
    expect(singleMajorStrong.illustrationHand.filter((card) => card.suit === suitOf(singleMajorStrong.targetBid)
      && (card.rank === "J" || card.rank === "9"))).toHaveLength(1);
    const override = samples[3];
    expect(override.promise.guaranteed).toEqual(expect.arrayContaining([
      "exceptional-suit-override", "has-jack", "has-nine", "at-least-three-trumps", "at-least-one-outside-ace",
    ]));
    for (const exercise of [support, strong, override]) {
      assertPromiseSatisfiedByHand(exercise.promise, exercise.illustrationHand, exercise.targetBid, exercise.publicContext.bidsBefore);
    }
  });

  it("keeps 120/130 Coinche classical, but does not invent J+9 at 140/150/160", () => {
    const samples = series(3);
    for (const index of [3, 4]) {
      const exercise = samples[index];
      expect(exercise.promise.guaranteed).toEqual(expect.arrayContaining([
        "has-jack", "has-nine", "classical-defensive-control", "defensive-control",
      ]));
      expect(exercise.promise.possibleMeanings).toEqual(["classical-coinche"]);
      assertPromiseSatisfiedByHand(exercise.promise, exercise.illustrationHand, exercise.targetBid, exercise.publicContext.bidsBefore);
    }
    for (const index of [5, 6, 7, 8]) {
      const exercise = samples[index];
      expect(exercise.promise.guaranteed).toContain("defensive-control");
      expect(exercise.promise.guaranteed).not.toContain("has-both-majors");
      expect(exercise.promise.guaranteed).not.toContain("has-jack");
      expect(exercise.promise.guaranteed).not.toContain("has-nine");
      expect(exercise.promise.possibleMeanings).toEqual(expect.arrayContaining([
        "classical-coinche", "side-controls-coinche", "trump-lock-coinche", "combined-coinche",
      ]));
    }
    expect(samples[6].illustrationHand.some((card) => card.rank === "J" && card.suit === "hearts")).toBe(false);
    expect(samples[7].illustrationHand).not.toEqual(samples[6].illustrationHand);
    expect(samples[6].promise.guaranteed).toEqual(samples[7].promise.guaranteed);
    expect(samples[6].promise.possibleMeanings).toEqual(samples[7].promise.possibleMeanings);
  });

  it("gives identical public 160 Coinche promises to side controls and a trump lock", () => {
    const sideControls = [c("7", "hearts"), c("8", "hearts"), c("A", "clubs"), c("10", "clubs"),
      c("A", "diamonds"), c("10", "diamonds"), c("A", "spades"), c("10", "spades")];
    const trumpLock = [c("J", "hearts"), c("9", "hearts"), c("A", "hearts"), c("10", "hearts"),
      c("7", "clubs"), c("8", "clubs"), c("7", "diamonds"), c("8", "diamonds")];
    const against160 = (hand: Card[]) => {
      const initial = stateWithHand(hand);
      return makeBid({ ...initial, startingPlayerId: 3, currentPlayerId: 3 }, 3,
        { action: "bid", value: 160, trump: "hearts" });
    };
    const side = forwardAndRead(against160(sideControls));
    const lock = forwardAndRead(against160(trumpLock));
    expect(side.observed.action).toBe("coinche");
    expect(lock.observed.action).toBe("coinche");
    expect(side.promise).toEqual(lock.promise);
    expect(side.promise.guaranteed).not.toContain("has-both-majors");
    expect(sideControls.some((card) => card.suit === "hearts" && (card.rank === "J" || card.rank === "9"))).toBe(false);
  });

  it("treats Surcoinche as a margin and separates personal from partner-supported Capot", () => {
    const doubled = series(3)[9];
    expect(doubled.targetBid.action).toBe("surcoinche");
    expect(doubled.promise.guaranteed).toContain("exceptional-surcoinche-margin");
    for (const exactCard of ["has-jack", "has-nine", "has-both-majors"] as const) {
      expect(doubled.promise.guaranteed).not.toContain(exactCard);
    }
    const masters = [c("J", "hearts"), c("9", "hearts"), c("A", "hearts"), c("10", "hearts"),
      c("K", "hearts"), c("A", "clubs"), c("A", "diamonds"), c("A", "spades")];
    const personal = forwardAndRead(stateWithHand(masters));
    expect(personal.observed.action).toBe("capot");
    expect(personal.promise.guaranteed).toEqual(["capot-level-control"]);
    expect(personal.promise.possibleMeanings).toEqual(["personal-capot"]);
    const oneGap = [c("J", "hearts"), c("9", "hearts"), c("A", "hearts"), c("10", "hearts"),
      c("K", "hearts"), c("A", "clubs"), c("A", "diamonds"), c("7", "spades")];
    let partnerState = stateWithHand(oneGap);
    partnerState = makeBid(partnerState, 0, { action: "pass" });
    partnerState = makeBid(partnerState, 1, { action: "pass" });
    partnerState = makeBid(partnerState, 2, { action: "bid", value: 110, trump: "hearts" });
    partnerState = makeBid(partnerState, 3, { action: "pass" });
    const partner = forwardAndRead(partnerState);
    expect(partner.observed.action).toBe("capot");
    expect(partner.promise.guaranteed).toEqual(["capot-level-control"]);
    expect(partner.promise.possibleMeanings).toEqual(["personal-capot", "partner-supported-capot"]);
  });

  it("adds public guarantees after 80 → partner support → rebid, and ignores hidden-hand permutations", () => {
    const rebid = series(4)[0];
    expect(rebid.publicBids.filter((bid) => bid.playerId === rebid.targetPlayerId)).toHaveLength(2);
    expect(rebid.promise.guaranteed).toContain("has-at-least-one-major");
    expect(rebid.promise.possibleMeanings).toContain("rebid-after-support");
    const example = stateWithHand([c("9", "hearts"), c("A", "hearts"), c("7", "hearts"),
      c("10", "spades"), c("10", "diamonds"), c("K", "diamonds"), c("7", "diamonds"), c("8", "clubs")]);
    const publicBid = forwardAndRead(example);
    const shuffled = { ...example, hands: { ...example.hands,
      1: example.hands[2], 2: example.hands[3], 3: example.hands[1] } };
    expect(forwardAndRead(shuffled).promise).toEqual(publicBid.promise);
    expect(interpretAdvancedRulesBid(publicContext(example), publicBid.observed)).toEqual(publicBid.promise);
    const everyHandChanged = { ...example, hands: { 0: example.hands[1], 1: example.hands[2],
      2: example.hands[3], 3: example.hands[0] } };
    expect(interpretAdvancedRulesBid(publicContext(everyHandChanged), publicBid.observed)).toEqual(publicBid.promise);
  });

  it("does not overpromise exact cards across seeded examples of all four levels", () => {
    for (const level of [1, 2, 3, 4] as const) for (const offset of [0, 10_000, 20_000]) {
      const samples = generateBidReadingSeries({ seed: 8_000_000_000 + level * 10_000_000 + offset,
        level, generatorVersion, axisVersion: 1 });
      for (const exercise of samples) {
        try {
          assertPromiseSatisfiedByHand(exercise.promise, exercise.illustrationHand, exercise.targetBid,
            exercise.publicContext.bidsBefore);
        } catch (error) {
          throw new Error(`level=${level} offset=${offset} family=${exercise.slotFamily} bid=${JSON.stringify(exercise.targetBid)} prior=${JSON.stringify(exercise.publicContext.bidsBefore)}: ${String(error)}`);
        }
      }
    }
  });
});
