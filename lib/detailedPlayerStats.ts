import { SOLO_SEAT_ASSIGNMENTS, firstHumanSeat } from "@/engine/seats";
import { resolveContractMode } from "@/engine/contractMode";
import type { BidValue, PlayerId, RoundHistoryEntry, Suit, TeamId } from "@/engine/types";
import type { GameRow } from "@/lib/stats";
import type { MultiplayerHistoryGame } from "@/lib/multiplayerHistory";

export type PlayerStatsGame = {
  won: boolean;
  finishedAt: string | null;
  viewerPlayerId: PlayerId;
  viewerTeam: TeamId;
  roundHistory?: RoundHistoryEntry[];
};

export type SuitStats = { suit: Suit; contracts: number; share: number | null; successRate: number | null; averageBid: number | null };
export type ContractValueStats = { value: BidValue; contracts: number; successes: number; successRate: number | null };
export type ContractZoneStats = { label: "Prudent" | "Intermédiaire" | "Agressif"; range: string; contracts: number; successRate: number | null };
export type FallBandStats = { label: "Serrées" | "Moyennes" | "Grosses"; contracts: number; share: number | null };
export type SpecialModeStats = { mode: "no-trump" | "all-trump"; contracts: number; successRate: number | null; averageBid: number | null };
export type RecentFormStats = { sampleSize: number; wins: number; winrate: number | null; attackSuccessRate: number | null; defenseSuccessRate: number | null; results: boolean[] };
export type ProgressionSample = { rounds: number; attackSuccessRate: number | null; averageBid: number | null };
export type ProgressionStats = { first: ProgressionSample; recent: ProgressionSample };

export type DetailedPlayerStats = {
  total: number; wins: number; losses: number; winrate: number | null;
  currentStreak: number; bestStreak: number; rounds: number | null; missingHistoryGames: number;
  capotsMade: number | null; capotsSuffered: number | null;
  capotsPer100Rounds: number | null;
  attackRounds: number; defenseRounds: number; attackShare: number | null; defenseShare: number | null;
  attackSuccessRate: number | null; personalContractShare: number | null;
  averageBid: number | null; averageTakerPoints: number | null; averageBidDifference: number | null;
  averageFailedContractGap: number | null; tenDeDerRate: number | null; tenDeDerKnown: number;
  defenseTenDeDerRate: number | null;
  personalContracts: number | null; personalSuccessRate: number | null;
  personalAverageBid: number | null; personalAverageTakerPoints: number | null; personalAverageBidDifference: number | null;
  partnerContracts: number | null; partnerSuccessRate: number | null;
  medianBid: number | null; averageSuccessfulBid: number | null; averageFailedBid: number | null;
  averageSuccessfulMargin: number | null;
  personalAtLeast120Rate: number | null; personalAtLeast130Rate: number | null;
  bidValues: ContractValueStats[]; contractZones: ContractZoneStats[];
  fallBands: FallBandStats[]; fallTotal: number;
  defenseSuccessRate: number | null; averageDefensePoints: number | null;
  averageDefeatedContractGap: number | null;
  capotsBidPersonally: number | null; capotsBidSucceeded: number | null; capotBidSuccessRate: number | null;
  coinchesDeclared: number | null; coincheSuccessRate: number | null;
  ownContractsCoinched: number | null; coinchedContractSuccessRate: number | null;
  winningCoincheAverageGap: number | null; personalCoinchedSuccessMargin: number | null;
  surcoinchesDeclared: number | null; surcoincheSuccessRate: number | null;
  suits: SuitStats[];
  specialModes: SpecialModeStats[];
  recentForm: RecentFormStats;
  progression: ProgressionStats | null;
};

const SUITS: Suit[] = ["hearts", "spades", "diamonds", "clubs"];
const BID_VALUES: BidValue[] = [80, 90, 100, 110, 120, 130, 140, 150, 160];
const percent = (part: number, whole: number): number | null => whole ? Math.round(part * 100 / whole) : null;
const average = (sum: number, count: number): number | null => count ? Math.round(sum / count) : null;
const otherTeam = (team: TeamId): TeamId => team === 0 ? 1 : 0;
const pointBid = (result: Extract<RoundHistoryEntry["result"], { kind: "played" }>): BidValue | null =>
  result.contract.kind === undefined || result.contract.kind === "points" ? result.contract.value : null;
const median = (values: number[]): number | null => {
  if (!values.length) return null;
  const ordered = [...values].sort((a, b) => a - b);
  const middle = Math.floor(ordered.length / 2);
  return ordered.length % 2 ? ordered[middle] : (ordered[middle - 1] + ordered[middle]) / 2;
};

function contractOutcomes(games: PlayerStatsGame[]) {
  let attack = 0, attackWins = 0, defense = 0, defenseWins = 0;
  for (const game of games) for (const entry of game.roundHistory ?? []) {
    if (entry.result.kind !== "played") continue;
    if (entry.result.contract.teamId === game.viewerTeam) {
      attack++;
      if (entry.result.contractSucceeded) attackWins++;
    } else {
      defense++;
      if (!entry.result.contractSucceeded) defenseWins++;
    }
  }
  return { attack, attackWins, defense, defenseWins };
}

/** Solo has one human seat, currently PlayerId 0; derive it from the seat assignment. */
export function soloGamesForDetailedStats(games: GameRow[]): PlayerStatsGame[] {
  const viewerPlayerId = firstHumanSeat(SOLO_SEAT_ASSIGNMENTS);
  if (viewerPlayerId === null) throw new Error("Solo has no human seat");
  const viewerTeam = viewerPlayerId % 2 as TeamId;
  return games.map((game) => ({
    won: game.won === true,
    finishedAt: game.created_at,
    viewerPlayerId,
    viewerTeam,
    roundHistory: game.round_history,
  }));
}

/** The archive RPC returns the viewer's seat; multiplayer seats are engine PlayerIds. */
export function multiplayerGamesForDetailedStats(games: MultiplayerHistoryGame[]): PlayerStatsGame[] {
  return games.map((game) => ({
    won: game.winner_team === game.viewer_seat_index % 2,
    finishedAt: game.finished_at,
    viewerPlayerId: game.viewer_seat_index,
    viewerTeam: game.viewer_seat_index % 2 as TeamId,
    roundHistory: game.round_history,
  }));
}

/** All rates use only archived, completed games; null means there is no eligible sample. */
export function calculateDetailedPlayerStats(games: PlayerStatsGame[]): DetailedPlayerStats {
  const sorted = games.map((game, index) => ({ game, index })).sort((a, b) => {
    const first = Date.parse(a.game.finishedAt ?? "");
    const second = Date.parse(b.game.finishedAt ?? "");
    return (Number.isFinite(second) ? second : 0) - (Number.isFinite(first) ? first : 0) || a.index - b.index;
  }).map(({ game }) => game);
  const total = games.length;
  const wins = games.filter((game) => game.won).length;
  const missingHistoryGames = games.filter((game) => !game.roundHistory?.length).length;
  const hasRoundData = total === 0 || missingHistoryGames < total;
  let currentStreak = 0;
  for (const game of sorted) { if (!game.won) break; currentStreak++; }
  let bestStreak = 0;
  let streak = 0;
  for (const game of sorted) {
    streak = game.won ? streak + 1 : 0;
    bestStreak = Math.max(bestStreak, streak);
  }

  let rounds = 0, attackRounds = 0, defenseRounds = 0, attackWins = 0, defenseWins = 0;
  let capotsMade = 0, capotsSuffered = 0;
  let bidSum = 0, takerPointSum = 0, pointContracts = 0;
  let failedGapSum = 0, failedPointContracts = 0, defensePointSum = 0;
  let defeatedGapSum = 0, defeatedPointContracts = 0;
  let tenDeDerWon = 0, tenDeDerKnown = 0;
  let capotsBidPersonally = 0, capotsBidSucceeded = 0;
  let coinchesDeclared = 0, coinchesWon = 0, ownContractsCoinched = 0, coinchedContractsWon = 0;
  let surcoinchesDeclared = 0, surcoinchesWon = 0;
  let defenseTenDeDerKnown = 0, defenseTenDeDerWon = 0;
  let personalContracts = 0, personalWins = 0, partnerContracts = 0, partnerWins = 0;
  let personalPointContracts = 0, personalBidSum = 0, personalTakerPoints = 0;
  let personalAtLeast120 = 0, personalAtLeast130 = 0;
  let successfulBidSum = 0, successfulBidCount = 0, failedBidSum = 0, failedBidCount = 0;
  let successfulMarginSum = 0;
  let winningCoincheGapSum = 0, winningCoincheGapCount = 0;
  let personalCoinchedMarginSum = 0, personalCoinchedMarginCount = 0;
  const pointBids: number[] = [];
  const fallCounts = { Serrées: 0, Moyennes: 0, Grosses: 0 };
  const bidCounts = new Map<BidValue, { contracts: number; successes: number }>(BID_VALUES.map((value) => [value, { contracts: 0, successes: 0 }]));
  const suitCounts = new Map<Suit, { contracts: number; successes: number; bidSum: number; bidCount: number }>(SUITS.map((suit) => [suit, { contracts: 0, successes: 0, bidSum: 0, bidCount: 0 }]));
  const specialCounts = new Map<SpecialModeStats["mode"], { contracts: number; successes: number; bidSum: number; bidCount: number }>(
    (["no-trump", "all-trump"] as const).map((mode) => [mode, { contracts: 0, successes: 0, bidSum: 0, bidCount: 0 }]),
  );

  for (const game of games) for (const entry of game.roundHistory ?? []) {
    rounds++;
    const result = entry.result;
    if (result.kind !== "played") continue;
    const { contract } = result;
    const attack = contract.teamId === game.viewerTeam;
    const bid = pointBid(result);
    if (result.capotTeam === game.viewerTeam) capotsMade++;
    else if (result.capotTeam === otherTeam(game.viewerTeam)) capotsSuffered++;
    if (contract.coinchedBy === game.viewerPlayerId && !attack) {
      coinchesDeclared++;
      if (!result.contractSucceeded) {
        coinchesWon++;
        if (bid !== null && bid > result.takerPoints) {
          winningCoincheGapSum += bid - result.takerPoints;
          winningCoincheGapCount++;
        }
      }
    }
    if (attack) {
      attackRounds++;
      if (result.contractSucceeded) attackWins++;
      if (contract.playerId === game.viewerPlayerId) {
        personalContracts++;
        if (result.contractSucceeded) personalWins++;
        if (bid !== null) {
          personalPointContracts++;
          personalBidSum += bid;
          personalTakerPoints += result.takerPoints;
          if (bid >= 120) personalAtLeast120++;
          if (bid >= 130) personalAtLeast130++;
        }
      } else {
        partnerContracts++;
        if (result.contractSucceeded) partnerWins++;
      }
      if (typeof result.tenDeDerTeam === "number") {
        tenDeDerKnown++;
        if (result.tenDeDerTeam === game.viewerTeam) tenDeDerWon++;
      }
      if (contract.kind === "capot" && contract.playerId === game.viewerPlayerId) {
        capotsBidPersonally++;
        if (result.contractSucceeded) capotsBidSucceeded++;
      }
      if (contract.coinchedBy !== undefined) {
        ownContractsCoinched++;
        if (result.contractSucceeded) coinchedContractsWon++;
        if (contract.status === "coinched" && contract.playerId === game.viewerPlayerId && result.contractSucceeded && bid !== null) {
          personalCoinchedMarginSum += result.takerPoints - bid;
          personalCoinchedMarginCount++;
        }
      }
      if (contract.surcoinchedBy === game.viewerPlayerId) {
        surcoinchesDeclared++;
        if (result.contractSucceeded) surcoinchesWon++;
      }
      // A numerical bid can be compared to the canonical taker points; Capot/Générale cannot.
      if (bid !== null) {
        pointContracts++;
        pointBids.push(bid);
        bidSum += bid;
        takerPointSum += result.takerPoints;
        const byValue = bidCounts.get(bid)!;
        byValue.contracts++;
        if (result.contractSucceeded) {
          byValue.successes++;
          successfulBidCount++;
          successfulBidSum += bid;
          successfulMarginSum += result.takerPoints - bid;
        } else {
          failedBidCount++;
          failedBidSum += bid;
        }
        if (!result.contractSucceeded) {
          failedPointContracts++;
          failedGapSum += result.takerPoints - bid;
          const deficit = bid - result.takerPoints;
          if (deficit >= 20) fallCounts.Grosses++;
          else if (deficit >= 10) fallCounts.Moyennes++;
          else if (deficit >= 1) fallCounts.Serrées++;
        }
      }
      const mode = resolveContractMode(contract);
      const modeStats = mode?.kind === "suit" ? suitCounts.get(mode.suit) : mode ? specialCounts.get(mode.kind) : undefined;
      if (modeStats) {
        modeStats.contracts++;
        if (result.contractSucceeded) modeStats.successes++;
        if (bid !== null) { modeStats.bidSum += bid; modeStats.bidCount++; }
      }
    } else {
      defenseRounds++;
      defensePointSum += result.defenderPoints;
      if (typeof result.tenDeDerTeam === "number") {
        defenseTenDeDerKnown++;
        if (result.tenDeDerTeam === game.viewerTeam) defenseTenDeDerWon++;
      }
      if (!result.contractSucceeded) {
        defenseWins++;
        if (contract.kind === undefined || contract.kind === "points") {
          defeatedPointContracts++;
          defeatedGapSum += contract.value - result.takerPoints;
        }
      }
    }
  }

  const suitContractTotal = [...suitCounts.values()].reduce((sum, item) => sum + item.contracts, 0);
  const attackShare = percent(attackRounds, attackRounds + defenseRounds);
  const bidValues: ContractValueStats[] = BID_VALUES.map((value) => {
    const values = bidCounts.get(value)!;
    return { value, contracts: values.contracts, successes: values.successes, successRate: percent(values.successes, values.contracts) };
  });
  const zones: Array<{ label: ContractZoneStats["label"]; range: string; values: BidValue[] }> = [
    { label: "Prudent", range: "80–100", values: [80, 90, 100] },
    { label: "Intermédiaire", range: "110–120", values: [110, 120] },
    { label: "Agressif", range: "130–160", values: [130, 140, 150, 160] },
  ];
  const contractZones: ContractZoneStats[] = zones.map(({ label, range, values }) => {
    const contracts = values.reduce((sum, value) => sum + bidCounts.get(value)!.contracts, 0);
    const successes = values.reduce((sum, value) => sum + bidCounts.get(value)!.successes, 0);
    return { label, range, contracts, successRate: percent(successes, contracts) };
  });
  const fallTotal = fallCounts.Serrées + fallCounts.Moyennes + fallCounts.Grosses;
  const fallBands: FallBandStats[] = (["Serrées", "Moyennes", "Grosses"] as const).map((label) => ({
    label, contracts: fallCounts[label], share: percent(fallCounts[label], fallTotal),
  }));
  const recentGames = sorted.slice(0, 20);
  const recentWins = recentGames.filter((game) => game.won).length;
  const recentOutcomes = contractOutcomes(recentGames);
  const recentForm: RecentFormStats = {
    sampleSize: recentGames.length, wins: recentWins, winrate: percent(recentWins, recentGames.length),
    attackSuccessRate: percent(recentOutcomes.attackWins, recentOutcomes.attack),
    defenseSuccessRate: percent(recentOutcomes.defenseWins, recentOutcomes.defense),
    results: recentGames.map((game) => game.won).reverse(),
  };
  // Compare disjoint chronological samples only when each has 50 played-contract rounds.
  const chronologicalRounds = [...sorted].reverse().flatMap((game) =>
    [...(game.roundHistory ?? [])].sort((a, b) => a.roundNumber - b.roundNumber)
      .filter((entry): entry is RoundHistoryEntry & { result: Extract<RoundHistoryEntry["result"], { kind: "played" }> } => entry.result.kind === "played")
      .map(({ result }) => ({ result, viewerTeam: game.viewerTeam })),
  );
  const progressionSample = (sample: typeof chronologicalRounds): ProgressionSample => {
    const attacks = sample.filter(({ result, viewerTeam }) => result.contract.teamId === viewerTeam);
    const pointValues = attacks.map(({ result }) => pointBid(result)).filter((value): value is BidValue => value !== null);
    return { rounds: sample.length, attackSuccessRate: percent(attacks.filter(({ result }) => result.contractSucceeded).length, attacks.length),
      averageBid: average(pointValues.reduce((sum, value) => sum + value, 0), pointValues.length) };
  };
  const progression: ProgressionStats | null = chronologicalRounds.length >= 100
    ? { first: progressionSample(chronologicalRounds.slice(0, 50)), recent: progressionSample(chronologicalRounds.slice(-50)) }
    : null;
  return {
    total, wins, losses: total - wins, winrate: percent(wins, total), currentStreak, bestStreak,
    rounds: hasRoundData ? rounds : null, missingHistoryGames,
    capotsMade: hasRoundData ? capotsMade : null, capotsSuffered: hasRoundData ? capotsSuffered : null,
    capotsPer100Rounds: hasRoundData && rounds ? Math.round(capotsMade * 1000 / rounds) / 10 : null,
    attackRounds, defenseRounds, attackShare,
    defenseShare: attackShare === null ? null : 100 - attackShare,
    attackSuccessRate: percent(attackWins, attackRounds), personalContractShare: percent(personalContracts, attackRounds + defenseRounds),
    averageBid: average(bidSum, pointContracts), averageTakerPoints: average(takerPointSum, pointContracts),
    averageBidDifference: average(takerPointSum - bidSum, pointContracts),
    averageFailedContractGap: average(failedGapSum, failedPointContracts),
    tenDeDerRate: percent(tenDeDerWon, tenDeDerKnown), tenDeDerKnown,
    defenseTenDeDerRate: percent(defenseTenDeDerWon, defenseTenDeDerKnown),
    personalContracts: hasRoundData ? personalContracts : null, personalSuccessRate: percent(personalWins, personalContracts),
    personalAverageBid: average(personalBidSum, personalPointContracts),
    personalAverageTakerPoints: average(personalTakerPoints, personalPointContracts),
    personalAverageBidDifference: average(personalTakerPoints - personalBidSum, personalPointContracts),
    partnerContracts: hasRoundData ? partnerContracts : null, partnerSuccessRate: percent(partnerWins, partnerContracts),
    medianBid: median(pointBids), averageSuccessfulBid: average(successfulBidSum, successfulBidCount),
    averageFailedBid: average(failedBidSum, failedBidCount), averageSuccessfulMargin: average(successfulMarginSum, successfulBidCount),
    personalAtLeast120Rate: percent(personalAtLeast120, personalPointContracts),
    personalAtLeast130Rate: percent(personalAtLeast130, personalPointContracts),
    bidValues, contractZones, fallBands, fallTotal,
    defenseSuccessRate: percent(defenseWins, defenseRounds), averageDefensePoints: average(defensePointSum, defenseRounds),
    averageDefeatedContractGap: average(defeatedGapSum, defeatedPointContracts),
    capotsBidPersonally: hasRoundData ? capotsBidPersonally : null,
    capotsBidSucceeded: hasRoundData ? capotsBidSucceeded : null,
    capotBidSuccessRate: percent(capotsBidSucceeded, capotsBidPersonally),
    coinchesDeclared: hasRoundData ? coinchesDeclared : null, coincheSuccessRate: percent(coinchesWon, coinchesDeclared),
    ownContractsCoinched: hasRoundData ? ownContractsCoinched : null,
    coinchedContractSuccessRate: percent(coinchedContractsWon, ownContractsCoinched),
    winningCoincheAverageGap: average(winningCoincheGapSum, winningCoincheGapCount),
    personalCoinchedSuccessMargin: average(personalCoinchedMarginSum, personalCoinchedMarginCount),
    surcoinchesDeclared: hasRoundData ? surcoinchesDeclared : null,
    surcoincheSuccessRate: percent(surcoinchesWon, surcoinchesDeclared),
    suits: SUITS.map((suit) => {
      const values = suitCounts.get(suit)!;
      return { suit, contracts: values.contracts, share: percent(values.contracts, suitContractTotal),
        successRate: percent(values.successes, values.contracts), averageBid: average(values.bidSum, values.bidCount) };
    }),
    specialModes: (["no-trump", "all-trump"] as const).flatMap((mode) => {
      const values = specialCounts.get(mode)!;
      return values.contracts ? [{ mode, contracts: values.contracts, successRate: percent(values.successes, values.contracts),
        averageBid: average(values.bidSum, values.bidCount) }] : [];
    }),
    recentForm, progression,
  };
}
