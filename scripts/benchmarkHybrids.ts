import {
  BIDDING_ENGINE_IDS,
  CARD_ENGINE_IDS,
  createHybridStrategy,
  findBotStrategy,
  type BotBiddingStrategyId,
  type BotCardStrategyId,
} from "@/simulation/botRegistry";
import {
  formatTournament,
  runPairedMatchup,
  runRoundRobin,
  summarizeTournamentGames,
} from "@/simulation/tournament";

const read = (name: string) => process.argv.find((argument) => argument.startsWith(`--${name}=`))?.slice(name.length + 3);
const seed = Number(read("seed") ?? 20262409);

function parseStrategy(id: string) {
  if (!id.startsWith("hybrid_")) return findBotStrategy(id);
  const match = /^hybrid_(.+)__(.+)$/.exec(id);
  if (!match) throw new Error(`Identifiant hybride invalide: ${id}`);
  return createHybridStrategy(match[1] as BotBiddingStrategyId, match[2] as BotCardStrategyId, { id });
}

const requested = read("hybrids")?.split(",").filter(Boolean);
if (requested?.length) {
  const hybrids = requested.map(parseStrategy);
  const games = process.argv.includes("--final") ? 200 : 100;
  console.log(formatTournament(runRoundRobin(hybrids, games, seed, (done, total, result) => {
    console.error(`[${done}/${total}] ${result.first} ${result.firstWins}-${result.secondWins} ${result.second}`);
  })));
} else {
  const panel = [
    findBotStrategy("main_montecarlo"),
    findBotStrategy("main_montecarlo_v2"),
    findBotStrategy("legacy_heuristic_v0"),
    findBotStrategy("main_montecarlo_v3"),
  ];
  const gamesPerOpponent = 20;
  const targetScore = 1000;
  const requestedBidding = read("bidding") as BotBiddingStrategyId | undefined;
  const biddingIds = requestedBidding ? [requestedBidding] : BIDDING_ENGINE_IDS;
  const combinations = biddingIds.flatMap((bidding) =>
    CARD_ENGINE_IDS.map((card) => createHybridStrategy(bidding, card, { id: `hybrid_${bidding}__${card}` })),
  );
  const started = performance.now();
  const rows = combinations.map((hybrid, hybridIndex) => {
    const games = panel.flatMap((opponent, opponentIndex) => runPairedMatchup(
      hybrid,
      opponent,
      gamesPerOpponent,
      seed + opponentIndex * 10_000,
      targetScore,
    ));
    const stats = summarizeTournamentGames([hybrid, ...panel], games).find((item) => item.id === hybrid.id)!;
    console.error(`[${hybridIndex + 1}/${combinations.length}] ${hybrid.id}: ${stats.wins}/${stats.games}`);
    return stats;
  }).sort((a, b) => b.winRate - a.winRate || b.averageDifferential - a.averageDifferential);
  console.log(JSON.stringify({
    mode: "FFB_1000",
    seed,
    gamesPerOpponent,
    opponents: panel.map((item) => item.id),
    combinations: rows.length,
    totalGames: rows.length * panel.length * gamesPerOpponent,
    elapsedMs: performance.now() - started,
    ranking: rows,
  }, null, 2));
}
