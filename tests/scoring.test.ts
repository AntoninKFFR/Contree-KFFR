import { describe, expect, it } from "vitest";
import { scoreRound } from "@/engine/scoring";
import { BID_VALUES } from "@/engine/bidding";
import { roundFfbScore } from "@/engine/scoring";
import type { Contract, ContractStatus, GameSettings } from "@/engine/types";

const baseContract: Contract = {
  playerId: 0,
  teamId: 0,
  value: 80,
  trump: "hearts",
  status: "normal",
};

const madePointsSettings: GameSettings = { scoringMode: "made-points", targetScore: 1000 };
const announcedPointsSettings: GameSettings = {
  scoringMode: "announced-points",
  targetScore: 500,
};
const ffbSettings: GameSettings = { scoringMode: "ffb", targetScore: 1000 };

describe("scoring", () => {
  it("scores made-points mode with actual trick points when contract succeeds", () => {
    const result = scoreRound({
      contract: baseContract,
      settings: madePointsSettings,
      trickPointsByTeam: { 0: 92, 1: 70 },
    });

    expect(result.roundScore).toEqual({ 0: 172, 1: 70 });
  });

  it("scores announced-points mode with only the contract value", () => {
    const result = scoreRound({
      contract: baseContract,
      settings: announcedPointsSettings,
      trickPointsByTeam: { 0: 92, 1: 70 },
    });

    expect(result.roundScore).toEqual({ 0: 80, 1: 0 });
  });

  it("doubles the contract value when coinched", () => {
    const result = scoreRound({
      contract: { ...baseContract, status: "coinched", coinchedBy: 1 },
      settings: announcedPointsSettings,
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
      settings: madePointsSettings,
      trickPointsByTeam: { 0: 70, 1: 92 },
    });

    expect(result.contractSucceeded).toBe(false);
    expect(result.multiplier).toBe(4);
    expect(result.roundScore).toEqual({ 0: 0, 1: 482 });
  });
});

describe("canonical FFB scoring", () => {
  it.each([
    { points: { 0: 81, 1: 81 }, succeeded: false },
    { points: { 0: 80, 1: 82 }, succeeded: false },
    { points: { 0: 82, 1: 80 }, succeeded: true },
  ])("requires both the contract and strict superiority: $points", ({ points, succeeded }) => {
    for (const scoringMode of ["ffb", "made-points", "announced-points"] as const) {
      expect(scoreRound({
        contract: baseContract,
        settings: { scoringMode, targetScore: 1000 },
        trickPointsByTeam: points,
      }).contractSucceeded).toBe(succeeded);
    }
  });

  const numericCases = BID_VALUES.flatMap((value) =>
    (["normal", "coinched", "surcoinched"] as ContractStatus[]).flatMap((status) =>
      ([true, false] as const).map((succeeded) => ({ value, status, succeeded }))));

  it.each(numericCases)(
    "scores $value $status when succeeded=$succeeded",
    ({ value, status, succeeded }) => {
      const taker = succeeded ? Math.max(value, 82) : value - 1;
      const defender = 162 - taker;
      const multiplier = status === "normal" ? 1 : status === "coinched" ? 2 : 4;
      const result = scoreRound({
        contract: { ...baseContract, value, status },
        settings: ffbSettings,
        trickPointsByTeam: { 0: taker, 1: defender },
      });
      const expected = succeeded
        ? status === "normal"
          ? { 0: roundFfbScore(taker + value), 1: roundFfbScore(defender) }
          : { 0: (160 + value) * multiplier, 1: 0 }
        : { 0: 0, 1: (160 + value) * multiplier };
      expect(result.contractSucceeded).toBe(succeeded);
      expect(result.roundScore).toEqual(expected);
    },
  );

  it.each([
    {
      label: "taker announcements on normal success",
      status: "normal" as const,
      tricks: { 0: 92, 1: 70 }, announcements: { 0: 20, 1: 0 }, belote: { 0: 0, 1: 0 },
      expected: { 0: 190, 1: 70 },
    },
    {
      label: "defender announcements on normal success",
      status: "normal" as const,
      tricks: { 0: 92, 1: 70 }, announcements: { 0: 0, 1: 20 }, belote: { 0: 0, 1: 0 },
      expected: { 0: 170, 1: 90 },
    },
    {
      label: "transferred taker announcements on failure",
      status: "normal" as const,
      tricks: { 0: 70, 1: 92 }, announcements: { 0: 20, 1: 0 }, belote: { 0: 0, 1: 0 },
      expected: { 0: 0, 1: 260 },
    },
    {
      label: "coinched taker announcements",
      status: "coinched" as const,
      tricks: { 0: 92, 1: 70 }, announcements: { 0: 20, 1: 0 }, belote: { 0: 0, 1: 0 },
      expected: { 0: 520, 1: 0 },
    },
    {
      label: "taker belote on normal success",
      status: "normal" as const,
      tricks: { 0: 92, 1: 70 }, announcements: { 0: 0, 1: 0 }, belote: { 0: 20, 1: 0 },
      expected: { 0: 190, 1: 70 },
    },
    {
      label: "taker belote remains on failure",
      status: "normal" as const,
      tricks: { 0: 70, 1: 92 }, announcements: { 0: 0, 1: 0 }, belote: { 0: 20, 1: 0 },
      expected: { 0: 20, 1: 240 },
    },
    {
      label: "defender belote remains on coinched success",
      status: "coinched" as const,
      tricks: { 0: 92, 1: 70 }, announcements: { 0: 0, 1: 0 }, belote: { 0: 0, 1: 20 },
      expected: { 0: 480, 1: 20 },
    },
    {
      label: "surcoinched failure includes defender belote",
      status: "surcoinched" as const,
      tricks: { 0: 70, 1: 92 }, announcements: { 0: 0, 1: 0 }, belote: { 0: 0, 1: 20 },
      expected: { 0: 0, 1: 1040 },
    },
  ])("handles $label", ({ status, tricks, announcements, belote, expected }) => {
    expect(scoreRound({
      contract: { ...baseContract, status },
      settings: ffbSettings,
      trickPointsByTeam: tricks,
      announcementPointsByTeam: announcements,
      belotePointsByTeam: belote,
    }).roundScore).toEqual(expected);
  });

  it.each([
    { status: "normal" as const, expected: { 0: 330, 1: 0 } },
    { status: "coinched" as const, expected: { 0: 660, 1: 0 } },
    { status: "surcoinched" as const, expected: { 0: 1320, 1: 0 } },
  ])("scores a taker capot under a $status numeric contract", ({ status, expected }) => {
    const result = scoreRound({
      contract: { ...baseContract, status },
      settings: ffbSettings,
      trickPointsByTeam: { 0: 252, 1: 0 },
      tricksWonByTeam: { 0: 8, 1: 0 },
    });
    expect(result.capotTeam).toBe(0);
    expect(result.roundScore).toEqual(expected);
  });

  it.each([
    { status: "normal" as const, expected: { 0: 0, 1: 330 } },
    { status: "coinched" as const, expected: { 0: 0, 1: 660 } },
    { status: "surcoinched" as const, expected: { 0: 0, 1: 1320 } },
  ])("scores a defender capot under a $status numeric contract", ({ status, expected }) => {
    const result = scoreRound({
      contract: { ...baseContract, status },
      settings: ffbSettings,
      trickPointsByTeam: { 0: 0, 1: 252 },
      tricksWonByTeam: { 0: 0, 1: 8 },
    });
    expect(result.contractSucceeded).toBe(false);
    expect(result.capotTeam).toBe(1);
    expect(result.roundScore).toEqual(expected);
  });

  it.each([
    { status: "normal" as const, made: true, expected: { 0: 500, 1: 0 } },
    { status: "coinched" as const, made: true, expected: { 0: 1000, 1: 0 } },
    { status: "surcoinched" as const, made: true, expected: { 0: 2000, 1: 0 } },
    { status: "normal" as const, made: false, expected: { 0: 0, 1: 500 } },
    { status: "coinched" as const, made: false, expected: { 0: 0, 1: 1000 } },
    { status: "surcoinched" as const, made: false, expected: { 0: 0, 1: 2000 } },
  ])("scores an announced capot: $status, made=$made", ({ status, made, expected }) => {
    const result = scoreRound({
      contract: {
        kind: "capot", playerId: 0, teamId: 0, value: 250, trump: "hearts", status,
      },
      settings: ffbSettings,
      trickPointsByTeam: made ? { 0: 252, 1: 0 } : { 0: 80, 1: 82 },
      tricksWonByTeam: made ? { 0: 8, 1: 0 } : { 0: 4, 1: 4 },
    });
    expect(result.contractSucceeded).toBe(made);
    expect(result.roundScore).toEqual(expected);
  });

  it("transfers defender announcements to the taker on capot", () => {
    const result = scoreRound({
      contract: baseContract,
      settings: ffbSettings,
      trickPointsByTeam: { 0: 252, 1: 0 },
      tricksWonByTeam: { 0: 8, 1: 0 },
      announcementPointsByTeam: { 0: 0, 1: 20 },
    });
    expect(result.announcementPointsByTeam).toEqual({ 0: 20, 1: 0 });
    expect(result.roundScore).toEqual({ 0: 350, 1: 0 });
  });

  it("rounds regulatory points to the nearest ten with five rounded upward", () => {
    expect(roundFfbScore(84)).toBe(80);
    expect(roundFfbScore(85)).toBe(90);
  });
});
