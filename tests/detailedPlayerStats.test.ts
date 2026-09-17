import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { DetailedStatsDashboard } from "@/components/profile/DetailedStatsDashboard";
import { calculateDetailedPlayerStats, multiplayerGamesForDetailedStats, soloGamesForDetailedStats, type PlayerStatsGame } from "@/lib/detailedPlayerStats";
import type { Contract, PlayerId, RoundHistoryEntry, RoundResult, TeamId } from "@/engine/types";
import type { GameRow } from "@/lib/stats";
import type { MultiplayerHistoryGame } from "@/lib/multiplayerHistory";

const contract = (teamId: TeamId, playerId: PlayerId, value: 80 | 90 | 100 | 110 | 120 | 130 | 140 | 150 | 160 = 100, extras: Partial<Pick<Contract, "status" | "trump" | "contractMode" | "coinchedBy" | "surcoinchedBy">> = {}): Contract =>
  ({ kind: "points", value, teamId, playerId, status: "normal", trump: "hearts", ...extras });

function played(offer: Contract, options: { success?: boolean; takerPoints?: number; defenderPoints?: number; capotTeam?: TeamId | null; tenDeDerTeam?: TeamId } = {}): RoundResult {
  const { success = true, takerPoints = 120, defenderPoints = 42, capotTeam = null, tenDeDerTeam } = options;
  return {
    kind: "played", contract: offer, takerPoints, defenderPoints,
    trickPointsByTeam: { 0: 100, 1: 62 }, announcementPointsByTeam: { 0: 0, 1: 0 },
    belotePointsByTeam: { 0: 0, 1: 0 }, totalPointsByTeam: { 0: 100, 1: 62 },
    capotTeam, contractSucceeded: success, scoringMode: "ffb", multiplier: 1,
    roundScore: { 0: 100, 1: 60 }, ...(tenDeDerTeam === undefined ? {} : { tenDeDerTeam }),
  };
}

const entry = (result: RoundResult, index = 1): RoundHistoryEntry => ({ roundNumber: index, result, totalScoreAfterRound: { 0: 0, 1: 0 } });
const game = (results: RoundResult[], viewerPlayerId: PlayerId = 0, won = true): PlayerStatsGame => ({
  won, viewerPlayerId, viewerTeam: viewerPlayerId % 2 as TeamId,
  finishedAt: "2026-09-17T12:00:00Z", roundHistory: results.map(entry),
});
const stats = (...results: RoundResult[]) => calculateDetailedPlayerStats([game(results)]);

describe("shared detailed player statistics", () => {
  it("splits six attacking and four defending contracts 60/40, excluding all-pass", () => {
    const results = [
      ...Array.from({ length: 6 }, () => played(contract(0, 2))),
      ...Array.from({ length: 4 }, () => played(contract(1, 1))),
      { kind: "all-pass", roundScore: { 0: 0, 1: 0 } } as RoundResult,
    ];
    expect(stats(...results)).toMatchObject({ rounds: 11, attackRounds: 6, defenseRounds: 4, attackShare: 60, defenseShare: 40 });
  });

  it("returns empty rates without dividing by zero", () => {
    expect(calculateDetailedPlayerStats([])).toMatchObject({ total: 0, rounds: 0, winrate: null, attackShare: null, defenseShare: null, tenDeDerRate: null });
    expect(stats({ kind: "all-pass", roundScore: { 0: 0, 1: 0 } })).toMatchObject({ rounds: 1, attackShare: null, personalContractShare: null });
    expect(calculateDetailedPlayerStats([game([])])).toMatchObject({ total: 1, rounds: null, capotsMade: null, coinchesDeclared: null, missingHistoryGames: 1 });
  });

  it("keeps the attack and defense shares summing to 100 after rounding", () => {
    const result = stats(played(contract(0, 0)), ...Array.from({ length: 7 }, () => played(contract(1, 1))));
    expect(result).toMatchObject({ attackShare: 13, defenseShare: 87 });
  });

  it("distinguishes team attack from taking the contract personally", () => {
    expect(stats(played(contract(0, 0)), played(contract(0, 2)), played(contract(1, 1))))
      .toMatchObject({ attackRounds: 2, defenseRounds: 1, personalContractShare: 33 });
  });

  it("counts successful and failed attacks and defenses", () => {
    expect(stats(
      played(contract(0, 0), { success: true }), played(contract(0, 2), { success: false }),
      played(contract(1, 1), { success: true }), played(contract(1, 3), { success: false }),
    )).toMatchObject({ attackSuccessRate: 50, defenseSuccessRate: 50 });
  });

  it("compares the same numerical contracts with canonical taker points", () => {
    const result = stats(
      played(contract(0, 0, 100), { takerPoints: 118 }),
      played(contract(0, 0, 110), { takerPoints: 126 }),
      played(contract(0, 0, 120), { takerPoints: 125 }),
      played({ kind: "capot", value: 250, teamId: 0, playerId: 0, status: "normal" }, { takerPoints: 252 }),
    );
    expect(result).toMatchObject({ averageBid: 110, averageTakerPoints: 123, averageBidDifference: 13, capotsBidPersonally: 1 });
  });

  it("calculates attack fall gaps and beaten enemy bid gaps from numerical bids", () => {
    expect(stats(
      played(contract(0, 0, 110), { success: false, takerPoints: 101 }),
      played(contract(0, 2, 120), { success: false, takerPoints: 105 }),
      played(contract(1, 1, 110), { success: false, takerPoints: 96, defenderPoints: 66 }),
    )).toMatchObject({ averageFailedContractGap: -12, averageDefeatedContractGap: 14, averageDefensePoints: 66 });
  });

  it("separates achieved capots from personally announced Capot contracts", () => {
    expect(stats(
      played(contract(0, 2), { capotTeam: 0 }),
      played(contract(1, 1), { capotTeam: 1 }),
      played({ kind: "capot", value: 250, teamId: 0, playerId: 0, status: "normal" }, { capotTeam: 0 }),
      played({ kind: "capot", value: 250, teamId: 0, playerId: 0, status: "normal" }, { success: false }),
    )).toMatchObject({ capotsMade: 2, capotsSuffered: 1, capotsBidPersonally: 2, capotsBidSucceeded: 1, capotBidSuccessRate: 50 });
  });

  it("credits only the viewer's defensive Coinches and counts coinched own contracts", () => {
    const result = stats(
      played(contract(1, 1, 100, { status: "coinched", coinchedBy: 0 }), { success: false }),
      played(contract(1, 1, 100, { status: "coinched", coinchedBy: 0 }), { success: true }),
      played(contract(1, 1, 100, { status: "coinched", coinchedBy: 2 }), { success: false }),
      played(contract(0, 0, 100, { status: "coinched", coinchedBy: 1 }), { success: true }),
      played(contract(0, 2, 100, { status: "coinched", coinchedBy: 3 }), { success: false }),
    );
    expect(result).toMatchObject({ coinchesDeclared: 2, coincheSuccessRate: 50, ownContractsCoinched: 2, coinchedContractSuccessRate: 50 });
  });

  it("credits only the viewer's Surcoinches and measures whether that contract succeeds", () => {
    const result = stats(
      played(contract(0, 2, 100, { status: "surcoinched", coinchedBy: 1, surcoinchedBy: 0 }), { success: true }),
      played(contract(0, 0, 100, { status: "surcoinched", coinchedBy: 3, surcoinchedBy: 0 }), { success: false }),
      played(contract(0, 0, 100, { status: "surcoinched", coinchedBy: 1, surcoinchedBy: 2 }), { success: true }),
      played(contract(1, 1, 100, { status: "surcoinched", coinchedBy: 0, surcoinchedBy: 1 }), { success: true }),
    );
    expect(result).toMatchObject({ surcoinchesDeclared: 2, surcoincheSuccessRate: 50, ownContractsCoinched: 3, coinchesDeclared: 1 });
  });

  it("uses only known attacking last tricks for the 10 de der rate", () => {
    expect(stats(
      played(contract(0, 0), { tenDeDerTeam: 0 }),
      played(contract(0, 2), { tenDeDerTeam: 1 }),
      played(contract(1, 1), { tenDeDerTeam: 0 }),
      played(contract(0, 0)), // Older archive: unknown, not a defeat.
    )).toMatchObject({ tenDeDerKnown: 2, tenDeDerRate: 50 });
    expect(stats(played(contract(0, 0)))).toMatchObject({ tenDeDerKnown: 0, tenDeDerRate: null });
  });

  it("counts only suit contracts in the suit shares", () => {
    const result = stats(
      played(contract(0, 0, 100, { trump: "hearts" })),
      played(contract(0, 2, 100, { trump: "spades" }), { success: false }),
      played(contract(0, 0, 100, { trump: undefined, contractMode: { kind: "no-trump" } })),
    );
    expect(result.suits.find((suit) => suit.suit === "hearts")).toMatchObject({ contracts: 1, share: 50, successRate: 100 });
    expect(result.suits.find((suit) => suit.suit === "spades")).toMatchObject({ contracts: 1, share: 50, successRate: 0 });
  });

  it("normalizes equivalent Solo and Multi archives to exactly the same stats", () => {
    const history = [entry(played(contract(0, 0), { tenDeDerTeam: 0 })), entry(played(contract(1, 1), { success: false }), 2)];
    const solo: GameRow = { id: "solo", bot_score: 80, bot_summary: null, created_at: "2026-09-17T12:00:00Z", player_score: 120, scoring_mode: "ffb", target_score: 1000, won: true, round_history: history };
    const multi: MultiplayerHistoryGame = {
      id: "multi", started_at: "2026-09-17T11:00:00Z", finished_at: "2026-09-17T12:00:00Z", scoring_mode: "ffb", target_score: 1000,
      team_0_score: 120, team_1_score: 80, winner_team: 0, end_reason: "score", forfeiting_team: null,
      round_count: 2, viewer_seat_index: 0, players: [], round_history: history,
    };
    expect(soloGamesForDetailedStats([solo])[0].viewerPlayerId).toBe(0);
    expect(calculateDetailedPlayerStats(soloGamesForDetailedStats([solo])))
      .toEqual(calculateDetailedPlayerStats(multiplayerGamesForDetailedStats([multi])));
    expect(multiplayerGamesForDetailedStats([{ ...multi, viewer_seat_index: 3 }])[0]).toMatchObject({ viewerPlayerId: 3, viewerTeam: 1 });
    const seatThree = calculateDetailedPlayerStats(multiplayerGamesForDetailedStats([{
      ...multi, viewer_seat_index: 3, winner_team: 1,
      round_history: [entry(played(contract(1, 3)), 1), entry(played(contract(0, 0)), 2)],
    }]));
    expect(seatThree).toMatchObject({ wins: 1, attackRounds: 1, defenseRounds: 1, personalContractShare: 50 });
  });

  it("computes current and best win streaks from completion dates", () => {
    const games = [
      { ...game([], 0, true), finishedAt: "2026-09-17T12:00:00Z" },
      { ...game([], 0, true), finishedAt: "2026-09-16T12:00:00Z" },
      { ...game([], 0, false), finishedAt: "2026-09-15T12:00:00Z" },
      { ...game([], 0, true), finishedAt: "2026-09-14T12:00:00Z" },
    ];
    expect(calculateDetailedPlayerStats(games)).toMatchObject({ currentStreak: 2, bestStreak: 2 });
  });

  it("separates my contracts and partner contracts, including personal point averages", () => {
    const result = stats(
      played(contract(0, 0, 100), { success: true, takerPoints: 120 }),
      played(contract(0, 0, 120), { success: false, takerPoints: 110 }),
      played(contract(0, 2, 110), { success: true }),
      played(contract(0, 2, 130), { success: true }),
      played(contract(1, 1, 100), { success: false }),
    );
    expect(result).toMatchObject({ personalContracts: 2, personalSuccessRate: 50, partnerContracts: 2, partnerSuccessRate: 100,
      personalAverageBid: 110, personalAverageTakerPoints: 115, personalAverageBidDifference: 5, attackSuccessRate: 75 });
  });

  it("uses true odd and even medians and separates successful and failed bid means", () => {
    const odd = stats(
      played(contract(0, 0, 100), { success: true, takerPoints: 127 }),
      played(contract(0, 0, 110), { success: false, takerPoints: 101 }),
      played(contract(0, 0, 130), { success: true, takerPoints: 150 }),
    );
    expect(odd).toMatchObject({ medianBid: 110, averageSuccessfulBid: 115, averageFailedBid: 110, averageSuccessfulMargin: 24 });
    expect(stats(played(contract(0, 0, 100)), played(contract(0, 0, 110)), played(contract(0, 0, 120)), played(contract(0, 0, 130))).medianBid).toBe(115);
  });

  it("builds every exact bid value and the three bid zones without empty 0% rates", () => {
    const result = stats(...([80, 90, 100, 110, 120, 130, 140, 150, 160] as const)
      .map((value, index) => played(contract(0, 0, value), { success: index < 5 })));
    expect(result.bidValues.map(({ value, contracts, successes }) => ({ value, contracts, successes }))).toEqual([
      { value: 80, contracts: 1, successes: 1 }, { value: 90, contracts: 1, successes: 1 },
      { value: 100, contracts: 1, successes: 1 }, { value: 110, contracts: 1, successes: 1 },
      { value: 120, contracts: 1, successes: 1 }, { value: 130, contracts: 1, successes: 0 },
      { value: 140, contracts: 1, successes: 0 }, { value: 150, contracts: 1, successes: 0 },
      { value: 160, contracts: 1, successes: 0 },
    ]);
    expect(result.contractZones).toEqual([
      { label: "Prudent", range: "80–100", contracts: 3, successRate: 100 },
      { label: "Intermédiaire", range: "110–120", contracts: 2, successRate: 100 },
      { label: "Agressif", range: "130–160", contracts: 4, successRate: 0 },
    ]);
    expect(calculateDetailedPlayerStats([]).bidValues[0].successRate).toBeNull();
  });

  it("classifies 1–9, 10–19 and 20+ point falls using real points below the bid", () => {
    const result = stats(
      played(contract(0, 0, 110), { success: false, takerPoints: 101 }),
      played(contract(0, 0, 110), { success: false, takerPoints: 100 }),
      played(contract(0, 0, 120), { success: false, takerPoints: 100 }),
      played(contract(0, 0, 100), { success: false, takerPoints: 105 }), // Failed for another rule, not below the bid.
    );
    expect(result.fallTotal).toBe(3);
    expect(result.fallBands).toEqual([
      { label: "Serrées", contracts: 1, share: 33 },
      { label: "Moyennes", contracts: 1, share: 33 },
      { label: "Grosses", contracts: 1, share: 33 },
    ]);
    expect(calculateDetailedPlayerStats([]).fallBands.every((band) => band.share === null)).toBe(true);
  });

  it("measures 120+ and 130+ among my classical bids only", () => {
    const result = stats(
      played(contract(0, 0, 100)), played(contract(0, 0, 120)),
      played(contract(0, 0, 130)), played(contract(0, 0, 160)),
      played(contract(0, 2, 160)),
      played({ kind: "capot", value: 250, teamId: 0, playerId: 0, status: "normal" }),
    );
    expect(result).toMatchObject({ personalAtLeast120Rate: 75, personalAtLeast130Rate: 50 });
  });

  it("measures defense's known last tricks while excluding old unknown results", () => {
    const result = stats(
      played(contract(1, 1), { tenDeDerTeam: 0 }),
      played(contract(1, 3), { tenDeDerTeam: 1 }),
      played(contract(1, 1)),
      played(contract(0, 0), { tenDeDerTeam: 0 }),
    );
    expect(result).toMatchObject({ defenseTenDeDerRate: 50, tenDeDerRate: 100 });
    expect(stats(played(contract(1, 1))).defenseTenDeDerRate).toBeNull();
  });

  it("normalizes achieved capots per 100 known rounds and avoids an unknown zero", () => {
    const result = stats(
      played(contract(0, 0), { capotTeam: 0 }),
      { kind: "all-pass", roundScore: { 0: 0, 1: 0 } },
      played(contract(1, 1)),
      played(contract(0, 2)),
    );
    expect(result).toMatchObject({ capotsMade: 1, rounds: 4, capotsPer100Rounds: 25 });
    expect(calculateDetailedPlayerStats([game([])]).capotsPer100Rounds).toBeNull();
  });

  it("measures winning personal Coinche gaps and successful personal contracts under Coinche", () => {
    const result = stats(
      played(contract(1, 1, 120, { status: "coinched", coinchedBy: 0 }), { success: false, takerPoints: 94 }),
      played(contract(1, 1, 110, { status: "coinched", coinchedBy: 0 }), { success: false, takerPoints: 100 }),
      played(contract(1, 1, 100, { status: "coinched", coinchedBy: 2 }), { success: false, takerPoints: 80 }),
      played(contract(0, 0, 110, { status: "coinched", coinchedBy: 1 }), { success: true, takerPoints: 128 }),
      played(contract(0, 2, 120, { status: "coinched", coinchedBy: 3 }), { success: true, takerPoints: 140 }),
      played(contract(0, 0, 100, { status: "surcoinched", coinchedBy: 1, surcoinchedBy: 0 }), { success: true, takerPoints: 150 }),
    );
    expect(result).toMatchObject({ coinchesDeclared: 2, coincheSuccessRate: 100, winningCoincheAverageGap: 18,
      personalCoinchedSuccessMargin: 18 });
  });

  it("keeps suit averages separate from no-trump and all-trump", () => {
    const result = stats(
      played(contract(0, 0, 100, { trump: "hearts" })),
      played(contract(0, 2, 120, { trump: "hearts" }), { success: false }),
      played(contract(0, 0, 130, { trump: undefined, contractMode: { kind: "no-trump" } })),
      played(contract(0, 2, 140, { trump: undefined, contractMode: { kind: "all-trump" } }), { success: false }),
    );
    expect(result.suits.find((suit) => suit.suit === "hearts")).toMatchObject({ contracts: 2, share: 100, successRate: 50, averageBid: 110 });
    expect(result.specialModes).toEqual([
      { mode: "no-trump", contracts: 1, successRate: 100, averageBid: 130 },
      { mode: "all-trump", contracts: 1, successRate: 0, averageBid: 140 },
    ]);
    expect(stats(played(contract(0, 0))).specialModes).toEqual([]);
  });

  it("uses all available games below 20 and presents recent results chronologically", () => {
    const games = [
      { ...game([played(contract(0, 0))], 0, true), finishedAt: "2026-09-17T12:00:00Z" },
      { ...game([played(contract(1, 1), { success: false })], 0, false), finishedAt: "2026-09-15T12:00:00Z" },
      { ...game([played(contract(0, 2), { success: false })], 0, true), finishedAt: "2026-09-16T12:00:00Z" },
    ];
    expect(calculateDetailedPlayerStats(games).recentForm).toEqual({
      sampleSize: 3, wins: 2, winrate: 67, attackSuccessRate: 50, defenseSuccessRate: 100,
      results: [false, true, true],
    });
  });

  it("limits recent form to the newest 20 of more than 20 games", () => {
    const games = Array.from({ length: 22 }, (_, index) => ({
      ...game([played(contract(0, 0), { success: index >= 2 })], 0, index >= 2),
      finishedAt: new Date(Date.UTC(2026, 8, 1 + index)).toISOString(),
    })).reverse();
    const result = calculateDetailedPlayerStats(games);
    expect(result).toMatchObject({ total: 22, winrate: 91, recentForm: { sampleSize: 20, wins: 20, winrate: 100, attackSuccessRate: 100 } });
    expect(result.recentForm.results).toEqual(Array.from({ length: 20 }, () => true));
  });

  it("compares the first and last 50 contract rounds only with at least 100", () => {
    const first = Array.from({ length: 50 }, (_, index) => played(contract(0, 0, 100), { success: index < 30 }));
    const last = Array.from({ length: 50 }, (_, index) => played(contract(0, 0, 120), { success: index < 40 }));
    const result = calculateDetailedPlayerStats([game([...first, ...last])]);
    expect(result.progression).toEqual({
      first: { rounds: 50, attackSuccessRate: 60, averageBid: 100 },
      recent: { rounds: 50, attackSuccessRate: 80, averageBid: 120 },
    });
    expect(calculateDetailedPlayerStats([game([...first, ...last.slice(0, 49)])]).progression).toBeNull();
  });

  it("keeps every numeric metric finite for empty and historical inputs", () => {
    const visit = (value: unknown): void => {
      if (typeof value === "number") expect(Number.isFinite(value)).toBe(true);
      else if (value && typeof value === "object") Object.values(value).forEach(visit);
    };
    visit(calculateDetailedPlayerStats([]));
    visit(calculateDetailedPlayerStats([game([])]));
    visit(stats(played(contract(0, 0)), played(contract(1, 1), { success: false })));
  });

  it("renders exact bid counts and omits the incomplete-archives message", () => {
    const data = calculateDetailedPlayerStats([game([played(contract(0, 0, 110))]), game([])]);
    vi.stubGlobal("React", React);
    let markup: string;
    try { markup = renderToStaticMarkup(React.createElement(DetailedStatsDashboard, { stats: data })); }
    finally { vi.unstubAllGlobals(); }
    expect(markup).toContain("Contrat 110 : 100 %, 1 réussi sur 1");
    expect(markup).toContain("1/1");
    expect(markup).not.toContain("sans détail de manches");
  });
});
