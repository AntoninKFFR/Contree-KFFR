import { readFileSync } from "node:fs";
import { FFB_RECALIBRATION_STRATEGIES } from "@/simulation/ffbRecalibration";
import {
  CANONICAL_SCORING_MODE,
  CANONICAL_TARGET_SCORE,
  summarizeTournamentGames,
  type HeadToHeadResult,
  type TournamentGame,
} from "@/simulation/tournament";

type ShardResult = {
  phase: "screening" | "final" | "head-to-head";
  shard: string | null;
  seedShard: string | null;
  seeds: number[];
  gamesPerSeed: number;
  elapsedMs: number;
  strategies: Array<{ id: string; label: string }>;
  rawGames: TournamentGame[];
};

function read(name: string): string | undefined {
  const prefix = `--${name}=`;
  return process.argv.find((argument) => argument.startsWith(prefix))?.slice(prefix.length);
}

const paths = read("inputs")?.split(",").filter(Boolean) ?? [];
if (paths.length < 1) throw new Error("--inputs doit lister les fichiers JSON des shards.");
const shards = paths.map((path) => JSON.parse(readFileSync(path, "utf8")) as ShardResult);
const games = shards.flatMap((shard) => shard.rawGames);
const seeds = [...new Set(shards.flatMap((shard) => shard.seeds))];
const shardKeys = shards.map((shard) => `${shard.shard ?? "all"}:${shard.seedShard ?? "all"}`);
if (new Set(shardKeys).size !== paths.length) throw new Error("Un shard est dupliqué.");
if (games.some((game) => game.scoringMode !== CANONICAL_SCORING_MODE || game.targetScore !== CANONICAL_TARGET_SCORE)) {
  throw new Error("Un shard contient une partie non canonique.");
}

const strategyIds = shards[0].strategies.map((strategy) => strategy.id);
const strategies = strategyIds.map((id) => {
  const strategy = FFB_RECALIBRATION_STRATEGIES.find((candidate) => candidate.id === id);
  if (!strategy) throw new Error(`Stratégie inconnue dans le merge: ${id}`);
  return strategy;
});
if (shards.some((shard) => shard.strategies.map((strategy) => strategy.id).join(",") !== strategyIds.join(","))) {
  throw new Error("Les shards ne décrivent pas les mêmes stratégies.");
}
if (shards.some((shard) => shard.phase !== shards[0].phase || shard.gamesPerSeed !== shards[0].gamesPerSeed)) {
  throw new Error("Les shards ne décrivent pas la même phase ou le même volume.");
}

function allHeadToHead(selectedGames: TournamentGame[]): HeadToHeadResult[] {
  const results: HeadToHeadResult[] = [];
  for (let firstIndex = 0; firstIndex < strategies.length; firstIndex += 1) {
    for (let secondIndex = firstIndex + 1; secondIndex < strategies.length; secondIndex += 1) {
      const first = strategies[firstIndex];
      const second = strategies[secondIndex];
      const relevant = selectedGames.filter((game) => {
        const ids = Object.values(game.teamStrategies);
        return ids.includes(first.id) && ids.includes(second.id);
      });
      const firstWins = relevant.filter((game) => game.teamStrategies[game.winnerTeam] === first.id).length;
      results.push({
        first: first.id,
        second: second.id,
        games: relevant.length,
        firstWins,
        secondWins: relevant.length - firstWins,
        firstWinRate: firstWins / relevant.length,
      });
    }
  }
  return results;
}

const gamesPerMatchup = shards[0].gamesPerSeed * seeds.length;
const headToHead = allHeadToHead(games);
if (headToHead.some((matchup) => matchup.games !== gamesPerMatchup)) {
  throw new Error("Le merge ne contient pas le volume attendu pour chaque matchup.");
}
const finalMatchup = strategies.length === 2 ? headToHead[0] : null;
const finalRate = finalMatchup ? finalMatchup.firstWinRate : 0;
const finalMargin = finalMatchup ? 1.96 * Math.sqrt(finalRate * (1 - finalRate) / finalMatchup.games) : 0;

console.log(JSON.stringify({
  phase: shards[0].phase,
  scoringMode: CANONICAL_SCORING_MODE,
  targetScore: CANONICAL_TARGET_SCORE,
  seeds,
  gamesPerSeed: shards[0].gamesPerSeed,
  gamesPerMatchup,
  totalGames: games.length,
  elapsedMs: Math.max(...shards.map((shard) => shard.elapsedMs)),
  aggregateCpuElapsedMs: shards.reduce((sum, shard) => sum + shard.elapsedMs, 0),
  strategies: strategies.map(({ id, label }) => ({ id, label })),
  ranking: summarizeTournamentGames(strategies, games),
  headToHead,
  ...(finalMatchup ? { confidenceInterval95: [Math.max(0, finalRate - finalMargin), Math.min(1, finalRate + finalMargin)] } : {}),
  bySeed: seeds.map((seed) => {
    const seedGames = games.filter((game) => game.seriesSeed === seed);
    return {
      seed,
      games: seedGames.length,
      ranking: summarizeTournamentGames(strategies, seedGames),
      headToHead: allHeadToHead(seedGames),
    };
  }),
}, null, 2));
