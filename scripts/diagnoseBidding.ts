import { createInitialGame } from "@/engine/game";
import { createSeededRandom } from "@/engine/random";
import type { GameState } from "@/engine/types";
import {
  chooseStrategyBid,
  createHybridStrategy,
  findBotStrategy,
} from "@/simulation/botRegistry";
import { biddingDecisionRegret, oracleBidValues } from "@/simulation/offlineBiddingOracle";
import { applyStrategyBid, normalizeStrategyBid } from "@/simulation/tournament";

const read = (name: string) => process.argv.find((argument) => argument.startsWith(`--${name}=`))?.slice(name.length + 3);
const seed = Number(read("seed") ?? 20262609);
const sampleTarget = Number(read("samples") ?? 8);
const rolloutBidding = createHybridStrategy("main", "monte_carlo_v2");
const rolloutCards = createHybridStrategy("main", "monte_carlo_v2");
const strategies = [
  createHybridStrategy("legacy", "monte_carlo_v2"),
  createHybridStrategy("main", "monte_carlo_v2"),
  createHybridStrategy("monte_carlo", "monte_carlo_v2"),
  createHybridStrategy("bidding_v2", "monte_carlo_v2"),
];
const positions: GameState[] = [];

for (let game = 0; positions.length < sampleTarget && game < sampleTarget; game += 1) {
  let state = createInitialGame(createSeededRandom(seed + game));
  while (state.phase === "bidding" && positions.length < sampleTarget) {
    positions.push(structuredClone(state));
    state = applyStrategyBid(state, chooseStrategyBid(state, findBotStrategy("main_montecarlo_v2")));
  }
}

const metrics = Object.fromEntries(strategies.map((strategy) => [strategy.id, [] as number[]]));
for (const [index, state] of positions.entries()) {
  const oracle = oracleBidValues(state, { biddingEngine: rolloutBidding, cardEngine: rolloutCards });
  for (const strategy of strategies) {
    metrics[strategy.id].push(biddingDecisionRegret(
      oracle,
      normalizeStrategyBid(state, chooseStrategyBid(state, strategy)),
    ));
  }
  console.error(`[${index + 1}/${positions.length}] ${oracle.values.length} legal decisions`);
}

const average = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length);
console.log(JSON.stringify({
  seed,
  positions: positions.length,
  rolloutCardEngine: rolloutCards.card,
  regret: Object.fromEntries(Object.entries(metrics).map(([id, values]) => [id, {
    average: average(values),
    zeroRegretRate: values.filter((value) => value === 0).length / Math.max(1, values.length),
    values,
  }])),
}, null, 2));
