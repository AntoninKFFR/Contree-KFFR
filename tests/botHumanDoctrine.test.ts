import { describe, expect, it } from "vitest";
import { OFFICIAL_BOT_PROFILE_ID } from "@/bots/profiles";
import {
  HUMAN_DOCTRINE_DEFAULT_OPTIONS,
  analyzeHumanCardDoctrine,
  chooseHumanDoctrineBid,
  evaluateHumanDoctrineHand,
} from "@/bots/strategy/humanDoctrine";
import { cardId } from "@/engine/cards";
import type { Bid, Card, CompletedTrick, GameState, PlayerId, Suit } from "@/engine/types";
import { createHybridStrategy, findBotStrategy } from "@/simulation/botRegistry";

const c = (rank: Card["rank"], suit: Suit): Card => ({ rank, suit });

function biddingState(hand: Card[], bids: Bid[] = [], currentPlayerId: PlayerId = 0): GameState {
  return {
    settings: { scoringMode: "made-points", targetScore: 1000 },
    phase: "bidding",
    roundNumber: 1,
    startingPlayerId: 0,
    totalScore: { 0: 0, 1: 0 },
    roundHistory: [],
    winnerTeam: null,
    trump: null,
    hands: {
      0: currentPlayerId === 0 ? hand : [c("7", "clubs")],
      1: currentPlayerId === 1 ? hand : [c("8", "clubs")],
      2: currentPlayerId === 2 ? hand : [c("7", "diamonds")],
      3: currentPlayerId === 3 ? hand : [c("8", "diamonds")],
    },
    currentPlayerId,
    currentTrick: { leaderId: 0, cards: [] },
    completedTricks: [],
    bids,
    contract: null,
    result: null,
    trickPoints: { 0: 0, 1: 0 },
    roundScore: { 0: 0, 1: 0 },
    message: "Human doctrine bidding lab",
  };
}

function playedTrick(cards: Array<[PlayerId, Card]>, winnerId: PlayerId): CompletedTrick {
  return {
    leaderId: cards[0][0],
    cards: cards.map(([playerId, card]) => ({ playerId, card })),
    winnerId,
    points: 0,
  };
}

function playingState({
  own,
  trump = "spades",
  completedTricks = [],
  current = [],
}: {
  own: Card[];
  trump?: Suit;
  completedTricks?: CompletedTrick[];
  current?: Array<[PlayerId, Card]>;
}): GameState {
  const playerId = (current.length ? (current[0][0] + current.length) % 4 : 0) as PlayerId;
  return {
    settings: { scoringMode: "made-points", targetScore: 1000 },
    phase: "playing",
    roundNumber: 1,
    startingPlayerId: 0,
    totalScore: { 0: 0, 1: 0 },
    roundHistory: [],
    winnerTeam: null,
    trump,
    hands: {
      0: playerId === 0 ? own : [c("7", "hearts")],
      1: playerId === 1 ? own : [c("8", "hearts")],
      2: playerId === 2 ? own : [c("7", "diamonds")],
      3: playerId === 3 ? own : [c("8", "diamonds")],
    },
    currentPlayerId: playerId,
    currentTrick: {
      leaderId: current.length ? current[0][0] : playerId,
      cards: current.map(([playedBy, card]) => ({ playerId: playedBy, card })),
    },
    completedTricks,
    bids: [{ playerId: 0, action: "bid", value: 80, trump }],
    contract: { playerId: 0, teamId: 0, value: 80, trump, status: "normal" },
    result: null,
    trickPoints: { 0: 0, 1: 0 },
    roundScore: { 0: 0, 1: 0 },
    message: "Human doctrine card lab",
  };
}

describe("human doctrine bidding structures", () => {
  it("separates 34 (J+9 only) from J+9 plus a third trump", () => {
    const thirtyFour = [c("J", "hearts"), c("9", "hearts"), c("A", "clubs"), c("10", "clubs"), c("K", "diamonds"), c("Q", "diamonds"), c("7", "spades"), c("8", "spades")];
    const withThird = [c("J", "hearts"), c("9", "hearts"), c("7", "hearts"), c("A", "clubs"), c("10", "clubs"), c("K", "diamonds"), c("Q", "diamonds"), c("8", "spades")];
    const fragile = evaluateHumanDoctrineHand(thirtyFour, "hearts");
    const controlled = evaluateHumanDoctrineHand(withThird, "hearts");

    expect(fragile).toMatchObject({ structure: "thirty-four", trumpQuantity: 2, trumpControl: "fragile" });
    expect(controlled).toMatchObject({ structure: "jack-nine-third", trumpQuantity: 3, trumpControl: "partial" });
    expect(controlled.doctrineScore).toBeGreaterThan(fragile.doctrineScore);
  });

  it("treats a dry nine as fragile rather than as an automatic bid", () => {
    const hand = [c("9", "hearts"), c("7", "clubs"), c("8", "clubs"), c("Q", "clubs"), c("7", "diamonds"), c("8", "diamonds"), c("7", "spades"), c("8", "spades")];
    const evaluation = evaluateHumanDoctrineHand(hand, "hearts");

    expect(evaluation).toMatchObject({ structure: "dry-nine", trumpQuantity: 1, outsideAces: 0 });
    expect(evaluation.doctrineScore).toBeLessThan(evaluation.legacyScore);
    expect(chooseHumanDoctrineBid(biddingState(hand)).action).toBe("pass");
  });

  it("values outside controls for J+9+third without making them absolute", () => {
    const controlled = [c("J", "hearts"), c("9", "hearts"), c("7", "hearts"), c("A", "clubs"), c("10", "clubs"), c("A", "diamonds"), c("7", "spades"), c("8", "spades")];
    const bare = [c("J", "hearts"), c("9", "hearts"), c("7", "hearts"), c("K", "clubs"), c("Q", "clubs"), c("K", "diamonds"), c("7", "spades"), c("8", "spades")];

    expect(evaluateHumanDoctrineHand(controlled, "hearts").doctrineScore)
      .toBeGreaterThan(evaluateHumanDoctrineHand(bare, "hearts").doctrineScore);
  });

  it("does not infer a capot from trumps alone without outside aces", () => {
    const hand = [c("J", "hearts"), c("9", "hearts"), c("A", "hearts"), c("10", "hearts"), c("K", "hearts"), c("K", "clubs"), c("Q", "diamonds"), c("7", "spades")];
    const decision = chooseHumanDoctrineBid(biddingState(hand));

    expect(decision.evaluation.outsideAces).toBe(0);
    if (decision.action === "bid") expect(decision.value).toBeLessThanOrEqual(110);
  });

  it("uses only public auction, position and game-score context", () => {
    const hand = [c("J", "hearts"), c("9", "hearts"), c("7", "hearts"), c("A", "clubs"), c("10", "clubs"), c("K", "diamonds"), c("Q", "diamonds"), c("8", "spades")];
    const neutral = { ...biddingState(hand), startingPlayerId: 1 as PlayerId };
    const atFirstSeat = biddingState(hand);
    const trailing = { ...neutral, totalScore: { 0: 0, 1: 300 } as GameState["totalScore"] };
    const supported = biddingState(hand, [{ playerId: 2, action: "bid", value: 80, trump: "hearts" }]);

    expect(chooseHumanDoctrineBid(atFirstSeat).evaluation.doctrineScore)
      .toBe(chooseHumanDoctrineBid(neutral).evaluation.doctrineScore + 1);
    expect(chooseHumanDoctrineBid(trailing).evaluation.doctrineScore)
      .toBe(chooseHumanDoctrineBid(neutral).evaluation.doctrineScore + 2);
    expect(chooseHumanDoctrineBid(supported).evaluation.doctrineScore)
      .toBeGreaterThan(chooseHumanDoctrineBid(neutral).evaluation.doctrineScore);
  });

  it("isolates the legacy-threshold effect from doctrine features", () => {
    const hand = [c("J", "hearts"), c("9", "hearts"), c("7", "clubs"), c("8", "clubs"), c("7", "diamonds"), c("8", "diamonds"), c("7", "spades"), c("8", "spades")];
    const state = biddingState(hand);
    const legacyThresholds = chooseHumanDoctrineBid(state, {
      ...HUMAN_DOCTRINE_DEFAULT_OPTIONS,
      thresholds: "legacy",
      allow110: false,
    });

    expect(chooseHumanDoctrineBid(state).action).toBe("pass");
    expect(legacyThresholds).toMatchObject({ action: "bid", value: 80 });
  });

  it("isolates the 110 extension from the rest of the complete doctrine", () => {
    const hand = [c("J", "hearts"), c("9", "hearts"), c("A", "hearts"), c("10", "hearts"), c("A", "clubs"), c("A", "diamonds"), c("7", "spades"), c("8", "spades")];
    const state = biddingState(hand);

    expect(chooseHumanDoctrineBid(state)).toMatchObject({ action: "bid", value: 110 });
    expect(chooseHumanDoctrineBid(state, {
      ...HUMAN_DOCTRINE_DEFAULT_OPTIONS,
      allow110: false,
    })).toMatchObject({ action: "bid", value: 100 });
  });

  it("keeps intrinsic hand strength separate from opponent-auction utility", () => {
    const hand = [c("J", "hearts"), c("9", "hearts"), c("7", "hearts"), c("A", "clubs"), c("10", "clubs"), c("K", "diamonds"), c("Q", "diamonds"), c("8", "spades")];
    const state = biddingState(hand, [{ playerId: 1, action: "bid", value: 100, trump: "clubs" }]);
    const penalized = chooseHumanDoctrineBid(state).evaluation;
    const unpenalized = chooseHumanDoctrineBid(state, {
      ...HUMAN_DOCTRINE_DEFAULT_OPTIONS,
      opponentContractPenalty: false,
    }).evaluation;

    expect(penalized.intrinsicScore).toBe(unpenalized.intrinsicScore);
    expect(penalized.adjustments.opponentContract).toBe(-6);
    expect(unpenalized.adjustments.opponentContract).toBe(0);
    expect(penalized.doctrineScore).toBe(unpenalized.doctrineScore - 6);
  });
});

describe("human doctrine card-play diagnostics", () => {
  it("keeps non-trump candidates visible when 9 plus a small trump can preserve control", () => {
    const state = playingState({ own: [c("9", "spades"), c("7", "spades"), c("A", "clubs"), c("10", "clubs"), c("K", "clubs"), c("7", "diamonds"), c("8", "diamonds"), c("Q", "hearts")] });
    const analysis = analyzeHumanCardDoctrine(state);

    expect(analysis.preserveTrumpControlCandidates.length).toBeGreaterThan(0);
    expect(analysis.preserveTrumpControlCandidates.every((card) => card.suit !== "spades")).toBe(true);
  });

  it("offers a long outside suit as a way to force opposing cuts", () => {
    const state = playingState({ own: [c("J", "spades"), c("9", "spades"), c("A", "clubs"), c("10", "clubs"), c("K", "clubs"), c("Q", "clubs"), c("7", "diamonds"), c("8", "hearts")] });
    const analysis = analyzeHumanCardDoctrine(state);

    expect(analysis.longSuitCutCandidates.map((card) => card.suit)).toContain("clubs");
  });

  it("marks a late ten as a now-or-never candidate while opposing trumps remain", () => {
    const state = playingState({ own: [c("10", "clubs"), c("7", "diamonds"), c("8", "hearts")] });
    const analysis = analyzeHumanCardDoctrine(state);

    expect(analysis.outsideTrumps.length).toBeGreaterThan(0);
    expect(analysis.pointNowOrNeverCandidates).toContainEqual(c("10", "clubs"));
  });

  it("counts played and publicly unresolved trumps exactly", () => {
    const completed = [playedTrick([[0, c("A", "spades")], [1, c("7", "clubs")], [2, c("10", "spades")], [3, c("8", "clubs")]], 0)];
    const state = playingState({ own: [c("J", "spades"), c("9", "spades"), c("A", "clubs"), c("10", "clubs"), c("K", "diamonds"), c("Q", "diamonds"), c("7", "hearts")], completedTricks: completed });
    const analysis = analyzeHumanCardDoctrine(state);

    expect(analysis.playedTrumps.map(cardId).sort()).toEqual(["A-spades", "10-spades"].sort());
    expect(analysis.outsideTrumps.map(cardId).sort()).toEqual(["K-spades", "Q-spades", "8-spades", "7-spades"].sort());
  });

  it("exposes late-trick ordering candidates without dictating a universal card", () => {
    const state = playingState({ own: [c("10", "clubs"), c("7", "diamonds"), c("A", "hearts")] });
    const analysis = analyzeHumanCardDoctrine(state);
    const points = analysis.lastTrickPlanningCandidates.map((card) => card.rank);

    expect(points).toHaveLength(3);
    expect(points.at(-1)).toBe("A");
    expect(analysis.lastTrickBonus).toBe(10);
  });

  it("has an empty convention layer and uses only certain public partner signals", () => {
    const completed = [playedTrick([[0, c("7", "clubs")], [1, c("8", "clubs")], [2, c("7", "hearts")], [3, c("9", "clubs")]], 3)];
    const state = playingState({ own: [c("J", "spades"), c("9", "spades"), c("A", "clubs"), c("10", "clubs"), c("K", "diamonds"), c("Q", "diamonds"), c("7", "hearts")], completedTricks: completed });
    const signals = analyzeHumanCardDoctrine(state).partnerSignals;

    expect(signals.conventions).toEqual([]);
    expect(signals.certainPublicSignals).toContainEqual({ playerId: 2, voidSuit: "clubs" });
  });
});

describe("human doctrine isolation and anti-cheat", () => {
  it("is the official profile after the FFB recalibration", () => {
    const strategy = createHybridStrategy("human_doctrine_v1", "monte_carlo_v1", { id: "human_doctrine_v1_mc_v1", status: "active" });
    expect(OFFICIAL_BOT_PROFILE_ID).toBe("human_doctrine_v1_mc_v1");
    expect(findBotStrategy(OFFICIAL_BOT_PROFILE_ID)).toMatchObject({
      status: "active",
      bidding: { kind: "human-doctrine-v1" },
      card: { kind: "monte-carlo-v1" },
    });
    expect(strategy).toMatchObject({ status: "active", bidding: { kind: "human-doctrine-v1" }, card: { kind: "monte-carlo-v1" } });
  });

  it("does not change decisions or doctrine knowledge when hidden opponent hands are permuted", () => {
    const hand = [c("J", "hearts"), c("9", "hearts"), c("7", "hearts"), c("A", "clubs"), c("10", "clubs"), c("K", "diamonds"), c("Q", "diamonds"), c("8", "spades")];
    const bidding = biddingState(hand);
    const changedBidding = { ...bidding, hands: { ...bidding.hands, 1: bidding.hands[3], 3: bidding.hands[1] } };
    expect(chooseHumanDoctrineBid(changedBidding)).toEqual(chooseHumanDoctrineBid(bidding));

    const playing = playingState({ own: hand, trump: "hearts" });
    const changedPlaying = { ...playing, hands: { ...playing.hands, 1: playing.hands[3], 3: playing.hands[1] } };
    expect(analyzeHumanCardDoctrine(changedPlaying)).toEqual(analyzeHumanCardDoctrine(playing));
  });
});
