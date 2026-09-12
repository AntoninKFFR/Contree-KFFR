import { describe, expect, it } from "vitest";
import {
  appendBotReviewHistory,
  BOT_REVIEW_HISTORY_LIMIT,
  botReviewScenarioToGameState,
  captureBotReviewScenario,
  createBotReviewBundle,
  createEmptyBotReviewHistory,
  isBotReviewModeEnabled,
  serializeBotReviewBundle,
  serializeBotReviewScenario,
  updateBotReviewPublicAuctions,
} from "@/bots/botReview";
import { chooseBotBidWithTrace, chooseBotCard } from "@/bots/simpleBot";
import { chooseHumanDoctrineV2Bid } from "@/bots/strategy/humanDoctrineV2";
import { chooseHumanDoctrineV3Bid } from "@/bots/strategy/humanDoctrineV3";
import { cardId } from "@/engine/cards";
import { createInitialGame, makeBid, playCard, playableCardsForCurrentPlayer } from "@/engine/game";
import { createSeededRandom } from "@/engine/random";
import { createGameSettings } from "@/engine/rulesets/resolve";
import type { GameState, PlayerId } from "@/engine/types";
import { toPlayerGameView } from "@/engine/views";
import { rulesetWithAnnouncements } from "@/tests/helpers/rulesets";

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

  it("keeps Monte Carlo V1 executable with announcements enabled in the GameState", () => {
    let state = createInitialGame(
      createSeededRandom(8106),
      createGameSettings({ ruleset: rulesetWithAnnouncements }),
    );
    state = makeBid(state, state.currentPlayerId, { action: "bid", value: 80, trump: "hearts" });
    for (let pass = 0; pass < 3; pass += 1) {
      state = makeBid(state, state.currentPlayerId, { action: "pass" });
    }

    const chosenCard = chooseBotCard(state);
    const next = playCard(state, state.currentPlayerId, chosenCard);

    expect(next.settings.ruleset?.announcements.enabled).toBe(true);
    expect(next.announcements?.declaredPlayerIds).toContain(state.currentPlayerId);
  });

  it("captures the official V3.1 bidding trace and rejects a forged illegal chosen card", () => {
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
    expect(bidScenario.botProfile).toBe("human_doctrine_v3_1_conversation_mc_v1");
    expect(bidScenario.decisionEngine).toBe("auction_doctrine_v3_1");
    expect(bidScenario.trace.bidding).toMatchObject({
      version: 3,
      doctrineVersion: "3.1",
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

  it("keeps successive bot decisions in chronological FIFO history with their exact hands", () => {
    const firstState = createInitialGame(createSeededRandom(8112));
    const firstDecision = chooseBotBidWithTrace(firstState);
    const firstScenario = captureBotReviewScenario(firstState, {
      decisionNumber: 1,
      elapsedMs: 0.1,
      chosenBid: firstDecision.bid,
      biddingTrace: firstDecision.biddingTrace,
    });
    const secondState = makeBid(firstState, firstState.currentPlayerId, firstDecision.bid);
    const secondDecision = chooseBotBidWithTrace(secondState);
    const secondScenario = captureBotReviewScenario(secondState, {
      decisionNumber: 2,
      elapsedMs: 0.2,
      chosenBid: secondDecision.bid,
      biddingTrace: secondDecision.biddingTrace,
    });
    let history = createEmptyBotReviewHistory();
    history = appendBotReviewHistory(history, firstScenario);
    history = appendBotReviewHistory(history, secondScenario);

    expect(history.map((scenario) => scenario.decisionId)).toEqual([
      firstScenario.decisionId,
      secondScenario.decisionId,
    ]);
    expect(history[0]).not.toBe(firstScenario);
    expect(history[0].ownHand.map(cardId)).toEqual(firstState.hands[firstState.currentPlayerId].map(cardId));
    expect(history[1].ownHand.map(cardId)).toEqual(secondState.hands[secondState.currentPlayerId].map(cardId));
    expect(history[0].trace.bidding).toMatchObject({ version: 3 });
    expect(history[1].trace.bidding).toMatchObject({ version: 3 });

    const capped = Array.from({ length: BOT_REVIEW_HISTORY_LIMIT + 1 }, (_, index) => ({
      ...firstScenario,
      decisionId: `decision-${index}`,
    })).reduce((current, scenario) => appendBotReviewHistory(current, scenario), createEmptyBotReviewHistory());
    expect(capped).toHaveLength(BOT_REVIEW_HISTORY_LIMIT);
    expect(capped[0].decisionId).toBe("decision-1");
    expect(createEmptyBotReviewHistory()).toEqual([]);
  });

  it("builds a V2 bundle with complete public state and pre-decision card evidence", () => {
    let state = playingState(8113);
    for (let index = 0; index < 5; index += 1) {
      const card = playableCardsForCurrentPlayer(state)[0];
      state = playCard(state, state.currentPlayerId, card);
    }
    const chosenCard = chooseBotCard(state);
    const cardScenario = captureBotReviewScenario(state, {
      decisionNumber: 8,
      elapsedMs: 0.8,
      chosenCard,
      capturedAt: "2026-09-12T12:00:00.000Z",
    });
    const publicBids: GameState["bids"] = [
      { playerId: 0, action: "bid", value: 80, trump: "hearts" },
      { playerId: 1, action: "pass" },
      { playerId: 2, action: "coinche" },
      { playerId: 0, action: "surcoinche" },
      { playerId: 3, action: "capot", trump: "clubs" },
    ];
    const bundleState = { ...state, bids: publicBids };
    const previousScenario = {
      ...cardScenario,
      decisionId: "previous-decision",
      capturedAt: "2026-09-12T11:59:00.000Z",
    };
    const publicAuctions = updateBotReviewPublicAuctions([], bundleState);
    const updatedPublicAuctions = updateBotReviewPublicAuctions(publicAuctions, {
      ...bundleState,
      bids: [...publicBids, { playerId: 1, action: "pass" }],
    });
    const bundle = createBotReviewBundle(bundleState, [previousScenario, cardScenario], {
      gameId: "game-123",
      selectedDecisionId: cardScenario.decisionId,
      humanComment: "  À revoir.  ",
      exportedAt: "2026-09-12T12:01:00.000Z",
      publicAuctions,
    });
    const parsed = JSON.parse(serializeBotReviewBundle(bundle));

    expect(bundle).toMatchObject({
      version: 2,
      type: "solo-analysis-bundle",
      gameId: "game-123",
      rulesetId: "contree-kffr",
      rulesetVersion: 1,
      ruleset: { id: "contree-kffr", version: 1 },
      selectedDecisionId: cardScenario.decisionId,
      humanComment: "À revoir.",
    });
    expect(bundle.decisions[0].ownHand.map(cardId)).toEqual(state.hands[state.currentPlayerId].map(cardId));
    expect(bundle.decisions.map((decision) => decision.decisionId)).toEqual(["previous-decision", cardScenario.decisionId]);
    expect(bundle.decisions[1].legalCards.map(cardId)).toEqual(playableCardsForCurrentPlayer(state).map(cardId));
    expect(bundle.decisions[1].chosenCard).toEqual(chosenCard);
    expect(bundle.current.bids).toEqual(publicBids);
    expect(bundle.current.playerNames).toEqual(state.playerNames);
    expect(bundle.publicAuctions).toEqual([{ roundNumber: state.roundNumber, bids: publicBids }]);
    expect(updatedPublicAuctions).toEqual([{
      roundNumber: state.roundNumber,
      bids: [...publicBids, { playerId: 1, action: "pass" }],
    }]);
    expect(bundle.current.completedTricks).toEqual(state.completedTricks);
    expect(bundle.current.currentTrick).toEqual(state.currentTrick);
    expect(parsed).not.toHaveProperty("hands");
  });

  it("normalizes an old V1 scenario without a ruleset snapshot", () => {
    const state = playingState(8115);
    const scenario = captureBotReviewScenario(state, {
      decisionNumber: 9,
      elapsedMs: 0.2,
      chosenCard: chooseBotCard(state),
    });
    const legacyScenario = {
      ...scenario,
      settings: { scoringMode: "ffb" as const, targetScore: 1000 },
    };

    expect(botReviewScenarioToGameState(legacyScenario).settings.ruleset).toMatchObject({
      id: "contree-kffr",
      version: 1,
    });
  });

  it("does not change multiplayer PlayerGameView hand isolation", () => {
    const state = playingState(8114);
    const view = toPlayerGameView(state, 0);
    const json = JSON.stringify(view);

    expect("hands" in view).toBe(false);
    expect(view.hand).toEqual(state.hands[0]);
    for (const opponent of [1, 2, 3] as PlayerId[]) {
      expect(json).not.toContain(JSON.stringify(state.hands[opponent]));
    }
  });
});
