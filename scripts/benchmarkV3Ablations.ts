import { createV3Variant, findBotStrategy } from "@/simulation/botRegistry";
import { runRoundRobin } from "@/simulation/tournament";
import type { V3Features } from "@/bots/strategy/monteCarloV3CardStrategy";

const seed = Number(process.argv.find((argument) => argument.startsWith("--seed="))?.split("=")[1] ?? 20261109);
const games = Number(process.argv.find((argument) => argument.startsWith("--games="))?.split("=")[1] ?? 20);
const champion = findBotStrategy("main_montecarlo_v2");
const variants: Array<{ id: string; features: Partial<V3Features> }> = [
  { id: "v3_full", features: {} },
  { id: "v3_no_early", features: { tacticalEarlyReturn: false } },
  { id: "v3_all_legal", features: { candidateFiltering: false } },
  { id: "v3_no_soft", features: { softBiddingBeliefs: false } },
  { id: "v3_no_hard", features: { hardConstraints: false } },
  { id: "v3_rollout_v2", features: { tacticalRollout: false } },
  { id: "v3_eval_v2", features: { evaluationV3: false } },
  { id: "v3_no_endgame", features: { endgameMinimax: false } },
  {
    id: "v3_hard_mc",
    features: {
      tacticalEarlyReturn: false,
      candidateFiltering: false,
      softBiddingBeliefs: false,
      hardConstraints: true,
      tacticalRollout: false,
      evaluationV3: false,
      endgameMinimax: false,
    },
  },
  {
    id: "v3_no_early_v2_core",
    features: {
      tacticalEarlyReturn: false,
      tacticalRollout: false,
      evaluationV3: false,
    },
  },
];

const output = variants.map((variant, index) => {
  const strategy = createV3Variant(variant.id, variant.id, { features: variant.features });
  const result = runRoundRobin([strategy, champion], games, seed);
  const stats = result.ranking.find((item) => item.id === variant.id)!;
  const head = result.headToHead[0];
  const wins = head.first === variant.id ? head.firstWins : head.secondWins;
  console.error(`[${index + 1}/${variants.length}] ${variant.id}: ${wins}/${games}`);
  return {
    variant: variant.id,
    games,
    wins,
    winRate: wins / games,
    scoreAverage: stats.averageScore,
    differentialAverage: stats.averageDifferential,
    contracts: `${stats.contractsSucceeded}/${stats.contractsTaken}`,
    cardAverageMs: stats.averageCardMs,
    cardP95Ms: stats.p95CardMs,
    elapsedMs: result.elapsedMs,
  };
});

console.log(JSON.stringify({ seed, champion: champion.id, results: output }, null, 2));
