import { createHybridStrategy, findBotStrategy } from "@/simulation/botRegistry";
import { runPairedMatchup, summarizeTournamentGames } from "@/simulation/tournament";

const read = (name: string) => process.argv.find((argument) => argument.startsWith(`--${name}=`))?.slice(name.length + 3);
const gamesPerSeed = Number(read("games") ?? 40);
const seeds = (read("seeds") ?? "20260909,20261909,20262909").split(",").map(Number);

const official = findBotStrategy("hybrid_legacy_v1");
const legacyReference = createHybridStrategy("legacy", "monte_carlo_v1", {
  id: "legacy_mc_v1_reference",
  label: "Legacy bidding + MC V1 (control)",
  status: "diagnostic",
});
const doctrine = createHybridStrategy("human_doctrine_v1", "monte_carlo_v1", {
  id: "human_doctrine_v1_mc_v1",
  label: "Human doctrine V1 bidding + MC V1",
  status: "experimental",
});

const matchups = [
  [doctrine, official] as const,
  [doctrine, legacyReference] as const,
  [official, legacyReference] as const,
];
const batches = matchups.flatMap(([first, second], matchupIndex) =>
  seeds.map((seed) => ({
    first,
    second,
    seed,
    games: runPairedMatchup(first, second, gamesPerSeed, seed + matchupIndex * 100_000),
  })),
);
const allGames = batches.flatMap((batch) => batch.games);
const ranking = summarizeTournamentGames([official, legacyReference, doctrine], allGames);

const metrics = ranking.map((bot) => {
  const bidActions = bot.passes + bot.bids + bot.coinches + bot.surcoinches;
  const bids80 = bot.bidLevels[80] ?? 0;
  const bids90 = bot.bidLevels[90] ?? 0;
  const bids100Plus = bot.bids - bids80 - bids90;
  return {
    id: bot.id,
    games: bot.games,
    winRate: bot.winRate,
    averageScore: bot.averageScore,
    averageDifferential: bot.averageDifferential,
    averageContract: bot.averageContract,
    contractSuccessRate: bot.contractsTaken ? bot.contractsSucceeded / bot.contractsTaken : 0,
    passRate: bidActions ? bot.passes / bidActions : 0,
    bidFrequency: { 80: bids80, 90: bids90, "100+": bids100Plus },
    bidFrequencyRate: {
      80: bot.bids ? bids80 / bot.bids : 0,
      90: bot.bids ? bids90 / bot.bids : 0,
      "100+": bot.bids ? bids100Plus / bot.bids : 0,
    },
    averageBidMs: bot.averageBidMs,
    averageCardMs: bot.averageCardMs,
  };
});

const headToHead = matchups.map(([first, second]) => {
  const games = batches.filter((batch) => batch.first.id === first.id && batch.second.id === second.id).flatMap((batch) => batch.games);
  const firstWins = games.filter((game) => game.teamStrategies[game.winnerTeam] === first.id).length;
  return { first: first.id, second: second.id, games: games.length, firstWins, firstWinRate: firstWins / games.length };
});

const perSeed = batches.map((batch) => {
  const firstWins = batch.games.filter((game) => game.teamStrategies[game.winnerTeam] === batch.first.id).length;
  return {
    seed: batch.seed,
    first: batch.first.id,
    second: batch.second.id,
    games: batch.games.length,
    firstWinRate: firstWins / batch.games.length,
  };
});

console.log(JSON.stringify({
  experiment: "human_doctrine_v1 bidding ablation",
  seeds,
  gamesPerSeed,
  totalGames: allGames.length,
  invariant: "All three strategies use Monte Carlo V1 card play; only bidding differs.",
  metrics,
  headToHead,
  perSeed,
  promotionRule: "NO unless human_doctrine_v1 has a clear, statistically convincing advantage over the official bot.",
}, null, 2));
