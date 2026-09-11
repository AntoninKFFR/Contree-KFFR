import { chooseHumanDoctrineV2Bid, type HandDependency, type HumanDoctrineV2Options } from "@/bots/strategy/humanDoctrineV2";
import type { TeamId } from "@/engine/types";
import { findBotStrategy, type BotStrategyDefinition } from "@/simulation/botRegistry";
import { CANONICAL_SCORING_MODE, CANONICAL_TARGET_SCORE, playTournamentGame, summarizeTournamentGames, type BotTournamentStats, type TournamentGame } from "@/simulation/tournament";

const read = (name: string) => process.argv.find((argument) => argument.startsWith(`--${name}=`))?.slice(name.length + 3);
const variantIds = (read("variants") ?? "human_doctrine_v2_1_conservative_mc_v1,human_doctrine_v2_1_balanced_mc_v1,human_doctrine_v2_1_aggressive_mc_v1").split(",");
const gamesPerVariant = Number(read("games") ?? 100);
const seeds = (read("seeds") ?? "20261101,20262101,20263101,20264101,20265101").split(",").map(Number);
const output = read("output") ?? "reports/human-bidding-doctrine-v2-1-mini-screening.json";
if (!Number.isInteger(gamesPerVariant) || gamesPerVariant < 2 || gamesPerVariant % (seeds.length * 2) !== 0) {
  throw new Error("--games must be a positive multiple of twice the number of seeds.");
}

const champion = findBotStrategy("human_doctrine_v1_mc_v1");

type InitiativeCounters = {
  decisions: number;
  passesWhileBidWasAvailable: number;
  probing80Count: number;
  autonomousHandsCappedAt80: number;
  competitiveOvercallsAttempted: number;
  competitiveOvercallsPassed: number;
  partnerSupportedRaises: number;
  dependency: Record<HandDependency, number>;
};

function emptyCounters(): InitiativeCounters {
  return {
    decisions: 0,
    passesWhileBidWasAvailable: 0,
    probing80Count: 0,
    autonomousHandsCappedAt80: 0,
    competitiveOvercallsAttempted: 0,
    competitiveOvercallsPassed: 0,
    partnerSupportedRaises: 0,
    dependency: { "partner-dependent": 0, "semi-autonomous": 0, autonomous: 0 },
  };
}

function optionsFor(strategy: BotStrategyDefinition): HumanDoctrineV2Options {
  if (strategy.bidding.kind !== "human-doctrine-v2") throw new Error(`${strategy.id} is not a Human Doctrine V2 strategy.`);
  return strategy.bidding.options;
}

function confidence95(wins: number, games: number) {
  const p = wins / games;
  const margin = 1.96 * Math.sqrt(p * (1 - p) / games);
  return { low: Math.max(0, p - margin), high: Math.min(1, p + margin) };
}

function core(stats: BotTournamentStats) {
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
    averageContract: stats.averageContract,
    defenseRounds: stats.defenseRounds,
    defensiveSets: stats.defensiveSets,
    defenseSetRate: stats.defensiveSetRate,
    averageBidMs: stats.averageBidMs,
    p95BidMs: stats.p95BidMs,
    averageCpuMsPerGame: stats.averageCpuMsPerGame,
  };
}

function runVariant(candidate: BotStrategyDefinition) {
  const games: TournamentGame[] = [];
  const counters = emptyCounters();
  const candidateOptions = optionsFor(candidate);
  const gamesPerSeed = gamesPerVariant / seeds.length;
  const perSeedGames: Array<{ seed: number; games: TournamentGame[] }> = [];
  for (const seriesSeed of seeds) {
    const batch: TournamentGame[] = [];
    for (let pair = 0; pair < gamesPerSeed / 2; pair += 1) {
      const dealSeed = seriesSeed + pair;
      for (const teams of [
        { 0: candidate, 1: champion },
        { 0: champion, 1: candidate },
      ] as Array<Record<TeamId, BotStrategyDefinition>>) {
        const game = playTournamentGame({
          seed: dealSeed,
          teamStrategies: teams,
          onBidDecision: (state, strategy) => {
            if (strategy.id !== candidate.id) return;
            const decision = chooseHumanDoctrineV2Bid(state, candidateOptions);
            const trace = decision.trace.auction;
            counters.decisions += 1;
            if (decision.action === "pass" && trace.context.legalNextBids.length > 0) counters.passesWhileBidWasAvailable += 1;
            if (decision.action === "bid" && decision.value === 80 && trace.ceiling.openingCap === 80 && trace.intent === "probing-major-trump") counters.probing80Count += 1;
            if (trace.handDependency) counters.dependency[trace.handDependency.classification] += 1;
            if (trace.handDependency?.classification === "autonomous" && trace.ceiling.openingCap === 80) counters.autonomousHandsCappedAt80 += 1;
            if (trace.context.auctionRole === "competitive-overcall") {
              if (decision.action === "bid") counters.competitiveOvercallsAttempted += 1;
              else counters.competitiveOvercallsPassed += 1;
            }
            if (trace.partnerInference.supportKnown && trace.context.currentContract && decision.action === "bid") counters.partnerSupportedRaises += 1;
          },
        });
        game.seriesSeed = seriesSeed;
        games.push(game);
        batch.push(game);
      }
    }
    perSeedGames.push({ seed: seriesSeed, games: batch });
  }
  const stats = summarizeTournamentGames([candidate, champion], games);
  const candidateStats = stats.find((item) => item.id === candidate.id)!;
  const championStats = stats.find((item) => item.id === champion.id)!;
  return {
    id: candidate.id,
    policy: candidateOptions.selectiveProbePolicy,
    result: {
      candidate: { ...core(candidateStats), confidence95: confidence95(candidateStats.wins, candidateStats.games) },
      champion: core(championStats),
      contractShare: candidateStats.contractsTaken / (candidateStats.contractsTaken + championStats.contractsTaken),
      perSeed: perSeedGames.map((batch) => {
        const wins = batch.games.filter((game) => game.teamStrategies[game.winnerTeam] === candidate.id).length;
        return { seed: batch.seed, games: batch.games.length, wins, losses: batch.games.length - wins, winRate: wins / batch.games.length };
      }),
    },
    initiative: counters,
  };
}

const variants = variantIds.map((id) => runVariant(findBotStrategy(id)));
const report = {
  experiment: "Human bidding doctrine V2.1 short selective-probe variants",
  generatedAt: new Date().toISOString(),
  settings: { scoringMode: CANONICAL_SCORING_MODE, targetScore: CANONICAL_TARGET_SCORE, gamesPerVariant, seeds, pairedDeals: true, invertedSides: true, cardEngine: "monte-carlo-v1" },
  baseline: { v1ContractsTakenInPrior200: 900, v2ContractsTakenInPrior200: 307 },
  variants,
};
const json = JSON.stringify(report, null, 2);
const { writeFileSync } = await import("node:fs");
writeFileSync(output, `${json}\n`, "utf8");
console.log(JSON.stringify({ output, variants: variants.map((variant) => ({ id: variant.id, wins: variant.result.candidate.wins, winRate: variant.result.candidate.winRate, contractsTaken: variant.result.candidate.contractsTaken, contractShare: variant.result.contractShare, initiative: variant.initiative })) }, null, 2));
