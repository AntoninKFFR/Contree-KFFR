import { describe, expect, it } from "vitest";
import { createInitialGame } from "@/engine/game";
import { createSeededRandom } from "@/engine/random";
import {
  BIDDING_ENGINE_IDS,
  CARD_ENGINE_IDS,
  createHybridStrategy,
  chooseStrategyBid,
} from "@/simulation/botRegistry";
import { runPairedMatchup, summarizeTournamentGames } from "@/simulation/tournament";

describe("hybrid bot composition", () => {
  it("exposes every independent bidding and card combination", () => {
    const combinations = BIDDING_ENGINE_IDS.flatMap((bidding) =>
      CARD_ENGINE_IDS.map((card) => createHybridStrategy(bidding, card)),
    );

    expect(BIDDING_ENGINE_IDS).toHaveLength(16);
    expect(BIDDING_ENGINE_IDS).toContain("human_doctrine_v1");
    expect(BIDDING_ENGINE_IDS).toContain("human_doctrine_v2_no110");
    expect(BIDDING_ENGINE_IDS).toContain("human_doctrine_v2_comm");
    expect(BIDDING_ENGINE_IDS).toContain("human_doctrine_v2_110");
    expect(BIDDING_ENGINE_IDS).toContain("human_doctrine_v2_1_balanced");
    expect(BIDDING_ENGINE_IDS).toContain("human_doctrine_v3_conversation");
    expect(CARD_ENGINE_IDS).toHaveLength(9);
    const expectedCombinations = BIDDING_ENGINE_IDS.length * CARD_ENGINE_IDS.length;
    expect(combinations).toHaveLength(expectedCombinations);
    expect(new Set(combinations.map((strategy) => strategy.id))).toHaveLength(expectedCombinations);
    expect(createHybridStrategy("legacy", "monte_carlo_v3")).toMatchObject({
      id: "hybrid_legacy__monte_carlo_v3",
      bidding: { kind: "legacy" },
      card: { kind: "monte-carlo-v3" },
    });
  });

  it("keeps production-compatible bids independent from hidden hands", () => {
    const strategy = createHybridStrategy("legacy", "monte_carlo_v3");
    const state = createInitialGame(createSeededRandom(90210));
    const hiddenPlayerIds = ([0, 1, 2, 3] as const).filter((playerId) => playerId !== state.currentPlayerId);
    const changedHiddenHands = {
      ...state,
      hands: {
        ...state.hands,
        [hiddenPlayerIds[0]]: [...state.hands[hiddenPlayerIds[1]]],
        [hiddenPlayerIds[1]]: [...state.hands[hiddenPlayerIds[0]]],
      },
    };

    expect(chooseStrategyBid(state, strategy)).toEqual(chooseStrategyBid(changedHiddenHands, strategy));
  });

  it("preserves paired reproducibility and reports detailed bidding metrics", () => {
    const first = createHybridStrategy("legacy", "main");
    const second = createHybridStrategy("main", "legacy");
    const games = runPairedMatchup(first, second, 2, 4400, 100);
    const repeated = runPairedMatchup(first, second, 2, 4400, 100);
    const stats = summarizeTournamentGames([first, second], games);

    expect(games.map((game) => game.seed)).toEqual([4400, 4400]);
    expect(games.map((game) => game.totalScore)).toEqual(repeated.map((game) => game.totalScore));
    expect(stats[0]).toEqual(expect.objectContaining({
      openings: expect.any(Number),
      raises: expect.any(Number),
      partnerRaises: expect.any(Number),
      opponentOvercalls: expect.any(Number),
      trumpChanges: expect.any(Number),
      bidLevels: expect.any(Object),
      averageCpuMsPerGame: expect.any(Number),
    }));
  });
});
