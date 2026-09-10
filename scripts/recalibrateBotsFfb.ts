import {
  composeStrategy,
  findBotStrategy,
  type BotStrategyDefinition,
} from "@/simulation/botRegistry";
import { FFB_RECALIBRATION_STRATEGIES } from "@/simulation/ffbRecalibration";
import {
  CANONICAL_SCORING_MODE,
  CANONICAL_TARGET_SCORE,
  runPairedMatchup,
  summarizeTournamentGames,
  type HeadToHeadResult,
  type TournamentGame,
} from "@/simulation/tournament";

type Phase = "control" | "screening" | "final" | "head-to-head";
type Matchup = readonly [BotStrategyDefinition, BotStrategyDefinition];

const SCREENING_SEEDS = [20260910, 20261910, 20262910, 20263910];
const FINAL_SEEDS = [20270910, 20271910, 20272910];
const HEAD_TO_HEAD_SEEDS = [20280910, 20281910, 20282910, 20283910];

function read(name: string): string | undefined {
  const prefix = `--${name}=`;
  return process.argv.find((argument) => argument.startsWith(prefix))?.slice(prefix.length);
}

function positiveEven(name: string, fallback: number): number {
  const value = Number(read(name) ?? fallback);
  if (!Number.isInteger(value) || value < 2 || value % 2 !== 0) {
    throw new Error(`--${name} doit être un entier pair supérieur ou égal à 2.`);
  }
  return value;
}

function shardMatchups(matchups: Matchup[]): { matchups: Matchup[]; shard: string | null } {
  const shard = read("shard");
  if (!shard) return { matchups, shard: null };
  const match = /^(\d+)\/(\d+)$/.exec(shard);
  if (!match) throw new Error("--shard doit utiliser le format index/total, par exemple 0/8.");
  const index = Number(match[1]);
  const total = Number(match[2]);
  if (!Number.isInteger(index) || !Number.isInteger(total) || total < 1 || index < 0 || index >= total) {
    throw new Error("Shard invalide.");
  }
  return { matchups: matchups.filter((_, matchupIndex) => matchupIndex % total === index), shard };
}

function shardSeeds(seeds: number[]): { seeds: number[]; seedShard: string | null } {
  const seedShard = read("seed-shard");
  if (!seedShard) return { seeds, seedShard: null };
  const match = /^(\d+)\/(\d+)$/.exec(seedShard);
  if (!match) throw new Error("--seed-shard doit utiliser le format index/total.");
  const index = Number(match[1]);
  const total = Number(match[2]);
  if (!Number.isInteger(index) || !Number.isInteger(total) || total < 1 || index < 0 || index >= total) {
    throw new Error("Seed shard invalide.");
  }
  return { seeds: seeds.filter((_, seedIndex) => seedIndex % total === index), seedShard };
}

function resolveStrategy(id: string): BotStrategyDefinition {
  const candidate = FFB_RECALIBRATION_STRATEGIES.find((strategy) => strategy.id === id);
  if (candidate) return candidate;
  return findBotStrategy(id);
}

function allMatchups(strategies: BotStrategyDefinition[]): Matchup[] {
  const matchups: Matchup[] = [];
  for (let first = 0; first < strategies.length; first += 1) {
    for (let second = first + 1; second < strategies.length; second += 1) {
      matchups.push([strategies[first], strategies[second]]);
    }
  }
  return matchups;
}

function headToHead(matchups: Matchup[], games: TournamentGame[]): HeadToHeadResult[] {
  return matchups.map(([first, second]) => {
    const relevant = games.filter((game) => {
      const ids = Object.values(game.teamStrategies);
      return ids.includes(first.id) && ids.includes(second.id);
    });
    const firstWins = relevant.filter((game) => game.teamStrategies[game.winnerTeam] === first.id).length;
    return {
      first: first.id,
      second: second.id,
      games: relevant.length,
      firstWins,
      secondWins: relevant.length - firstWins,
      firstWinRate: firstWins / relevant.length,
    };
  });
}

function runSeries(
  phase: Phase,
  strategies: BotStrategyDefinition[],
  matchups: Matchup[],
  seeds: number[],
  gamesPerSeed: number,
  options: { includeRawGames?: boolean; shard?: string | null; seedShard?: string | null } = {},
) {
  const started = performance.now();
  const games: TournamentGame[] = [];
  const bySeed = [];
  const totalRuns = seeds.length * matchups.length;
  let completed = 0;

  for (const seed of seeds) {
    const seedGames: TournamentGame[] = [];
    for (const [matchupIndex, [first, second]] of matchups.entries()) {
      const matchupGames = runPairedMatchup(
        first,
        second,
        gamesPerSeed,
        seed + matchupIndex * 10_000,
      );
      for (const game of matchupGames) game.seriesSeed = seed;
      seedGames.push(...matchupGames);
      games.push(...matchupGames);
      completed += 1;
      const firstWins = matchupGames.filter((game) => game.teamStrategies[game.winnerTeam] === first.id).length;
      console.error(`[${completed}/${totalRuns}] seed=${seed} ${first.id} ${firstWins}-${gamesPerSeed - firstWins} ${second.id}`);
    }
    bySeed.push({
      seed,
      games: seedGames.length,
      ranking: summarizeTournamentGames(strategies, seedGames),
      headToHead: headToHead(matchups, seedGames),
    });
  }

  const elapsedMs = performance.now() - started;
  return {
    phase,
    scoringMode: CANONICAL_SCORING_MODE,
    targetScore: CANONICAL_TARGET_SCORE,
    seeds,
    gamesPerSeed,
    gamesPerMatchup: gamesPerSeed * seeds.length,
    totalGames: games.length,
    elapsedMs,
    averageWallMsPerGame: elapsedMs / games.length,
    shard: options.shard ?? null,
    seedShard: options.seedShard ?? null,
    strategies: strategies.map(({ id, label }) => ({ id, label })),
    ranking: summarizeTournamentGames(strategies, games),
    headToHead: headToHead(matchups, games),
    bySeed,
    ...(options.includeRawGames ? { rawGames: games } : {}),
  };
}

function parseIds(name: string, expected: number): BotStrategyDefinition[] {
  const ids = read(name)?.split(",").filter(Boolean) ?? [];
  if (ids.length !== expected || new Set(ids).size !== expected) {
    throw new Error(`--${name} doit contenir exactement ${expected} stratégies distinctes.`);
  }
  return ids.map(resolveStrategy);
}

function confidenceInterval95(wins: number, games: number): [number, number] {
  const rate = wins / games;
  const margin = 1.96 * Math.sqrt(rate * (1 - rate) / games);
  return [Math.max(0, rate - margin), Math.min(1, rate + margin)];
}

const phase = (read("phase") ?? "control") as Phase;

if (phase === "control") {
  const original = findBotStrategy("hybrid_legacy_v1");
  const first = composeStrategy("control_alias_a", "Alias A du bot officiel", original, original);
  const second = composeStrategy("control_alias_b", "Alias B du bot officiel", original, original);
  console.log(JSON.stringify(runSeries(
    phase,
    [first, second],
    [[first, second]],
    SCREENING_SEEDS,
    positiveEven("games-per-seed", 26),
  ), null, 2));
} else if (phase === "screening") {
  const selected = shardMatchups(allMatchups(FFB_RECALIBRATION_STRATEGIES));
  const selectedSeeds = shardSeeds(SCREENING_SEEDS);
  console.log(JSON.stringify(runSeries(
    phase,
    FFB_RECALIBRATION_STRATEGIES,
    selected.matchups,
    selectedSeeds.seeds,
    positiveEven("games-per-seed", 26),
    { includeRawGames: process.argv.includes("--raw"), shard: selected.shard, seedShard: selectedSeeds.seedShard },
  ), null, 2));
} else if (phase === "final") {
  const finalists = parseIds("finalists", 4);
  const selected = shardMatchups(allMatchups(finalists));
  const selectedSeeds = shardSeeds(FINAL_SEEDS);
  console.log(JSON.stringify(runSeries(
    phase,
    finalists,
    selected.matchups,
    selectedSeeds.seeds,
    positiveEven("games-per-seed", 100),
    { includeRawGames: process.argv.includes("--raw"), shard: selected.shard, seedShard: selectedSeeds.seedShard },
  ), null, 2));
} else if (phase === "head-to-head") {
  const finalists = parseIds("finalists", 2);
  const selectedSeeds = shardSeeds(HEAD_TO_HEAD_SEEDS);
  const result = runSeries(
    phase,
    finalists,
    [[finalists[0], finalists[1]]],
    selectedSeeds.seeds,
    positiveEven("games-per-seed", 300),
    { includeRawGames: process.argv.includes("--raw"), seedShard: selectedSeeds.seedShard },
  );
  const matchup = result.headToHead[0];
  console.log(JSON.stringify({
    ...result,
    confidenceInterval95: confidenceInterval95(matchup.firstWins, matchup.games),
  }, null, 2));
} else {
  throw new Error("--phase doit valoir control, screening, final ou head-to-head.");
}
