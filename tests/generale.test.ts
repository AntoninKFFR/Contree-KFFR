import { describe, expect, it } from "vitest";
import { activePlayersForRound, inactivePlayerId, nextActivePlayer, playersRequiredForTrick, tricksWonByPlayer } from "@/engine/activePlayers";
import { canBidCapot, canBidGenerale, getAvailableBidValues } from "@/engine/bidding";
import { createInitialGame, getCurrentContract, makeBid, playCard, playableCardsForCurrentPlayer } from "@/engine/game";
import { scoreRound } from "@/engine/scoring";
import type { Card, Contract, GameState, PlayerId } from "@/engine/types";
import { createTestRuleset } from "@/tests/helpers/rulesets";

const rules = createTestRuleset({ bidding: { allowGenerale: true } });
const contract = (status: Contract["status"] = "normal"): Contract => ({
  kind: "generale", value: 500, playerId: 0, teamId: 0,
  trump: "clubs", contractMode: { kind: "suit", suit: "clubs" }, status,
});
const c = (rank: Card["rank"], suit: Card["suit"]): Card => ({ rank, suit });
const suitHand = (suit: Card["suit"]): Card[] =>
  (["7", "8", "9", "J", "Q", "K", "10", "A"] as const).map((rank) => ({ suit, rank }));

function generaleState(): GameState {
  let state = createInitialGame(() => 0, { ruleset: rules });
  state = { ...state, hands: { 0: suitHand("clubs"), 1: suitHand("hearts"), 2: suitHand("diamonds"), 3: suitHand("spades") } };
  state = makeBid(state, 0, { action: "generale", trump: "clubs" });
  state = makeBid(state, 1, { action: "pass" });
  state = makeBid(state, 2, { action: "pass" });
  return makeBid(state, 3, { action: "pass" });
}

function playOut(state: GameState): GameState {
  let next = state;
  let guard = 0;
  while (next.phase === "playing" && guard < 30) {
    next = playCard(next, next.currentPlayerId, playableCardsForCurrentPlayer(next)[0]);
    guard += 1;
  }
  return next;
}

function score(status: Contract["status"], announcerTricks: number, extras = { announcements: 0, belote: 0 }) {
  return scoreRound({
    contract: contract(status), settings: { scoringMode: "ffb", targetScore: 1000, ruleset: rules },
    trickPointsByTeam: { 0: 100, 1: 62 }, tricksWonByTeam: { 0: announcerTricks, 1: 8 - announcerTricks },
    tricksWonByPlayer: { 0: announcerTricks, 1: 8 - announcerTricks, 2: 0, 3: 0 },
    announcementPointsByTeam: { 0: extras.announcements, 1: 0 },
    belotePointsByTeam: { 0: extras.belote, 1: 0 },
  });
}

describe("Générale contract", () => {
  it("rejects Générale when disabled", () => {
    const state = createInitialGame(() => 0);
    expect(() => makeBid(state, 0, { action: "generale", trump: "clubs" })).toThrow(/not allowed/);
  });

  it("accepts Générale when enabled and captures its ruleset value", () => {
    const state = makeBid(createInitialGame(() => 0, { ruleset: rules }), 0, { action: "generale", trump: "clubs" });
    expect(state.bids[0]).toMatchObject({ action: "generale", value: 500, playerId: 0 });
    expect(getCurrentContract(state)).toMatchObject({ kind: "generale", value: 500, playerId: 0 });
  });

  it("uses one configurable Générale value for bidding and scoring", () => {
    const custom = createTestRuleset({ bidding: { allowGenerale: true }, scoring: { generaleBasePoints: 600 } });
    const bid = makeBid(createInitialGame(() => 0, { ruleset: custom }), 0, { action: "generale", trump: "clubs" });
    const captured = getCurrentContract(bid)!;
    const result = scoreRound({ contract: captured, settings: { scoringMode: "ffb", targetScore: 1000, ruleset: custom }, trickPointsByTeam: { 0: 100, 1: 0 }, tricksWonByTeam: { 0: 8, 1: 0 }, tricksWonByPlayer: { 0: 8, 1: 0, 2: 0, 3: 0 } });
    expect(captured.value).toBe(600);
    expect(result.roundScore).toEqual({ 0: 600, 1: 0 });
  });

  it("does not inherit SA/TA compatibility without explicit Générale flags", () => {
    const special = createTestRuleset({ bidding: { allowGenerale: true, allowNoTrump: true, allowAllTrump: true } });
    const state = createInitialGame(() => 0, { ruleset: special });
    expect(() => makeBid(state, 0, { action: "generale", contractMode: { kind: "no-trump" } })).toThrow(/not allowed/);
    const enabled = createTestRuleset({ bidding: { allowGenerale: true, allowNoTrump: true, generaleAllowNoTrump: true } });
    expect(makeBid(createInitialGame(() => 0, { ruleset: enabled }), 0, { action: "generale", contractMode: { kind: "no-trump" } }).bids[0]).toMatchObject({ action: "generale", contractMode: { kind: "no-trump" } });
  });

  it("ranks Générale above Capot and leaves no higher ordinary bid", () => {
    let state = makeBid(createInitialGame(() => 0, { ruleset: rules }), 0, { action: "capot", trump: "clubs" });
    expect(canBidGenerale(getCurrentContract(state), rules.bidding)).toBe(true);
    state = makeBid(state, 1, { action: "generale", trump: "hearts" });
    const current = getCurrentContract(state);
    expect(getAvailableBidValues(current, rules.bidding)).toEqual([]);
    expect(canBidCapot(current, rules.bidding)).toBe(false);
    expect(() => makeBid(state, 2, { action: "bid", value: 160, trump: "spades" })).toThrow(/higher/);
  });

  it("supports Coinche and Surcoinche on Générale", () => {
    let state = makeBid(createInitialGame(() => 0, { ruleset: rules }), 0, { action: "generale", trump: "clubs" });
    state = makeBid(state, 1, { action: "coinche" });
    expect(getCurrentContract(state)?.status).toBe("coinched");
    state = makeBid(state, 2, { action: "surcoinche" });
    expect(state.contract).toMatchObject({ kind: "generale", status: "surcoinched" });
  });

  it("identifies and skips the announcer's partner", () => {
    const state = generaleState();
    expect(inactivePlayerId(state)).toBe(2);
    expect(activePlayersForRound(state)).toEqual([0, 1, 3]);
    expect(playersRequiredForTrick(state)).toBe(3);
    expect(nextActivePlayer(state, 1)).toBe(3);
    expect(() => playCard({ ...state, currentPlayerId: 2 }, 2, state.hands[2][0])).toThrow(/inactive partner/);
  });

  it("skips an inactive starting player deterministically", () => {
    let state = createInitialGame(() => 0.6, { ruleset: rules });
    state = makeBid(state, 2, { action: "pass" });
    state = makeBid(state, 3, { action: "pass" });
    state = makeBid(state, 0, { action: "generale", trump: "clubs" });
    state = makeBid(state, 1, { action: "pass" });
    state = makeBid(state, 2, { action: "pass" });
    state = makeBid(state, 3, { action: "pass" });
    expect(state.startingPlayerId).toBe(2);
    expect(state.currentPlayerId).toBe(3);
    expect(state.currentTrick.leaderId).toBe(3);
  });

  it("closes each trick after three cards and always plays eight tricks", () => {
    let state = generaleState();
    const inactiveHand = [...state.hands[2]];
    let plays = 0;
    while (state.phase === "playing" && plays < 30) {
      const before = state.completedTricks.length;
      state = playCard(state, state.currentPlayerId, playableCardsForCurrentPlayer(state)[0]);
      plays += 1;
      if (state.completedTricks.length > before) expect(state.completedTricks.at(-1)?.cards).toHaveLength(3);
      expect(state.currentPlayerId).not.toBe(2);
    }
    expect(plays).toBe(24);
    expect(state.completedTricks).toHaveLength(8);
    expect(state.hands[2]).toEqual(inactiveHand);
    expect(state.result).toMatchObject({ contractSucceeded: true, tricksWonByPlayer: { 0: 8, 1: 0, 2: 0, 3: 0 } });
  });

  it("plays a forced failed Générale end to end", () => {
    const base = generaleState();
    const failed = playOut({ ...base, hands: {
      0: [c("7", "clubs"), c("8", "clubs"), c("9", "clubs"), c("Q", "clubs"), c("K", "clubs"), c("10", "clubs"), c("A", "clubs"), c("A", "hearts")],
      1: [c("J", "clubs"), ...suitHand("hearts").slice(0, 7)],
      2: suitHand("diamonds"), 3: suitHand("spades"),
    } });
    expect(failed.completedTricks).toHaveLength(8);
    expect(failed.result).toMatchObject({ contract: { kind: "generale" }, contractSucceeded: false });
  });

  it("plays a forced coinched Générale end to end", () => {
    let state = createInitialGame(() => 0, { ruleset: rules });
    state = { ...state, hands: { 0: suitHand("clubs"), 1: suitHand("hearts"), 2: suitHand("diamonds"), 3: suitHand("spades") } };
    state = makeBid(state, 0, { action: "generale", trump: "clubs" });
    state = makeBid(state, 1, { action: "coinche" });
    state = makeBid(state, 2, { action: "pass" });
    state = makeBid(state, 3, { action: "pass" });
    state = makeBid(state, 0, { action: "pass" });
    const finished = playOut(state);
    expect(finished.result).toMatchObject({ contractSucceeded: true, multiplier: 2, roundScore: { 0: 1020, 1: 0 } });
  });

  it("derives reliable per-player trick counts", () => {
    const state = generaleState();
    const completed = [{ leaderId: 0 as PlayerId, cards: [], winnerId: 0 as PlayerId, points: 0 }];
    expect(tricksWonByPlayer(completed)).toEqual({ 0: 1, 1: 0, 2: 0, 3: 0 });
    expect(inactivePlayerId(state)).toBe(2);
  });

  it("requires eight personal tricks, regardless of team points, announcements or Belote", () => {
    expect(score("normal", 8).contractSucceeded).toBe(true);
    expect(score("normal", 7).contractSucceeded).toBe(false);
    expect(score("normal", 7, { announcements: 200, belote: 20 }).contractSucceeded).toBe(false);
  });

  it.each([
    ["normal", 1, 500], ["coinched", 2, 1000], ["surcoinched", 4, 2000],
  ] as const)("scores a successful %s Générale with its dedicated multiplier", (status, multiplier, expected) => {
    const result = score(status, 8);
    expect(result.multiplier).toBe(multiplier);
    expect(result.roundScore).toEqual({ 0: expected, 1: 0 });
  });

  it("awards a failed Générale to the defense", () => {
    expect(score("normal", 7).roundScore).toEqual({ 0: 0, 1: 500 });
  });

  it("does not let the seated partner declare Belote without playing", () => {
    const base = generaleState();
    const state = { ...base, hands: { ...base.hands, 2: [
      { rank: "K", suit: "clubs" }, { rank: "Q", suit: "clubs" }, ...base.hands[2].slice(2),
    ] as Card[] } };
    expect(state.belote?.declaration).toBeNull();
    expect(state.hands[2]).toHaveLength(8);
  });

  it("detects the seated partner's card announcements without giving them a turn", () => {
    const announcementRules = createTestRuleset({ bidding: { allowGenerale: true }, announcements: { enabled: true, tierce: true } });
    let state = createInitialGame(() => 0, { ruleset: announcementRules });
    state = { ...state, hands: { ...state.hands, 2: [
      { rank: "7", suit: "diamonds" }, { rank: "8", suit: "diamonds" }, { rank: "9", suit: "diamonds" },
      { rank: "A", suit: "clubs" }, { rank: "7", suit: "hearts" }, { rank: "K", suit: "hearts" },
      { rank: "8", suit: "spades" }, { rank: "Q", suit: "spades" },
    ] } };
    state = makeBid(state, 0, { action: "generale", trump: "clubs" });
    state = makeBid(state, 1, { action: "pass" });
    state = makeBid(state, 2, { action: "pass" });
    state = makeBid(state, 3, { action: "pass" });
    expect(state.announcements?.declaredPlayerIds).toContain(2);
    expect(state.announcements?.declarations.some((item) => item.playerId === 2)).toBe(true);
    expect(state.currentPlayerId).not.toBe(2);
  });
});
