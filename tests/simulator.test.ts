import { describe, expect, it } from "vitest";
import { simulateOneGame, runSimulation } from "@/simulation/simulator";

describe("bot simulator", () => {
  it("rejects a safety-limit result instead of choosing the current score leader", () => {
    expect(() => simulateOneGame({
      seed: 9,
      maxRoundsPerGame: 0,
      teamProfiles: { 0: "balanced", 1: "aggressive" },
    })).toThrow(/Partie invalide/);
  });

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
  }, 15_000);

  it("can benchmark Monte Carlo bidding against the current Monte Carlo V2 bot", () => {
    const summary = runSimulation({
      games: 2,
      seed: 40,
      settings: { targetScore: 300 },
      teamProfiles: { 0: "main_montecarlo_bidding", 1: "main_montecarlo_v2" },
    });

    expect(summary.games).toBe(2);
    expect(summary.profileStats.main_montecarlo_bidding.games).toBe(2);
    expect(summary.profileStats.main_montecarlo_v2.games).toBe(2);
  }, 15_000);

  it("runs the deterministic FAST pairing for experimental V3 against V2", () => {
    const first = runSimulation({
      games: 1,
      seed: 50,
      settings: { targetScore: 100 },
      teamProfiles: { 0: "main_montecarlo_v3", 1: "main_montecarlo_v2" },
    });
    const mirrored = runSimulation({
      games: 1,
      seed: 50,
      settings: { targetScore: 100 },
      teamProfiles: { 0: "main_montecarlo_v2", 1: "main_montecarlo_v3" },
    });
    expect(first.games + mirrored.games).toBe(2);
    expect(first.profileStats.main_montecarlo_v3.games).toBe(1);
    expect(mirrored.profileStats.main_montecarlo_v3.games).toBe(1);
  });
});
