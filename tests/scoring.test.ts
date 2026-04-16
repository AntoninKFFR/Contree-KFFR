import { describe, expect, it } from "vitest";
import { scoreRound } from "@/engine/scoring";
import type { Contract } from "@/engine/types";

const baseContract: Contract = {
  playerId: 0,
  teamId: 0,
  value: 80,
  trump: "hearts",
  status: "normal",
};

describe("scoring", () => {
  it("scores made-points mode with actual trick points when contract succeeds", () => {
    const result = scoreRound({
      contract: baseContract,
      settings: { scoringMode: "made-points" },
      trickPointsByTeam: { 0: 92, 1: 70 },
    });

    expect(result.roundScore).toEqual({ 0: 172, 1: 70 });
  });

  it("scores announced-points mode with only the contract value", () => {
    const result = scoreRound({
      contract: baseContract,
      settings: { scoringMode: "announced-points" },
      trickPointsByTeam: { 0: 92, 1: 70 },
    });

    expect(result.roundScore).toEqual({ 0: 80, 1: 0 });
  });

  it("doubles the contract value when coinched", () => {
    const result = scoreRound({
      contract: { ...baseContract, status: "coinched", coinchedBy: 1 },
      settings: { scoringMode: "announced-points" },
      trickPointsByTeam: { 0: 92, 1: 70 },
    });

    expect(result.multiplier).toBe(2);
    expect(result.roundScore).toEqual({ 0: 160, 1: 0 });
  });

  it("quadruples the contract value when surcoinched and failed", () => {
    const result = scoreRound({
      contract: {
        ...baseContract,
        status: "surcoinched",
        coinchedBy: 1,
        surcoinchedBy: 0,
      },
      settings: { scoringMode: "made-points" },
      trickPointsByTeam: { 0: 70, 1: 92 },
    });

    expect(result.contractSucceeded).toBe(false);
    expect(result.multiplier).toBe(4);
    expect(result.roundScore).toEqual({ 0: 0, 1: 482 });
  });
});
