import { describe, expect, it } from "vitest";
import { simulateOneGame, runSimulation } from "@/simulation/simulator";

describe("bot simulator", () => {
  it("plays a full bot game without using the React interface", () => {
    const game = simulateOneGame({
      seed: 10,
      settings: { targetScore: 300 },
      teamProfiles: { 0: "balanced", 1: "aggressive" },
    });

    expect(game.rounds.length).toBeGreaterThan(0);
    expect([0, 1]).toContain(game.winnerTeam);
  });

  it("collects comparable statistics over several games", () => {
    const summary = runSimulation({
      games: 3,
      seed: 20,
      settings: { targetScore: 300 },
      teamProfiles: { 0: "prudent", 1: "aggressive" },
    });

    expect(summary.games).toBe(3);
    expect(summary.wins[0] + summary.wins[1]).toBe(3);
    expect(summary.rounds).toBeGreaterThan(0);
    expect(summary.contractsAttempted).toBeGreaterThan(0);
  });

  it("can benchmark Monte Carlo V2 against Monte Carlo V1", () => {
    const summary = runSimulation({
      games: 2,
      seed: 30,
      settings: { targetScore: 300 },
      teamProfiles: { 0: "main_montecarlo_v2", 1: "main_montecarlo" },
    });

    expect(summary.games).toBe(2);
    expect(summary.profileStats.main_montecarlo_v2.games).toBe(2);
    expect(summary.profileStats.main_montecarlo.games).toBe(2);
  });
});
