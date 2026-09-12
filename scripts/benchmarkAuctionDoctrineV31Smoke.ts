import type { TeamId } from "@/engine/types";
import { findBotStrategy, type BotStrategyDefinition } from "@/simulation/botRegistry";
import {
  CANONICAL_TARGET_SCORE,
  playTournamentGame,
  summarizeTournamentGames,
  type BotTournamentStats,
  type TournamentGame,
} from "@/simulation/tournament";

const rawGames = process.argv.find((argument) => argument.startsWith("--games="))?.slice(8);
const games = Number(rawGames ?? 100);
if (!Number.isInteger(games) || games < 2 || games > 100 || games % 2 !== 0) {
  throw new Error("Le smoke V3.1 exige un nombre pair de parties compris entre 2 et 100.");
}

const candidate = findBotStrategy("human_doctrine_v3_1_conversation_mc_v1");
const opponent = findBotStrategy("human_doctrine_v3_conversation_mc_v1");
const tournamentGames: TournamentGame[] = [];
const seedBase = 20310101;
const startedAt = performance.now();

for (let pair = 0; pair < games / 2; pair += 1) {
  const seed = seedBase + pair;
  for (const teamStrategies of [
    { 0: candidate, 1: opponent },
    { 0: opponent, 1: candidate },
  ] as Array<Record<TeamId, BotStrategyDefinition>>) {
    tournamentGames.push(playTournamentGame({ seed, teamStrategies, targetScore: CANONICAL_TARGET_SCORE }));
  }
  if ((pair + 1) % 5 === 0) console.error(`Smoke V3.1: ${(pair + 1) * 2}/${games} parties.`);
}

function metrics(stats: BotTournamentStats) {
  return {
    games: stats.games,
    wins: stats.wins,
    losses: stats.losses,
    winRate: stats.winRate,
    averageScore: stats.averageScore,
    averageDifferential: stats.averageDifferential,
    contractsTaken: stats.contractsTaken,
    contractsSucceeded: stats.contractsSucceeded,
    attackSuccessRate: stats.contractsTaken ? stats.contractsSucceeded / stats.contractsTaken : 0,
    averageCpuMsPerGame: stats.averageCpuMsPerGame,
  };
}

const stats = summarizeTournamentGames([candidate, opponent], tournamentGames);
const candidateStats = stats.find((entry) => entry.id === candidate.id)!;
const opponentStats = stats.find((entry) => entry.id === opponent.id)!;
console.log(JSON.stringify({
  experiment: "V3.1 vs V3 smoke regression only",
  settings: {
    games,
    pairedSeeds: true,
    invertedSides: true,
    seedBase,
    cardEngine: "monte-carlo-v1",
  },
  elapsedMs: performance.now() - startedAt,
  candidate: metrics(candidateStats),
  opponent: metrics(opponentStats),
}, null, 2));
