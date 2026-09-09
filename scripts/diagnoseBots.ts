import { buildBotKnowledgeV3 } from "@/bots/strategy/botKnowledgeV3";
import { getMonteCarloV3Candidates } from "@/bots/strategy/monteCarloV3CardStrategy";
import { playableCardsForCurrentPlayer } from "@/engine/game";
import type { Card, GameState, PlayerId, Suit } from "@/engine/types";
import {
  ALL_BOT_STRATEGIES,
  chooseStrategyCardWithTrace,
  createV3Variant,
  findBotStrategy,
} from "@/simulation/botRegistry";
import { decisionRegret, oracleCardValues } from "@/simulation/offlineOracle";
import { playTournamentGame } from "@/simulation/tournament";

const seed = Number(process.argv.find((argument) => argument.startsWith("--seed="))?.split("=")[1] ?? 20261209);
const sampleTarget = Number(process.argv.find((argument) => argument.startsWith("--samples="))?.split("=")[1] ?? 60);
const positions: GameState[] = [];
let seen = 0;
for (let game = 0; game < 8 && positions.length < sampleTarget; game += 1) {
  playTournamentGame({
    seed: seed + game,
    teamStrategies: { 0: findBotStrategy("main_montecarlo_v2"), 1: findBotStrategy("main_montecarlo_v3") },
    onCardDecision: (state) => {
      seen += 1;
      const late = state.hands[state.currentPlayerId].length <= 3;
      if (positions.length < sampleTarget && (late || seen % 7 === 0)) positions.push(structuredClone(state));
    },
  });
}

const diagnosticStrategies = [
  ...ALL_BOT_STRATEGIES,
  createV3Variant("v3_no_early", "V3 sans early-return", { features: { tacticalEarlyReturn: false } }),
  createV3Variant("v3_all_legal", "V3 tous coups légaux", { features: { candidateFiltering: false } }),
  createV3Variant("v3_no_soft", "V3 sans beliefs", { features: { softBiddingBeliefs: false } }),
  createV3Variant("v3_no_endgame", "V3 sans endgame", { features: { endgameMinimax: false } }),
];
const metrics = Object.fromEntries(diagnosticStrategies.map((strategy) => [strategy.id, { regrets: [] as number[], times: [] as number[] }])) as Record<string, { regrets: number[]; times: number[] }>;
let tactical = 0;
const tacticalRegrets: number[] = [];
let filteredCoverage = 0;
let totalLegal = 0;
let totalCandidates = 0;
let exactOraclePositions = 0;
let endgameNodes = 0;
const disagreements: unknown[] = [];
const calibration: Array<{ weight: number; count: number }> = [];

const cardKey = (card: Card) => `${card.rank}-${card.suit}`;
const percentile = (values: number[], fraction: number) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * fraction))] ?? 0;
};
const average = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length);

for (const state of positions) {
  const oracle = oracleCardValues(state, { nodeCap: 20_000 });
  if (oracle.exact) exactOraclePositions += 1;
  const choices: Record<string, string> = {};
  for (const strategy of diagnosticStrategies) {
    const started = performance.now();
    const decision = chooseStrategyCardWithTrace(state, strategy);
    const elapsed = performance.now() - started;
    const regret = decisionRegret(oracle, decision.card);
    metrics[strategy.id].regrets.push(regret);
    metrics[strategy.id].times.push(elapsed);
    choices[strategy.id] = cardKey(decision.card);
    if (strategy.id === "main_montecarlo_v3") {
      if (decision.trace?.source === "tactical") {
        tactical += 1;
        tacticalRegrets.push(regret);
      }
      endgameNodes += decision.trace?.nodes ?? 0;
    }
  }
  const candidates = getMonteCarloV3Candidates(state);
  const legal = playableCardsForCurrentPlayer(state).length;
  totalLegal += legal;
  totalCandidates += candidates.length;
  if (candidates.some((card) => cardKey(card) === cardKey(oracle.bestCard))) filteredCoverage += 1;
  const knowledge = buildBotKnowledgeV3(state);
  for (const player of [0, 1, 2, 3] as PlayerId[]) {
    if (player === state.currentPlayerId) continue;
    for (const suit of ["clubs", "diamonds", "hearts", "spades"] as Suit[]) {
      calibration.push({ weight: knowledge.suitBeliefs[player][suit].weight, count: state.hands[player].filter((card) => card.suit === suit).length });
    }
  }
  if (new Set(Object.values(choices)).size > 1 && disagreements.length < 8) {
    disagreements.push({
      ownHand: state.hands[state.currentPlayerId], trump: state.trump, contract: state.contract,
      currentPlayerId: state.currentPlayerId, currentTrick: state.currentTrick,
      completedTricks: state.completedTricks, bids: state.bids,
      oracle: { card: oracle.bestCard, exact: oracle.exact }, choices,
    });
  }
}

const meanWeight = average(calibration.map((item) => item.weight));
const meanCount = average(calibration.map((item) => item.count));
const covariance = average(calibration.map((item) => (item.weight - meanWeight) * (item.count - meanCount)));
const weightVariance = average(calibration.map((item) => (item.weight - meanWeight) ** 2));
const countVariance = average(calibration.map((item) => (item.count - meanCount) ** 2));
const correlation = covariance / Math.sqrt(Math.max(Number.EPSILON, weightVariance * countVariance));

console.log(JSON.stringify({
  seed,
  positions: positions.length,
  exactOraclePositions,
  regret: Object.fromEntries(Object.entries(metrics).map(([id, data]) => [id, {
    average: average(data.regrets), p95: percentile(data.regrets, 0.95),
    decisionAverageMs: average(data.times), decisionP95Ms: percentile(data.times, 0.95),
  }])),
  tactical: { decisions: tactical, rate: tactical / Math.max(1, positions.length), averageRegret: average(tacticalRegrets), p95Regret: percentile(tacticalRegrets, 0.95) },
  filtering: { bestMoveCoverage: filteredCoverage / Math.max(1, positions.length), averageCandidates: totalCandidates / Math.max(1, positions.length), averageLegalCards: totalLegal / Math.max(1, positions.length) },
  endgame: { totalNodes: endgameNodes, averageNodesPerSampledPosition: endgameNodes / Math.max(1, positions.length) },
  beliefsCalibration: { samples: calibration.length, weightToActualSuitCountCorrelation: correlation },
  disagreements: process.argv.includes("--summary") ? [] : disagreements,
}, null, 2));
