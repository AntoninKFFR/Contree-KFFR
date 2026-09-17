import { describe, expect, it } from "vitest";
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
});
