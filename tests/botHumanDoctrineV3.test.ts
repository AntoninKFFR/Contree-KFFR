import { describe, expect, it } from "vitest";
import { OFFICIAL_BOT_PROFILE_ID } from "@/bots/profiles";
import { chooseBotBid } from "@/bots/simpleBot";
import {
  chooseHumanDoctrineV3Bid,
  classifyTrumpFoundation,
  evaluatePartnerFit,
} from "@/bots/strategy/humanDoctrineV3";
import { evaluateIntrinsicHand } from "@/bots/strategy/humanDoctrineV2";
import type { Bid, Card, GameState, PlayerId, Suit } from "@/engine/types";
import { findBotStrategy } from "@/simulation/botRegistry";

const c = (rank: Card["rank"], suit: Suit): Card => ({ rank, suit });

function stateWith(
  hand: Card[],
  bids: Bid[] = [],
  currentPlayerId: PlayerId = 0,
  startingPlayerId: PlayerId = 0,
  hiddenHands?: Partial<GameState["hands"]>,
): GameState {
  return {
    settings: { scoringMode: "ffb", targetScore: 1000 },
    phase: "bidding",
    roundNumber: 1,
    startingPlayerId,
    totalScore: { 0: 0, 1: 0 },
    roundHistory: [],
    winnerTeam: null,
    trump: null,
    hands: {
      0: currentPlayerId === 0 ? hand : [c("7", "clubs")],
      1: [c("8", "clubs")],
      2: [c("7", "diamonds")],
      3: currentPlayerId === 3 ? hand : [c("8", "diamonds")],
      ...hiddenHands,
    },
    currentPlayerId,
    currentTrick: { leaderId: startingPlayerId, cards: [] },
    completedTricks: [],
    bids,
    contract: null,
    result: null,
    trickPoints: { 0: 0, 1: 0 },
    roundScore: { 0: 0, 1: 0 },
    message: "Auction Doctrine V3 test",
  };
}

const realCaseA = [
  c("9", "hearts"), c("A", "hearts"), c("7", "hearts"), c("10", "spades"),
  c("10", "diamonds"), c("K", "diamonds"), c("7", "diamonds"), c("8", "clubs"),
];
const realCaseB = [
  c("J", "spades"), c("A", "spades"), c("8", "spades"), c("7", "spades"),
  c("J", "diamonds"), c("9", "diamonds"), c("10", "hearts"), c("7", "hearts"),
];
const realCaseC = [
  c("9", "diamonds"), c("A", "diamonds"), c("Q", "diamonds"), c("8", "diamonds"),
  c("9", "clubs"), c("7", "clubs"), c("Q", "spades"), c("8", "spades"),
];

describe("Auction Doctrine V3 conversation", () => {
  it("opens the real nine-only hearts case at the minimal sufficient 80", () => {
    const decision = chooseHumanDoctrineV3Bid(stateWith(realCaseA));
    expect(decision).toMatchObject({ action: "bid", value: 80, trump: "hearts" });
    expect(decision.trace).toMatchObject({
      trumpFoundation: "one-major",
      auctionRole: "opening",
      communicationIntent: "probe-for-jack",
      minimalUsefulBid: 80,
    });
  });

  it("opens the real jack-only spades case at 80 despite the off-suit diamond majors", () => {
    const decision = chooseHumanDoctrineV3Bid(stateWith(realCaseB));
    expect(decision).toMatchObject({ action: "bid", value: 80, trump: "spades" });
    expect(decision.trace.trumpFoundation).toBe("one-major");
  });

  it("opens the real nine-only diamonds case at 80", () => {
    const decision = chooseHumanDoctrineV3Bid(stateWith(realCaseC));
    expect(decision).toMatchObject({ action: "bid", value: 80, trump: "diamonds" });
  });

  it("does not treat four mediocre trumps without jack or nine as a foundation", () => {
    const hand = [
      c("A", "diamonds"), c("10", "diamonds"), c("Q", "diamonds"), c("8", "diamonds"),
      c("K", "clubs"), c("Q", "clubs"), c("K", "spades"), c("Q", "spades"),
    ];
    const evaluation = evaluateIntrinsicHand(hand, "diamonds");
    const decision = chooseHumanDoctrineV3Bid(stateWith(hand));
    expect(classifyTrumpFoundation(hand, evaluation)).toBe("none");
    expect(decision.action).toBe("pass");
    expect(decision.trace.communicationIntent).toBe("reject-weak-foundation");
  });

  it.each([
    ["9", "probe-for-jack"],
    ["J", "probe-for-nine"],
  ] as const)("detects a partner missing-major fit from %s of partner's suit", (rank) => {
    const hand = [
      c(rank, "spades"), c("A", "hearts"), c("K", "hearts"), c("Q", "hearts"),
      c("K", "diamonds"), c("Q", "diamonds"), c("8", "clubs"), c("7", "clubs"),
    ];
    const bids: Bid[] = [{ playerId: 2, action: "bid", value: 80, trump: "spades" }];
    const decision = chooseHumanDoctrineV3Bid(stateWith(hand, bids));
    expect(evaluatePartnerFit(hand, "spades", evaluateIntrinsicHand(hand, "spades"))).toBe("missing-major-fit");
    expect(decision).toMatchObject({ action: "bid", value: 90, trump: "spades" });
    expect(decision.trace.partnerFit).toBe("missing-major-fit");
  });

  it("rejects changing partner clubs for an ordinary jack-only suit", () => {
    const hand = [
      c("J", "hearts"), c("A", "hearts"), c("8", "hearts"), c("7", "hearts"),
      c("7", "clubs"), c("K", "diamonds"), c("Q", "diamonds"), c("8", "spades"),
    ];
    const decision = chooseHumanDoctrineV3Bid(stateWith(hand, [{ playerId: 2, action: "bid", value: 80, trump: "clubs" }]));
    expect(decision.action).toBe("pass");
    expect(decision.trace).toMatchObject({ partnerSuit: "clubs", partnerSuitOverride: "forbidden" });
  });

  it("rejects changing partner clubs for a long suit without jack or nine", () => {
    const hand = [
      c("A", "diamonds"), c("10", "diamonds"), c("Q", "diamonds"), c("8", "diamonds"),
      c("7", "clubs"), c("K", "hearts"), c("Q", "hearts"), c("8", "spades"),
    ];
    const decision = chooseHumanDoctrineV3Bid(stateWith(hand, [{ playerId: 2, action: "bid", value: 80, trump: "clubs" }]));
    expect(decision.action).toBe("pass");
    expect(decision.trace.partnerSuitOverride).toBe("forbidden");
  });

  it("allows a minimal override with jack-nine, length and an outside ace", () => {
    const hand = [
      c("J", "hearts"), c("9", "hearts"), c("A", "hearts"), c("K", "hearts"),
      c("A", "diamonds"), c("7", "clubs"), c("8", "clubs"), c("7", "spades"),
    ];
    const decision = chooseHumanDoctrineV3Bid(stateWith(hand, [{ playerId: 2, action: "bid", value: 80, trump: "clubs" }]));
    expect(decision).toMatchObject({ action: "bid", value: 90, trump: "hearts" });
    expect(decision.trace.partnerSuitOverride).toBe("allowed");
  });

  it("recognizes the real diamond fit and does not auto-override it with 100 hearts", () => {
    const hand = [
      c("J", "hearts"), c("A", "hearts"), c("10", "hearts"), c("10", "spades"),
      c("9", "diamonds"), c("J", "clubs"), c("10", "clubs"), c("K", "clubs"),
    ];
    const bids: Bid[] = [
      { playerId: 0, action: "pass" },
      { playerId: 1, action: "bid", value: 90, trump: "diamonds" },
      { playerId: 2, action: "pass" },
    ];
    const decision = chooseHumanDoctrineV3Bid(stateWith(hand, bids, 3));
    expect(decision.trace).toMatchObject({
      partnerSuit: "diamonds",
      partnerFit: "missing-major-fit",
      partnerSuitOverride: "forbidden",
    });
    expect(decision).not.toMatchObject({ action: "bid", value: 100, trump: "hearts" });
    expect(decision.action).toBe("pass");
  });

  it("uses partner support on the second own turn to unlock a higher rebid", () => {
    const bids: Bid[] = [
      { playerId: 0, action: "bid", value: 80, trump: "hearts" },
      { playerId: 1, action: "pass" },
      { playerId: 2, action: "bid", value: 90, trump: "hearts" },
      { playerId: 3, action: "pass" },
    ];
    const decision = chooseHumanDoctrineV3Bid(stateWith(realCaseA, bids));
    expect(decision).toMatchObject({ action: "bid", value: 100, trump: "hearts" });
    expect(decision.trace).toMatchObject({
      auctionRole: "rebid",
      communicationIntent: "rebid-after-support",
      ownPreviousMessage: { value: 80, trump: "hearts" },
    });
  });

  it("keeps a competitive overcall available after an unsupported 80 opening", () => {
    const bids: Bid[] = [
      { playerId: 0, action: "bid", value: 80, trump: "hearts" },
      { playerId: 1, action: "pass" },
      { playerId: 2, action: "pass" },
      { playerId: 3, action: "bid", value: 90, trump: "clubs" },
    ];
    const decision = chooseHumanDoctrineV3Bid(stateWith(realCaseA, bids));
    expect(decision).toMatchObject({ action: "bid", value: 100, trump: "hearts" });
    expect(decision.trace.communicationIntent).toBe("competitive-overcall");
  });

  it("allows a genuinely autonomous single-major hand to open above 80", () => {
    const hand = [
      c("J", "hearts"), c("A", "hearts"), c("10", "hearts"), c("K", "hearts"), c("Q", "hearts"),
      c("A", "clubs"), c("A", "diamonds"), c("A", "spades"),
    ];
    const decision = chooseHumanDoctrineV3Bid(stateWith(hand));
    expect(decision.action).toBe("bid");
    if (decision.action === "bid") expect(decision.value).toBeGreaterThan(80);
    expect(decision.trace.dependency).toBe("autonomous");
  });

  it("treats pass behind partner as a normal decision when no fit or override exists", () => {
    const hand = [
      c("K", "hearts"), c("Q", "hearts"), c("8", "hearts"), c("7", "hearts"),
      c("7", "clubs"), c("K", "diamonds"), c("Q", "diamonds"), c("8", "spades"),
    ];
    const decision = chooseHumanDoctrineV3Bid(stateWith(hand, [{ playerId: 2, action: "bid", value: 80, trump: "clubs" }]));
    expect(decision.action).toBe("pass");
    expect(decision.trace.communicationIntent).toBe("pass-with-partner");
  });

  it("uses only the acting hand and public auction", () => {
    const bids: Bid[] = [{ playerId: 1, action: "bid", value: 90, trump: "clubs" }];
    const first = stateWith(realCaseA, bids);
    const changed = stateWith(realCaseA, bids, 0, 0, {
      1: [c("J", "spades"), c("9", "spades")],
      2: [c("A", "diamonds"), c("10", "diamonds")],
      3: [c("A", "clubs"), c("10", "clubs")],
    });
    expect(chooseHumanDoctrineV3Bid(changed)).toEqual(chooseHumanDoctrineV3Bid(first));
  });

  it("registers V3 as the active official strategy with Monte Carlo V1", () => {
    expect(findBotStrategy("human_doctrine_v3_conversation_mc_v1")).toMatchObject({
      status: "active",
      bidding: { kind: "human-doctrine-v3" },
      card: { kind: "monte-carlo-v1" },
    });
    expect(OFFICIAL_BOT_PROFILE_ID).toBe("human_doctrine_v3_conversation_mc_v1");
  });

  it("routes the production web and server bot through Auction Doctrine V3", () => {
    const state = stateWith(realCaseA);
    const expected = chooseHumanDoctrineV3Bid(state);

    expect(chooseBotBid(state)).toEqual({
      action: expected.action,
      ...(expected.action === "bid" ? { value: expected.value, trump: expected.trump } : {}),
    });
  });
});
