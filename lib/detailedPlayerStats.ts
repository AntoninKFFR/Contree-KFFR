import { SOLO_SEAT_ASSIGNMENTS, firstHumanSeat } from "@/engine/seats";
import type { PlayerId, RoundHistoryEntry, Suit, TeamId } from "@/engine/types";
import type { GameRow } from "@/lib/stats";
import type { MultiplayerHistoryGame } from "@/lib/multiplayerHistory";

export type PlayerStatsGame = {
  won: boolean;
  finishedAt: string | null;
  viewerPlayerId: PlayerId;
  viewerTeam: TeamId;
  roundHistory?: RoundHistoryEntry[];
};

export type SuitStats = { suit: Suit; contracts: number; share: number | null; successRate: number | null };

export type DetailedPlayerStats = {
  total: number; wins: number; losses: number; winrate: number | null;
  currentStreak: number; bestStreak: number; rounds: number | null; missingHistoryGames: number;
  capotsMade: number | null; capotsSuffered: number | null;
  attackRounds: number; defenseRounds: number; attackShare: number | null; defenseShare: number | null;
  attackSuccessRate: number | null; personalContractShare: number | null;
  averageBid: number | null; averageTakerPoints: number | null; averageBidDifference: number | null;
  averageFailedContractGap: number | null; tenDeDerRate: number | null; tenDeDerKnown: number;
  defenseSuccessRate: number | null; averageDefensePoints: number | null;
  averageDefeatedContractGap: number | null;
  capotsBidPersonally: number | null; capotsBidSucceeded: number | null; capotBidSuccessRate: number | null;
  coinchesDeclared: number | null; coincheSuccessRate: number | null;
  ownContractsCoinched: number | null; coinchedContractSuccessRate: number | null;
  surcoinchesDeclared: number | null; surcoincheSuccessRate: number | null;
  suits: SuitStats[];
};

const SUITS: Suit[] = ["hearts", "spades", "diamonds", "clubs"];
const percent = (part: number, whole: number): number | null => whole ? Math.round(part * 100 / whole) : null;
const average = (sum: number, count: number): number | null => count ? Math.round(sum / count) : null;
const otherTeam = (team: TeamId): TeamId => team === 0 ? 1 : 0;

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
  let personalContracts = 0, capotsMade = 0, capotsSuffered = 0;
  let bidSum = 0, takerPointSum = 0, pointContracts = 0;
  let failedGapSum = 0, failedPointContracts = 0, defensePointSum = 0;
  let defeatedGapSum = 0, defeatedPointContracts = 0;
  let tenDeDerWon = 0, tenDeDerKnown = 0;
  let capotsBidPersonally = 0, capotsBidSucceeded = 0;
  let coinchesDeclared = 0, coinchesWon = 0, ownContractsCoinched = 0, coinchedContractsWon = 0;
  let surcoinchesDeclared = 0, surcoinchesWon = 0;
  const suitCounts = new Map<Suit, { contracts: number; successes: number }>(SUITS.map((suit) => [suit, { contracts: 0, successes: 0 }]));

  for (const game of games) for (const entry of game.roundHistory ?? []) {
    rounds++;
    const result = entry.result;
    if (result.kind !== "played") continue;
    const { contract } = result;
    const attack = contract.teamId === game.viewerTeam;
    if (result.capotTeam === game.viewerTeam) capotsMade++;
    else if (result.capotTeam === otherTeam(game.viewerTeam)) capotsSuffered++;
    if (contract.playerId === game.viewerPlayerId) personalContracts++;
    if (contract.coinchedBy === game.viewerPlayerId && !attack) {
      coinchesDeclared++;
      if (!result.contractSucceeded) coinchesWon++;
    }
    if (attack) {
      attackRounds++;
      if (result.contractSucceeded) attackWins++;
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
      }
      if (contract.surcoinchedBy === game.viewerPlayerId) {
        surcoinchesDeclared++;
        if (result.contractSucceeded) surcoinchesWon++;
      }
      // A numerical bid can be compared to the canonical taker points; Capot/Générale cannot.
      if (contract.kind === undefined || contract.kind === "points") {
        pointContracts++;
        bidSum += contract.value;
        takerPointSum += result.takerPoints;
        if (!result.contractSucceeded) {
          failedPointContracts++;
          failedGapSum += result.takerPoints - contract.value;
        }
      }
      const suit = contract.contractMode?.kind === "suit" ? contract.contractMode.suit
        : contract.contractMode ? null : contract.trump ?? null;
      if (suit) {
        const values = suitCounts.get(suit)!;
        values.contracts++;
        if (result.contractSucceeded) values.successes++;
      }
    } else {
      defenseRounds++;
      defensePointSum += result.defenderPoints;
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
  return {
    total, wins, losses: total - wins, winrate: percent(wins, total), currentStreak, bestStreak,
    rounds: hasRoundData ? rounds : null, missingHistoryGames,
    capotsMade: hasRoundData ? capotsMade : null, capotsSuffered: hasRoundData ? capotsSuffered : null,
    attackRounds, defenseRounds, attackShare,
    defenseShare: attackShare === null ? null : 100 - attackShare,
    attackSuccessRate: percent(attackWins, attackRounds), personalContractShare: percent(personalContracts, attackRounds + defenseRounds),
    averageBid: average(bidSum, pointContracts), averageTakerPoints: average(takerPointSum, pointContracts),
    averageBidDifference: average(takerPointSum - bidSum, pointContracts),
    averageFailedContractGap: average(failedGapSum, failedPointContracts),
    tenDeDerRate: percent(tenDeDerWon, tenDeDerKnown), tenDeDerKnown,
    defenseSuccessRate: percent(defenseWins, defenseRounds), averageDefensePoints: average(defensePointSum, defenseRounds),
    averageDefeatedContractGap: average(defeatedGapSum, defeatedPointContracts),
    capotsBidPersonally: hasRoundData ? capotsBidPersonally : null,
    capotsBidSucceeded: hasRoundData ? capotsBidSucceeded : null,
    capotBidSuccessRate: percent(capotsBidSucceeded, capotsBidPersonally),
    coinchesDeclared: hasRoundData ? coinchesDeclared : null, coincheSuccessRate: percent(coinchesWon, coinchesDeclared),
    ownContractsCoinched: hasRoundData ? ownContractsCoinched : null,
    coinchedContractSuccessRate: percent(coinchedContractsWon, ownContractsCoinched),
    surcoinchesDeclared: hasRoundData ? surcoinchesDeclared : null,
    surcoincheSuccessRate: percent(surcoinchesWon, surcoinchesDeclared),
    suits: SUITS.map((suit) => {
      const values = suitCounts.get(suit)!;
      return { suit, contracts: values.contracts, share: percent(values.contracts, suitContractTotal), successRate: percent(values.successes, values.contracts) };
    }),
  };
}
