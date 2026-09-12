import { describe, expect, it } from "vitest";
import { captureBotReviewScenario, botReviewScenarioToGameState, isBotReviewModeEnabled, serializeBotReviewScenario } from "@/bots/botReview";
import { chooseBotBidWithTrace, chooseBotCard } from "@/bots/simpleBot";
import { chooseHumanDoctrineV2Bid } from "@/bots/strategy/humanDoctrineV2";
import { chooseHumanDoctrineV3Bid } from "@/bots/strategy/humanDoctrineV3";
import { cardId } from "@/engine/cards";
import { createInitialGame, makeBid, playCard, playableCardsForCurrentPlayer } from "@/engine/game";
import { createSeededRandom } from "@/engine/random";
import type { GameState, PlayerId } from "@/engine/types";

function playingState(seed = 8100): GameState {
  let state = createInitialGame(createSeededRandom(seed));
  state = makeBid(state, state.currentPlayerId, { action: "bid", value: 80, trump: "hearts" });
  for (let pass = 0; pass < 3; pass += 1) {
    state = makeBid(state, state.currentPlayerId, { action: "pass" });
  }
  if (state.phase !== "playing") throw new Error("La fixture devait atteindre la phase de jeu.");
  return state;
}

describe("human bot decision review", () => {
  it("is disabled unless the public debug flag is exactly true", () => {
    expect(isBotReviewModeEnabled()).toBe(false);
    expect(isBotReviewModeEnabled(undefined)).toBe(false);
    expect(isBotReviewModeEnabled("false")).toBe(false);
    expect(isBotReviewModeEnabled("true")).toBe(true);
  });

  it("serializes a legal chosen card without hidden hands", () => {
    const state = playingState();
    const chosenCard = chooseBotCard(state);
    const scenario = captureBotReviewScenario(state, {
      decisionNumber: 7,
      elapsedMs: 12.5,
      chosenCard,
      capturedAt: "2026-09-09T12:00:00.000Z",
    });
    const json = serializeBotReviewScenario(scenario, "Le partenaire est deja maitre.");
    const parsed = JSON.parse(json) as Record<string, unknown>;

    expect(scenario.version).toBe(1);
    expect(scenario.chosenCard).toEqual(chosenCard);
    expect(scenario.legalCards.map(cardId)).toEqual(playableCardsForCurrentPlayer(state).map(cardId));
    expect(scenario.decisionEngine).toBe("montecarlo_v1");
    expect(scenario.trace.knowledge).toBeDefined();
    expect(parsed).not.toHaveProperty("hands");
    expect(json).not.toContain('"hands"');
    expect(json).not.toContain("distribution");
    expect(parsed.humanComment).toBe("Le partenaire est deja maitre.");
  });

  it("captures the complete pre-decision hand before the chosen card is played", () => {
    const stateBeforeDecision = playingState(8104);
    const chosenCard = chooseBotCard(stateBeforeDecision);
    const expectedHandIds = stateBeforeDecision.hands[stateBeforeDecision.currentPlayerId].map(cardId);
    const expectedLegalIds = playableCardsForCurrentPlayer(stateBeforeDecision).map(cardId);
    const scenario = captureBotReviewScenario(stateBeforeDecision, {
      decisionNumber: 4,
      elapsedMs: 0.4,
      chosenCard,
    });
    const stateAfterDecision = playCard(
      stateBeforeDecision,
      stateBeforeDecision.currentPlayerId,
      chosenCard,
    );

    expect(scenario.ownHand.map(cardId)).toEqual(expectedHandIds);
    expect(scenario.ownHand.map(cardId)).toContain(cardId(chosenCard));
    expect(scenario.legalCards.map(cardId)).toEqual(expectedLegalIds);
    expect(stateAfterDecision.hands[scenario.playerId].map(cardId)).not.toContain(cardId(chosenCard));
  });

  it("reconstructs a Bot Lab position and reproduces the official Monte Carlo V1 card choice", () => {
    const state = playingState(8101);
    const chosenCard = chooseBotCard(state);
    const scenario = captureBotReviewScenario(state, {
      decisionNumber: 1,
      elapsedMs: 1,
      chosenCard,
    });
    const reconstructed = botReviewScenarioToGameState(scenario);

    for (const playerId of [0, 1, 2, 3] as PlayerId[]) {
      expect(reconstructed.hands[playerId]).toEqual(
        playerId === scenario.playerId ? scenario.ownHand : [],
      );
    }
    expect(chooseBotCard(reconstructed)).toEqual(chosenCard);
  });

  it("captures the official V3 bidding trace and rejects a forged illegal chosen card", () => {
    const bidding = createInitialGame(createSeededRandom(8102));
    const { bid: chosenBid, biddingTrace } = chooseBotBidWithTrace(bidding);
    const bidScenario = captureBotReviewScenario(bidding, {
      decisionNumber: 1,
      elapsedMs: 0.1,
      chosenBid,
      biddingTrace,
    });
    expect(botReviewScenarioToGameState(bidScenario)).toMatchObject({
      phase: "bidding",
      currentPlayerId: bidding.currentPlayerId,
    });
    expect(bidScenario.legalCards).toEqual([]);
    expect(bidScenario.botProfile).toBe("human_doctrine_v3_conversation_mc_v1");
    expect(bidScenario.decisionEngine).toBe("auction_doctrine_v3");
    expect(bidScenario.trace.bidding).toMatchObject({
      version: 3,
      trumpFoundation: expect.any(String),
      partnerFit: expect.any(String),
      partnerSuitOverride: expect.any(String),
      communicationIntent: expect.any(String),
      reason: expect.any(String),
    });

    const state = playingState(8103);
    const scenario = captureBotReviewScenario(state, {
      decisionNumber: 2,
      elapsedMs: 0.2,
      chosenCard: chooseBotCard(state),
    });
    expect(() => botReviewScenarioToGameState({
      ...scenario,
      chosenCard: { rank: "7", suit: "clubs" },
      legalCards: [],
    })).toThrow(/carte choisie n'est pas legale/);
  });

  it("exports a reconstructible communicative bidding diagnosis without hidden hands", () => {
    const bidding = createInitialGame(createSeededRandom(8110), { scoringMode: "ffb", targetScore: 1000 });
    const decision = chooseHumanDoctrineV2Bid(bidding);
    const scenario = captureBotReviewScenario(bidding, {
      decisionNumber: 3,
      elapsedMs: 0.2,
      chosenBid: decision.action === "bid"
        ? { action: "bid", value: decision.value, trump: decision.trump }
        : { action: "pass" },
      botProfile: "human_doctrine_v2_comm_mc_v1",
      biddingTrace: decision.trace,
      capturedAt: "2026-09-10T12:00:00.000Z",
    });
    const json = serializeBotReviewScenario(scenario);
    const reconstructed = botReviewScenarioToGameState(scenario);

    expect(scenario.decisionEngine).toBe("human_doctrine_v2_comm");
    expect(scenario.trace.bidding).toMatchObject({
      intrinsic: { evaluation: { trumpStructure: expect.any(Object), intrinsicHandStrength: expect.any(Number) } },
      auction: {
        context: { publicBids: [], biddingPosition: "first" },
        partnerInference: { source: "public-auction-only" },
        intent: expect.any(String),
        ceiling: { estimatedMissingHighPoints: expect.any(Number) },
        reason: expect.any(String),
      },
    });
    expect(json).not.toContain('"hands"');
    expect(chooseHumanDoctrineV2Bid(reconstructed)).toEqual(decision);
  });

  it("exports the V3 conversation trace without any hidden hand", () => {
    const bidding = createInitialGame(createSeededRandom(8111), { scoringMode: "ffb", targetScore: 1000 });
    const decision = chooseHumanDoctrineV3Bid(bidding);
    const scenario = captureBotReviewScenario(bidding, {
      decisionNumber: 4,
      elapsedMs: 0.3,
      chosenBid: decision.action === "bid"
        ? { action: "bid", value: decision.value, trump: decision.trump }
        : { action: "pass" },
      botProfile: "human_doctrine_v3_conversation_mc_v1",
      biddingTrace: decision.trace,
    });
    const json = serializeBotReviewScenario(scenario);

    expect(scenario.decisionEngine).toBe("auction_doctrine_v3");
    expect(scenario.trace.source).toBe("auction-doctrine-v3-conversation");
    expect(scenario.trace.bidding).toMatchObject({
      version: 3,
      trumpFoundation: expect.any(String),
      partnerFit: expect.any(String),
      partnerSuitOverride: expect.any(String),
      communicationIntent: expect.any(String),
      reason: expect.any(String),
    });
    expect(json).not.toContain('"hands"');
  });
});
