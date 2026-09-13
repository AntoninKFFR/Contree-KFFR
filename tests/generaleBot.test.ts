import { describe, expect, it } from "vitest";
import { evaluateGenerale } from "@/bots/evaluation/generaleEvaluation";
import { chooseBotBid } from "@/bots/simpleBot";
import { chooseMonteCarloCardToPlay } from "@/bots/strategy/monteCarloCardStrategy";
import { buildTrickKnowledge } from "@/bots/strategy/trickKnowledge";
import { createInitialGame, makeBid, playCard, playableCardsForCurrentPlayer } from "@/engine/game";
import { captureBotReviewScenario } from "@/bots/botReview";
import type { Card, GameState } from "@/engine/types";
import { createTestRuleset } from "@/tests/helpers/rulesets";

const c = (rank: Card["rank"], suit: Card["suit"]): Card => ({ rank, suit });
const exceptional = [
  c("J", "clubs"), c("9", "clubs"), c("A", "clubs"), c("10", "clubs"), c("K", "clubs"),
  c("A", "diamonds"), c("A", "hearts"), c("A", "spades"),
];
const suitHand = (suit: Card["suit"]): Card[] =>
  (["7", "8", "9", "J", "Q", "K", "10", "A"] as const).map((rank) => c(rank, suit));

function playingState(): GameState {
  const rules = createTestRuleset({ bidding: { allowGenerale: true } });
  let state = createInitialGame(() => 0, { ruleset: rules });
  state = { ...state, hands: { 0: suitHand("clubs"), 1: suitHand("hearts"), 2: suitHand("diamonds"), 3: suitHand("spades") } };
  state = makeBid(state, 0, { action: "generale", trump: "clubs" });
  state = makeBid(state, 1, { action: "pass" });
  state = makeBid(state, 2, { action: "pass" });
  return makeBid(state, 3, { action: "pass" });
}

describe("Générale bots and Monte Carlo", () => {
  it("uses a separate conservative Générale evaluator", () => {
    expect(evaluateGenerale(exceptional)).toMatchObject({ contractMode: { kind: "suit", suit: "clubs" } });
    expect(evaluateGenerale(exceptional.slice(0, 4).concat([
      c("Q", "clubs"), c("K", "hearts"), c("A", "hearts"), c("A", "spades"),
    ]))).toBeNull();
  });

  it("never announces Générale while the flag is off", () => {
    const state = { ...createInitialGame(() => 0), hands: { ...createInitialGame(() => 0).hands, 0: exceptional } };
    expect(chooseBotBid(state).action).not.toBe("generale");
  });

  it("can announce Générale only for an exceptional hand when enabled", () => {
    const rules = createTestRuleset({ bidding: { allowGenerale: true } });
    const base = createInitialGame(() => 0, { ruleset: rules });
    expect(chooseBotBid({ ...base, hands: { ...base.hands, 0: exceptional } })).toMatchObject({ action: "generale" });
    expect(chooseBotBid({ ...base, hands: { ...base.hands, 0: suitHand("clubs").slice(0, 4).concat(suitHand("hearts").slice(0, 4)) } }).action).not.toBe("generale");
  });

  it("Monte Carlo never plays the seated partner and completes the Générale", () => {
    let state = playingState();
    const inactiveHand = [...state.hands[2]];
    let guard = 0;
    while (state.phase === "playing" && guard < 30) {
      expect(state.currentPlayerId).not.toBe(2);
      const card = chooseMonteCarloCardToPlay(state, { totalBudget: 1 });
      state = playCard(state, state.currentPlayerId, card);
      guard += 1;
    }
    expect(state.phase).toBe("finished");
    expect(state.completedTricks).toHaveLength(8);
    expect(state.hands[2]).toEqual(inactiveHand);
  });

  it("TrickKnowledge marks the seated partner inactive without inventing void suits", () => {
    let state = playingState();
    for (let index = 0; index < 3; index += 1) state = playCard(state, state.currentPlayerId, state.hands[state.currentPlayerId][0]);
    const knowledge = buildTrickKnowledge(state);
    expect(knowledge.inactivePlayerId).toBe(2);
    expect(knowledge.voidSuitsByPlayer[2]).toEqual([]);
  });

  it("Bot Review serializes the distinct contract, inactive seat and personal tricks", () => {
    const state = playingState();
    const scenario = captureBotReviewScenario(state, { decisionNumber: 1, elapsedMs: 1, chosenCard: playableCardsForCurrentPlayer(state)[0] });
    expect(scenario.contract).toMatchObject({ kind: "generale", playerId: 0 });
    expect(scenario.inactivePlayerId).toBe(2);
    expect(scenario.tricksWonByPlayer).toEqual({ 0: 0, 1: 0, 2: 0, 3: 0 });
  });
});
