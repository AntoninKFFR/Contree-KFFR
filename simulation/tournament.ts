import { canCoinche, canSurcoinche } from "@/engine/bidding";
import { createInitialGame, getCurrentContract, makeBid, playCard, startNextRound } from "@/engine/game";
import { createSeededRandom } from "@/engine/random";
import { playerTeam } from "@/engine/rules";
import type { Bid, GameState, PlayerId, RoundResult, TeamId } from "@/engine/types";
import { chooseStrategyBid, chooseStrategyCardWithTrace, type BotStrategyDefinition, type StrategyBid } from "@/simulation/botRegistry";
import type { BotDecisionTraceV3 } from "@/bots/strategy/monteCarloV3CardStrategy";

type DecisionTiming = { strategyId: string; kind: "bid" | "card"; elapsedMs: number };
type TournamentRound = { result: RoundResult; bids: Bid[]; tricksWon: Record<TeamId, number> };
export type TournamentGame = {
  seed: number;
  winnerTeam: TeamId;
  totalScore: Record<TeamId, number>;
  teamStrategies: Record<TeamId, string>;
  rounds: TournamentRound[];
  timings: DecisionTiming[];
};

export type BotTournamentStats = {
  id: string;
  label: string;
  games: number;
  wins: number;
  losses: number;
  winRate: number;
  averageScore: number;
  averageDifferential: number;
  rounds: number;
  contractsTaken: number;
  contractsSucceeded: number;
  contractsFailed: number;
  averageContract: number;
  passes: number;
  bids: number;
  coinches: number;
  surcoinches: number;
  averageTricksPerRound: number;
  averageRoundPoints: number;
  averageAttackScore: number;
  averageDefenseScore: number;
  averageBidMs: number;
  p95BidMs: number;
  averageCardMs: number;
  p95CardMs: number;
  p99CardMs: number;
  elo: number;
};

export type HeadToHeadResult = {
  first: string;
  second: string;
  games: number;
  firstWins: number;
  secondWins: number;
  firstWinRate: number;
};

export type TournamentResult = {
  seed: number;
  gamesPerMatchup: number;
  totalGames: number;
  elapsedMs: number;
  ranking: BotTournamentStats[];
  headToHead: HeadToHeadResult[];
};

function normalizeBid(state: GameState, decision: StrategyBid): StrategyBid {
  const contract = getCurrentContract(state);
  if (decision.action === "coinche") return contract && canCoinche(state.currentPlayerId, contract) ? decision : { action: "pass" };
  if (decision.action === "surcoinche") return contract && canSurcoinche(state.currentPlayerId, contract) ? decision : { action: "pass" };
  if (decision.action !== "bid" || !decision.value || !decision.trump) return { action: "pass" };
  if (contract && (contract.status !== "normal" || decision.value <= contract.value)) return { action: "pass" };
  return decision;
}

function applyBid(state: GameState, decision: StrategyBid): GameState {
  const normalized = normalizeBid(state, decision);
  if (normalized.action === "bid" && normalized.value && normalized.trump) {
    return makeBid(state, state.currentPlayerId, { action: "bid", value: normalized.value, trump: normalized.trump });
  }
  if (normalized.action === "coinche") return makeBid(state, state.currentPlayerId, { action: "coinche" });
  if (normalized.action === "surcoinche") return makeBid(state, state.currentPlayerId, { action: "surcoinche" });
  return makeBid(state, state.currentPlayerId, { action: "pass" });
}

function tricksWon(state: GameState): Record<TeamId, number> {
  return state.completedTricks.reduce((counts, trick) => {
    counts[playerTeam(trick.winnerId)] += 1;
    return counts;
  }, { 0: 0, 1: 0 } as Record<TeamId, number>);
}

export function playTournamentGame({
  seed,
  teamStrategies,
  targetScore = 300,
  onCardDecision,
  seatStrategies,
}: {
  seed: number;
  teamStrategies: Record<TeamId, BotStrategyDefinition>;
  targetScore?: number;
  onCardDecision?: (state: GameState, strategy: BotStrategyDefinition, card: ReturnType<typeof chooseStrategyCardWithTrace>["card"], elapsedMs: number, trace?: BotDecisionTraceV3) => void;
  seatStrategies?: Partial<Record<PlayerId, BotStrategyDefinition>>;
}): TournamentGame {
  const random = createSeededRandom(seed);
  let state = createInitialGame(random, { targetScore });
  const rounds: TournamentRound[] = [];
  const timings: DecisionTiming[] = [];
  while (state.phase !== "game-over" && rounds.length < 80) {
    while (state.phase === "bidding" || state.phase === "playing") {
      const strategy = seatStrategies?.[state.currentPlayerId] ?? teamStrategies[playerTeam(state.currentPlayerId)];
      const kind = state.phase === "bidding" ? "bid" : "card";
      const started = performance.now();
      if (kind === "bid") {
        state = applyBid(state, chooseStrategyBid(state, strategy));
      } else {
        const before = state;
        const decision = chooseStrategyCardWithTrace(state, strategy);
        state = playCard(state, state.currentPlayerId, decision.card);
        onCardDecision?.(before, strategy, decision.card, performance.now() - started, decision.trace);
      }
      timings.push({ strategyId: strategy.id, kind, elapsedMs: performance.now() - started });
    }
    if (state.result) rounds.push({ result: state.result, bids: state.bids, tricksWon: tricksWon(state) });
    if (state.phase === "finished") state = startNextRound(state, random);
  }
  return {
    seed,
    winnerTeam: state.winnerTeam ?? (state.totalScore[0] >= state.totalScore[1] ? 0 : 1),
    totalScore: state.totalScore,
    teamStrategies: { 0: teamStrategies[0].id, 1: teamStrategies[1].id },
    rounds,
    timings,
  };
}

export function runPairedMatchup(
  first: BotStrategyDefinition,
  second: BotStrategyDefinition,
  games: number,
  seed: number,
): TournamentGame[] {
  if (games < 2 || games % 2 !== 0) throw new Error("Un benchmark paired exige un nombre pair de parties >= 2.");
  const results: TournamentGame[] = [];
  for (let pair = 0; pair < games / 2; pair += 1) {
    const dealSeed = seed + pair;
    results.push(playTournamentGame({ seed: dealSeed, teamStrategies: { 0: first, 1: second } }));
    results.push(playTournamentGame({ seed: dealSeed, teamStrategies: { 0: second, 1: first } }));
  }
  return results;
}

type MutableStats = Omit<BotTournamentStats, "winRate" | "averageScore" | "averageDifferential" | "averageContract" | "averageTricksPerRound" | "averageRoundPoints" | "averageAttackScore" | "averageDefenseScore" | "averageBidMs" | "p95BidMs" | "averageCardMs" | "p95CardMs" | "p99CardMs" | "elo"> & {
  totalScore: number; totalDifferential: number; totalContract: number; totalTricks: number;
  totalRoundPoints: number; attackScore: number; attackRounds: number; defenseScore: number; defenseRounds: number;
  bidTimes: number[]; cardTimes: number[];
};

function initialStats(strategy: BotStrategyDefinition): MutableStats {
  return { id: strategy.id, label: strategy.label, games: 0, wins: 0, losses: 0, rounds: 0, contractsTaken: 0, contractsSucceeded: 0, contractsFailed: 0, passes: 0, bids: 0, coinches: 0, surcoinches: 0, totalScore: 0, totalDifferential: 0, totalContract: 0, totalTricks: 0, totalRoundPoints: 0, attackScore: 0, attackRounds: 0, defenseScore: 0, defenseRounds: 0, bidTimes: [], cardTimes: [] };
}

function percentile(values: number[], fraction: number): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * fraction))];
}

function mean(total: number, count: number): number { return count ? total / count : 0; }

function aggregate(strategies: BotStrategyDefinition[], games: TournamentGame[]): BotTournamentStats[] {
  const stats = Object.fromEntries(strategies.map((strategy) => [strategy.id, initialStats(strategy)])) as Record<string, MutableStats>;
  for (const game of games) {
    for (const team of [0, 1] as TeamId[]) {
      const id = game.teamStrategies[team];
      const item = stats[id];
      const opponent = team === 0 ? 1 : 0;
      item.games += 1;
      item.totalScore += game.totalScore[team];
      item.totalDifferential += game.totalScore[team] - game.totalScore[opponent];
      if (game.winnerTeam === team) item.wins += 1; else item.losses += 1;
      for (const round of game.rounds) {
        item.rounds += 1;
        item.totalTricks += round.tricksWon[team];
        item.totalRoundPoints += round.result.roundScore[team];
        for (const bid of round.bids) {
          if (playerTeam(bid.playerId) !== team) continue;
          if (bid.action === "pass") item.passes += 1;
          if (bid.action === "bid") item.bids += 1;
          if (bid.action === "coinche") item.coinches += 1;
          if (bid.action === "surcoinche") item.surcoinches += 1;
        }
        if (round.result.kind === "played") {
          if (round.result.contract.teamId === team) {
            item.attackRounds += 1;
            item.attackScore += round.result.roundScore[team];
            item.contractsTaken += 1;
            item.totalContract += round.result.contract.value;
            if (round.result.contractSucceeded) item.contractsSucceeded += 1; else item.contractsFailed += 1;
          } else {
            item.defenseRounds += 1;
            item.defenseScore += round.result.roundScore[team];
          }
        }
      }
    }
    for (const timing of game.timings) {
      (timing.kind === "bid" ? stats[timing.strategyId].bidTimes : stats[timing.strategyId].cardTimes).push(timing.elapsedMs);
    }
  }
  return Object.values(stats).map((item) => {
    const winRate = mean(item.wins, item.games);
    return {
      id: item.id, label: item.label, games: item.games, wins: item.wins, losses: item.losses,
      winRate, averageScore: mean(item.totalScore, item.games), averageDifferential: mean(item.totalDifferential, item.games),
      rounds: item.rounds, contractsTaken: item.contractsTaken, contractsSucceeded: item.contractsSucceeded,
      contractsFailed: item.contractsFailed, averageContract: mean(item.totalContract, item.contractsTaken),
      passes: item.passes, bids: item.bids, coinches: item.coinches, surcoinches: item.surcoinches,
      averageTricksPerRound: mean(item.totalTricks, item.rounds), averageRoundPoints: mean(item.totalRoundPoints, item.rounds),
      averageAttackScore: mean(item.attackScore, item.attackRounds), averageDefenseScore: mean(item.defenseScore, item.defenseRounds),
      averageBidMs: mean(item.bidTimes.reduce((sum, value) => sum + value, 0), item.bidTimes.length), p95BidMs: percentile(item.bidTimes, 0.95),
      averageCardMs: mean(item.cardTimes.reduce((sum, value) => sum + value, 0), item.cardTimes.length), p95CardMs: percentile(item.cardTimes, 0.95), p99CardMs: percentile(item.cardTimes, 0.99),
      elo: 1500 + 400 * Math.log10((item.wins + 0.5) / (item.losses + 0.5)),
    };
  }).sort((a, b) => b.winRate - a.winRate || b.averageDifferential - a.averageDifferential);
}

export function runRoundRobin(
  strategies: BotStrategyDefinition[],
  gamesPerMatchup: number,
  seed: number,
  onMatchup?: (completed: number, total: number, result: HeadToHeadResult) => void,
): TournamentResult {
  const started = performance.now();
  const games: TournamentGame[] = [];
  const headToHead: HeadToHeadResult[] = [];
  let matchup = 0;
  const totalMatchups = strategies.length * (strategies.length - 1) / 2;
  for (let firstIndex = 0; firstIndex < strategies.length; firstIndex += 1) {
    for (let secondIndex = firstIndex + 1; secondIndex < strategies.length; secondIndex += 1) {
      const first = strategies[firstIndex];
      const second = strategies[secondIndex];
      const matchupGames = runPairedMatchup(first, second, gamesPerMatchup, seed + matchup * 10_000);
      games.push(...matchupGames);
      const firstWins = matchupGames.filter((game) => game.teamStrategies[game.winnerTeam] === first.id).length;
      const result = { first: first.id, second: second.id, games: matchupGames.length, firstWins, secondWins: matchupGames.length - firstWins, firstWinRate: firstWins / matchupGames.length };
      headToHead.push(result);
      matchup += 1;
      onMatchup?.(matchup, totalMatchups, result);
    }
  }
  return { seed, gamesPerMatchup, totalGames: games.length, elapsedMs: performance.now() - started, ranking: aggregate(strategies, games), headToHead };
}

function percent(value: number): string { return `${(value * 100).toFixed(1)}%`; }
function number(value: number): string { return value.toFixed(1); }

export function formatTournament(result: TournamentResult): string {
  const lines = [
    "RANK | BOT | GAMES | WIN% | ELO | SCORE AVG | DIFF AVG | CONTRACT SUCCESS | CARD MS | P95",
    "---: | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---:",
    ...result.ranking.map((bot, index) => `${index + 1} | ${bot.id} | ${bot.games} | ${percent(bot.winRate)} | ${number(bot.elo)} | ${number(bot.averageScore)} | ${number(bot.averageDifferential)} | ${bot.contractsSucceeded}/${bot.contractsTaken} | ${number(bot.averageCardMs)} | ${number(bot.p95CardMs)}`),
    "",
    `Total games: ${result.totalGames} | seed: ${result.seed} | elapsed: ${number(result.elapsedMs / 1000)}s`,
    "",
    "HEAD-TO-HEAD (row winrate vs column)",
  ];
  const ids = result.ranking.map((bot) => bot.id);
  lines.push(["BOT", ...ids].join(" | "));
  for (const row of ids) {
    lines.push([row, ...ids.map((column) => {
      if (row === column) return "-";
      const match = result.headToHead.find((item) => item.first === row && item.second === column || item.first === column && item.second === row);
      if (!match) return "n/a";
      return percent(match.first === row ? match.firstWinRate : 1 - match.firstWinRate);
    })].join(" | "));
  }
  return lines.join("\n");
}
