import { chooseHumanDoctrineV3Bid, type HumanDoctrineV3Trace } from "@/bots/strategy/humanDoctrineV3";
import type { GameState, TeamId } from "@/engine/types";
import { findBotStrategy, type BotStrategyDefinition } from "@/simulation/botRegistry";
import {
  CANONICAL_SCORING_MODE,
  CANONICAL_TARGET_SCORE,
  playTournamentGame,
  summarizeTournamentGames,
  type BotTournamentStats,
  type TournamentGame,
} from "@/simulation/tournament";

const read = (name: string) => process.argv.find((argument) => argument.startsWith(`--${name}=`))?.slice(name.length + 3);
const games = Number(read("games") ?? 200);
const opponentId = read("opponent") ?? "human_doctrine_v1_mc_v1";
const seeds = (read("seeds") ?? "20270101,20271101,20272101,20273101,20274101").split(",").map(Number);
const output = read("output") ?? `reports/auction-doctrine-v3-vs-${opponentId}-${games}.json`;
if (!Number.isInteger(games) || games < 2 || games % (seeds.length * 2) !== 0) {
  throw new Error("--games must be a positive multiple of twice the number of seeds.");
}

const candidate = findBotStrategy("human_doctrine_v3_conversation_mc_v1");
const opponent = findBotStrategy(opponentId);

type V3Metrics = {
  decisions: number;
  minimalOpening80Count: number;
  singleMajorOpening80Count: number;
  singleMajorImmediate100Prevented: number;
  partnerMissingMajorFits: number;
  partnerFitRaises10: number;
  partnerFitRaises20Plus: number;
  partnerSuitOverrideAttempts: number;
  partnerSuitOverrideAllowed: number;
  partnerSuitOverrideRejected: number;
  weakTrumpFoundationPasses: number;
  rebidsAfterPartnerSupport: number;
  auctionsWithTwoOrMoreOwnTurns: number;
  averageFirstBid: number;
  averageFinalBid: number;
};

type MutableV3Metrics = Omit<V3Metrics, "averageFirstBid" | "averageFinalBid"> & {
  firstBidTotal: number;
  firstBidCount: number;
  finalBidTotal: number;
  finalBidCount: number;
};

function emptyMetrics(): MutableV3Metrics {
  return {
    decisions: 0,
    minimalOpening80Count: 0,
    singleMajorOpening80Count: 0,
    singleMajorImmediate100Prevented: 0,
    partnerMissingMajorFits: 0,
    partnerFitRaises10: 0,
    partnerFitRaises20Plus: 0,
    partnerSuitOverrideAttempts: 0,
    partnerSuitOverrideAllowed: 0,
    partnerSuitOverrideRejected: 0,
    weakTrumpFoundationPasses: 0,
    rebidsAfterPartnerSupport: 0,
    auctionsWithTwoOrMoreOwnTurns: 0,
    firstBidTotal: 0,
    firstBidCount: 0,
    finalBidTotal: 0,
    finalBidCount: 0,
  };
}

function confidence95(wins: number, count: number) {
  const p = wins / count;
  const margin = 1.96 * Math.sqrt(p * (1 - p) / count);
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
    defenseRounds: stats.defenseRounds,
    defensiveSets: stats.defensiveSets,
    defenseSetRate: stats.defensiveSetRate,
    averageContract: stats.averageContract,
    averageBidMs: stats.averageBidMs,
    p95BidMs: stats.p95BidMs,
    averageCardMs: stats.averageCardMs,
    p95CardMs: stats.p95CardMs,
    averageCpuMsPerGame: stats.averageCpuMsPerGame,
  };
}

function recordDecision(
  state: GameState,
  trace: HumanDoctrineV3Trace,
  metrics: MutableV3Metrics,
  multiTurnAuctions: Set<string>,
  gameIndex: number,
): void {
  metrics.decisions += 1;
  const action = trace.finalAction;
  const isOpening = trace.auctionRole === "opening" && !state.bids.some((bid) => bid.action === "bid");
  if (isOpening && action.action === "bid" && action.value === 80) metrics.minimalOpening80Count += 1;
  if (isOpening && trace.trumpFoundation === "one-major" && action.action === "bid" && action.value === 80) {
    metrics.singleMajorOpening80Count += 1;
    if ((trace.intrinsicCeiling ?? 0) >= 100) metrics.singleMajorImmediate100Prevented += 1;
  }
  if (trace.partnerFit === "missing-major-fit" || trace.partnerFit === "strong-fit") {
    metrics.partnerMissingMajorFits += 1;
  }
  const currentBid = state.bids.findLast(
    (bid): bid is Extract<typeof bid, { action: "bid" }> => bid.action === "bid",
  );
  if (action.action === "bid" && currentBid) {
    const raise = action.value - currentBid.value;
    if (trace.partnerFit !== "none" && raise === 10) metrics.partnerFitRaises10 += 1;
    if (trace.partnerFit !== "none" && raise >= 20) metrics.partnerFitRaises20Plus += 1;
  }
  if (trace.partnerSuitOverride !== "not-applicable") metrics.partnerSuitOverrideAttempts += 1;
  if (trace.partnerSuitOverride === "allowed") metrics.partnerSuitOverrideAllowed += 1;
  if (trace.partnerSuitOverride === "forbidden") metrics.partnerSuitOverrideRejected += 1;
  if (trace.trumpFoundation === "none" && action.action === "pass") metrics.weakTrumpFoundationPasses += 1;
  if (trace.communicationIntent === "rebid-after-support" && action.action === "bid") {
    metrics.rebidsAfterPartnerSupport += 1;
  }
  if (trace.conversation.ownPreviousBids.length > 0) {
    multiTurnAuctions.add(`${gameIndex}:${state.roundNumber}:${state.currentPlayerId}`);
  }
  if (action.action === "bid" && trace.conversation.ownPreviousBids.length === 0) {
    metrics.firstBidTotal += action.value;
    metrics.firstBidCount += 1;
  }
}

function recordFinalBids(
  game: TournamentGame,
  metrics: MutableV3Metrics,
): void {
  const candidateTeam = ([0, 1] as TeamId[]).find((team) => game.teamStrategies[team] === candidate.id);
  if (candidateTeam === undefined) throw new Error("Candidate team missing from paired game.");
  for (const round of game.rounds) {
    const candidateBids = round.bids.filter(
      (bid): bid is Extract<typeof bid, { action: "bid" }> => bid.action === "bid" && bid.playerId % 2 === candidateTeam,
    );
    const finalBid = candidateBids.at(-1);
    if (finalBid) {
      metrics.finalBidTotal += finalBid.value;
      metrics.finalBidCount += 1;
    }
  }
}

const allGames: TournamentGame[] = [];
const perSeed: Array<{ seed: number; games: TournamentGame[] }> = [];
const metrics = emptyMetrics();
const multiTurnAuctions = new Set<string>();
const gamesPerSeed = games / seeds.length;
let gameIndex = 0;

for (const seriesSeed of seeds) {
  const batch: TournamentGame[] = [];
  for (let pair = 0; pair < gamesPerSeed / 2; pair += 1) {
    const dealSeed = seriesSeed + pair;
    for (const teams of [
      { 0: candidate, 1: opponent },
      { 0: opponent, 1: candidate },
    ] as Array<Record<TeamId, BotStrategyDefinition>>) {
      const currentGameIndex = gameIndex;
      const game = playTournamentGame({
        seed: dealSeed,
        teamStrategies: teams,
        targetScore: CANONICAL_TARGET_SCORE,
        onBidDecision: (state, strategy) => {
          if (strategy.id !== candidate.id) return;
          const decision = chooseHumanDoctrineV3Bid(state);
          recordDecision(state, decision.trace, metrics, multiTurnAuctions, currentGameIndex);
        },
      });
      game.seriesSeed = seriesSeed;
      recordFinalBids(game, metrics);
      allGames.push(game);
      batch.push(game);
      gameIndex += 1;
    }
  }
  perSeed.push({ seed: seriesSeed, games: batch });
  console.error(`Completed seed ${seriesSeed}: ${allGames.length}/${games} games.`);
}

metrics.auctionsWithTwoOrMoreOwnTurns = multiTurnAuctions.size;
const {
  firstBidTotal,
  firstBidCount,
  finalBidTotal,
  finalBidCount,
  ...counterValues
} = metrics;
const finalizedMetrics: V3Metrics = {
  ...counterValues,
  averageFirstBid: firstBidCount ? firstBidTotal / firstBidCount : 0,
  averageFinalBid: finalBidCount ? finalBidTotal / finalBidCount : 0,
};

const stats = summarizeTournamentGames([candidate, opponent], allGames);
const candidateStats = stats.find((item) => item.id === candidate.id)!;
const opponentStats = stats.find((item) => item.id === opponent.id)!;
const report = {
  experiment: "Auction Doctrine V3 conversational bidding",
  generatedAt: new Date().toISOString(),
  settings: {
    scoringMode: CANONICAL_SCORING_MODE,
    targetScore: CANONICAL_TARGET_SCORE,
    games,
    seeds,
    pairedDeals: true,
    invertedSides: true,
    candidateCardEngine: candidate.card.kind,
    opponentCardEngine: opponent.card.kind,
  },
  result: {
    candidate: { ...core(candidateStats), confidence95: confidence95(candidateStats.wins, candidateStats.games) },
    opponent: core(opponentStats),
    perSeed: perSeed.map((batch) => {
      const wins = batch.games.filter((game) => game.teamStrategies[game.winnerTeam] === candidate.id).length;
      return { seed: batch.seed, games: batch.games.length, wins, losses: batch.games.length - wins, winRate: wins / batch.games.length };
    }),
  },
  conversationMetrics: finalizedMetrics,
  privacy: "Every decision and metric uses only the acting hand, public auction, public score and posterior results.",
};

const json = JSON.stringify(report, null, 2);
const { writeFileSync } = await import("node:fs");
writeFileSync(output, `${json}\n`, "utf8");
console.log(JSON.stringify({ output, ...report.result, conversationMetrics: finalizedMetrics }, null, 2));
