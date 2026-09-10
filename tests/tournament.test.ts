import { describe, expect, it } from "vitest";
import { createDeck } from "@/engine/cards";
import { createInitialGame, makeBid } from "@/engine/game";
import { createSeededRandom, fisherYatesShuffle } from "@/engine/random";
import { getLegalCards } from "@/engine/rules";
import type { GameState, PlayerId, RoundResult } from "@/engine/types";
import { chooseStrategyBid, chooseStrategyCard, composeStrategy, findBotStrategy } from "@/simulation/botRegistry";
import { FFB_RECALIBRATION_STRATEGIES } from "@/simulation/ffbRecalibration";
import { CANONICAL_SCORING_MODE, CANONICAL_TARGET_SCORE, formatTournament, playTournamentGame, runPairedMatchup, runRoundRobin, summarizeTournamentGames, type TournamentGame } from "@/simulation/tournament";

describe("tournament harness", () => {
  function permuteHiddenHands(state: GameState): GameState {
    const opponents = ([0, 1, 2, 3] as PlayerId[]).filter((player) => player !== state.currentPlayerId);
    return {
      ...state,
      hands: {
        ...state.hands,
        [opponents[0]]: state.hands[opponents[1]],
        [opponents[1]]: state.hands[opponents[2]],
        [opponents[2]]: state.hands[opponents[0]],
      },
    };
  }

  it("uses exactly the same seeds in both paired orientations", () => {
    const games = runPairedMatchup(findBotStrategy("main"), findBotStrategy("balanced"), 4, 700);
    expect(games.map((game) => game.seed)).toEqual([700, 700, 701, 701]);
    expect(games[0].teamStrategies).toEqual({ 0: "main", 1: "balanced" });
    expect(games[1].teamStrategies).toEqual({ 0: "balanced", 1: "main" });
    expect(games.every((game) => game.scoringMode === "ffb" && game.targetScore === 1000)).toBe(true);
  });

  it("defines the canonical championship as FFB to 1000 points", () => {
    expect(CANONICAL_SCORING_MODE).toBe("ffb");
    expect(CANONICAL_TARGET_SCORE).toBe(1000);
  });

  it("screens every requested serious strategy without debug-only variants", () => {
    const ids = FFB_RECALIBRATION_STRATEGIES.map((strategy) => strategy.id);
    expect(ids).toEqual(expect.arrayContaining([
      "hybrid_legacy_v1",
      "hybrid_legacy_v2",
      "hybrid_legacy_v3",
      "main_montecarlo",
      "main_montecarlo_v2",
      "main_montecarlo_v3",
      "main_montecarlo_v3_1",
      "main_montecarlo_bidding",
      "human_doctrine_v1_mc_v1",
      "human_doctrine_v2_no110_mc_v1",
    ]));
    expect(ids.some((id) => id.startsWith("legacy_heuristic") || id.includes("diagnostic"))).toBe(false);
  });

  it("gives strictly identical aliases no structural advantage", () => {
    const original = findBotStrategy("balanced");
    const first = composeStrategy("same-a", "Same A", original, original);
    const second = composeStrategy("same-b", "Same B", original, original);
    const games = runPairedMatchup(first, second, 4, 9123);
    const firstWins = games.filter((game) => game.teamStrategies[game.winnerTeam] === first.id).length;
    expect(firstWins).toBe(2);
  });

  it("rejects a safety-limit result instead of inventing a winner", () => {
    expect(() => playTournamentGame({
      seed: 99,
      teamStrategies: { 0: findBotStrategy("balanced"), 1: findBotStrategy("prudent") },
      maxRounds: 0,
    })).toThrow(/Partie invalide/);
  });

  it("builds ranking and complete head-to-head results", () => {
    const result = runRoundRobin([findBotStrategy("main"), findBotStrategy("balanced"), findBotStrategy("aggressive")], 2, 800);
    expect(result.totalGames).toBe(6);
    expect(result.ranking).toHaveLength(3);
    expect(result.ranking[0]).toEqual(expect.objectContaining({
      attackRounds: expect.any(Number),
      defenseRounds: expect.any(Number),
      defensiveSets: expect.any(Number),
      defensiveSetRate: expect.any(Number),
      averageAttackScore: expect.any(Number),
      averageDefenseScore: expect.any(Number),
    }));
    expect(result.headToHead).toHaveLength(3);
    expect(formatTournament(result)).toContain("HEAD-TO-HEAD");
  });

  it("aggregates capot, announcements and belote from an FFB RoundResult", () => {
    const first = findBotStrategy("balanced");
    const second = findBotStrategy("prudent");
    const result: RoundResult = {
      kind: "played",
      contract: { kind: "capot", value: 250, playerId: 0, teamId: 0, trump: "hearts", status: "normal" },
      takerPoints: 290,
      defenderPoints: 20,
      trickPointsByTeam: { 0: 250, 1: 0 },
      announcementPointsByTeam: { 0: 20, 1: 0 },
      belotePointsByTeam: { 0: 20, 1: 20 },
      totalPointsByTeam: { 0: 290, 1: 20 },
      capotTeam: 0,
      contractSucceeded: true,
      scoringMode: "ffb",
      multiplier: 1,
      roundScore: { 0: 540, 1: 20 },
    };
    const game: TournamentGame = {
      seed: 1,
      winnerTeam: 0,
      totalScore: { 0: 1000, 1: 500 },
      teamStrategies: { 0: first.id, 1: second.id },
      rounds: [{ result, bids: [{ playerId: 0, action: "capot", trump: "hearts" }], tricksWon: { 0: 8, 1: 0 } }],
      timings: [],
      scoringMode: "ffb",
      targetScore: 1000,
    };
    const stats = summarizeTournamentGames([first, second], [game]);
    expect(stats.find((item) => item.id === first.id)).toMatchObject({
      capotsBid: 1,
      capotsBidSucceeded: 1,
      announcementPoints: 20,
      belotes: 1,
      announcementAndBelotePoints: 40,
    });
    expect(stats.find((item) => item.id === second.id)).toMatchObject({
      capotsSuffered: 1,
      opponentAnnouncementPoints: 20,
      belotes: 1,
    });
  });

  it("lets every recalibration card engine play legally under a capot contract", () => {
    let state = createInitialGame(createSeededRandom(420), { scoringMode: "ffb", targetScore: 1000 });
    state = makeBid(state, state.currentPlayerId, { action: "capot", trump: "hearts" });
    for (let pass = 0; pass < 3; pass += 1) {
      state = makeBid(state, state.currentPlayerId, { action: "pass" });
    }
    for (const strategy of FFB_RECALIBRATION_STRATEGIES) {
      expect(getLegalCards(state.hands[state.currentPlayerId], state.currentTrick, state.currentPlayerId, state.trump!))
        .toContainEqual(chooseStrategyCard(state, strategy));
    }
  }, 30_000);

  it("keeps every recalibration decision invariant when only hidden opposing hands change", () => {
    const bidding = createInitialGame(createSeededRandom(421), { scoringMode: "ffb", targetScore: 1000 });
    const hiddenBidding = permuteHiddenHands(bidding);
    for (const strategy of FFB_RECALIBRATION_STRATEGIES) {
      expect(chooseStrategyBid(hiddenBidding, strategy)).toEqual(chooseStrategyBid(bidding, strategy));
    }

    let playing = createInitialGame(createSeededRandom(422), { scoringMode: "ffb", targetScore: 1000 });
    playing = makeBid(playing, playing.currentPlayerId, { action: "capot", trump: "spades" });
    for (let pass = 0; pass < 3; pass += 1) {
      playing = makeBid(playing, playing.currentPlayerId, { action: "pass" });
    }
    const hiddenPlaying = permuteHiddenHands(playing);
    for (const strategy of FFB_RECALIBRATION_STRATEGIES) {
      expect(chooseStrategyCard(hiddenPlaying, strategy)).toEqual(chooseStrategyCard(playing, strategy));
    }
  }, 30_000);
});

describe("seeded Fisher-Yates shuffle", () => {
  it("is reproducible, complete and generally differs for another seed", () => {
    const deck = createDeck();
    const first = fisherYatesShuffle(deck, createSeededRandom(10));
    const repeated = fisherYatesShuffle(deck, createSeededRandom(10));
    const other = fisherYatesShuffle(deck, createSeededRandom(11));
    expect(first).toEqual(repeated);
    expect(first).not.toEqual(other);
    expect(new Set(first.map((card) => `${card.rank}-${card.suit}`)).size).toBe(deck.length);
    expect(first).toHaveLength(deck.length);
  });
});
