import {
  ALL_BOT_STRATEGIES,
  createHybridStrategy,
  findBotStrategy,
  type BotBiddingStrategyId,
  type BotCardStrategyId,
  type BotStrategyDefinition,
} from "@/simulation/botRegistry";
import { runPairedMatchup, summarizeTournamentGames, type HeadToHeadResult } from "@/simulation/tournament";

const read = (name: string) => process.argv.find((argument) => argument.startsWith(`--${name}=`))?.slice(name.length + 3);
const seed = Number(read("seed") ?? 20262709);
const games = Number(read("games") ?? 200);

function parseStrategy(id: string): BotStrategyDefinition {
  if (!id.startsWith("hybrid_")) return findBotStrategy(id);
  const match = /^hybrid_(.+)__(.+)$/.exec(id);
  if (!match) throw new Error(`Identifiant hybride invalide: ${id}`);
  return createHybridStrategy(match[1] as BotBiddingStrategyId, match[2] as BotCardStrategyId, { id });
}

function playMatchups(matchups: Array<[BotStrategyDefinition, BotStrategyDefinition]>) {
  const allGames = [];
  const headToHead: HeadToHeadResult[] = [];
  for (const [index, [first, second]] of matchups.entries()) {
    const matchupGames = runPairedMatchup(first, second, games, seed + index * 10_000);
    const firstWins = matchupGames.filter((game) => game.teamStrategies[game.winnerTeam] === first.id).length;
    headToHead.push({ first: first.id, second: second.id, games, firstWins, secondWins: games - firstWins, firstWinRate: firstWins / games });
    allGames.push(...matchupGames);
    console.error(`[${index + 1}/${matchups.length}] ${first.id} ${firstWins}-${games - firstWins} ${second.id}`);
  }
  const strategies = [...new Map(matchups.flat().map((strategy) => [strategy.id, strategy])).values()];
  return {
    seed,
    gamesPerMatchup: games,
    totalGames: allGames.length,
    ranking: summarizeTournamentGames(strategies, allGames),
    headToHead,
  };
}

const champion = read("champion");
if (champion) {
  const strategy = parseStrategy(champion);
  const requestedOpponents = read("opponents")?.split(",").filter(Boolean).map(parseStrategy);
  const opponents = requestedOpponents ?? ALL_BOT_STRATEGIES;
  console.log(JSON.stringify(playMatchups(
    opponents.filter((opponent) => opponent.id !== strategy.id).map((opponent) => [strategy, opponent]),
  ), null, 2));
} else {
  const ids = read("finalists")?.split(",").filter(Boolean) ?? [];
  if (ids.length !== 3) throw new Error("La finale exige exactement trois --finalists.");
  const finalists = ids.map(parseStrategy);
  const references = [
    findBotStrategy("main_montecarlo"),
    findBotStrategy("main_montecarlo_v2"),
    findBotStrategy("legacy_heuristic_v0"),
  ];
  const matchups: Array<[BotStrategyDefinition, BotStrategyDefinition]> = finalists.flatMap((finalist) =>
    references.map((reference) => [finalist, reference] as [BotStrategyDefinition, BotStrategyDefinition]),
  );
  for (let first = 0; first < finalists.length; first += 1) {
    for (let second = first + 1; second < finalists.length; second += 1) {
      matchups.push([finalists[first], finalists[second]]);
    }
  }
  console.log(JSON.stringify(playMatchups(matchups), null, 2));
}
