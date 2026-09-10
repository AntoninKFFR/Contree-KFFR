import { chooseHumanDoctrineV2Bid, type CommunicativeTrumpStructure } from "@/bots/strategy/humanDoctrineV2";
import { playerTeam } from "@/engine/rules";
import type { BidValue, TeamId } from "@/engine/types";
import { findBotStrategy, type BotStrategyDefinition } from "@/simulation/botRegistry";
import { CANONICAL_SCORING_MODE, CANONICAL_TARGET_SCORE, playTournamentGame, summarizeTournamentGames, type BotTournamentStats, type TournamentGame } from "@/simulation/tournament";

const read = (name: string) => process.argv.find((argument) => argument.startsWith(`--${name}=`))?.slice(name.length + 3);
const totalGames = Number(read("games") ?? 200);
const seeds = (read("seeds") ?? "20261001,20262001,20263001,20264001").split(",").map(Number);
const output = read("output");
if (!Number.isInteger(totalGames) || totalGames < 2 || totalGames % (seeds.length * 2) !== 0) {
  throw new Error("--games must be a positive multiple of twice the number of seeds.");
}

const candidate = findBotStrategy("human_doctrine_v2_comm_mc_v1");
const champion = findBotStrategy("human_doctrine_v1_mc_v1");
const gamesPerSeed = totalGames / seeds.length;

type DoctrineEvent = {
  roundNumber: number;
  team: TeamId;
  structure: CommunicativeTrumpStructure;
  intent: ReturnType<typeof chooseHumanDoctrineV2Bid>["trace"]["auction"]["intent"];
  action: "pass" | "bid";
  value: BidValue | null;
  isOpening: boolean;
  probingCap80: boolean;
  partnerSupportedRaise: boolean;
};

type ResolvedDoctrineEvent = DoctrineEvent & {
  gameWon: boolean;
  tookContract: boolean;
  contractSucceeded: boolean | null;
  roundDifferential: number;
};

function playOne(seed: number, teams: Record<TeamId, BotStrategyDefinition>): { game: TournamentGame; events: ResolvedDoctrineEvent[] } {
  const pending: DoctrineEvent[] = [];
  const game = playTournamentGame({
    seed,
    teamStrategies: teams,
    onBidDecision: (state, strategy) => {
      if (strategy.id !== candidate.id) return;
      const decision = chooseHumanDoctrineV2Bid(state);
      const evaluation = decision.trace.intrinsic.evaluation;
      const context = decision.trace.auction.context;
      pending.push({
        roundNumber: state.roundNumber,
        team: playerTeam(state.currentPlayerId),
        structure: evaluation.structure,
        intent: decision.trace.auction.intent,
        action: decision.action,
        value: decision.action === "bid" ? decision.value : null,
        isOpening: !context.currentContract && context.ownBids.length === 0,
        probingCap80: decision.trace.auction.intent === "probing-major-trump" && decision.trace.auction.ceiling.openingCap === 80 && decision.action === "bid" && decision.value === 80,
        partnerSupportedRaise: decision.trace.auction.partnerInference.supportKnown && Boolean(context.currentContract) && decision.action === "bid",
      });
    },
  });
  const events = pending.map((event): ResolvedDoctrineEvent => {
    const round = game.rounds[event.roundNumber - 1];
    const opponent: TeamId = event.team === 0 ? 1 : 0;
    const played = round?.result.kind === "played" ? round.result : null;
    const tookContract = played?.contract.teamId === event.team;
    return {
      ...event,
      gameWon: game.winnerTeam === event.team,
      tookContract,
      contractSucceeded: tookContract ? played?.contractSucceeded ?? null : null,
      roundDifferential: round ? round.result.roundScore[event.team] - round.result.roundScore[opponent] : 0,
    };
  });
  return { game, events };
}

const batches = seeds.map((seriesSeed) => {
  const games: TournamentGame[] = [];
  const events: ResolvedDoctrineEvent[] = [];
  for (let pair = 0; pair < gamesPerSeed / 2; pair += 1) {
    const dealSeed = seriesSeed + pair;
    for (const teams of [
      { 0: candidate, 1: champion },
      { 0: champion, 1: candidate },
    ] as Array<Record<TeamId, BotStrategyDefinition>>) {
      const played = playOne(dealSeed, teams);
      played.game.seriesSeed = seriesSeed;
      games.push(played.game);
      events.push(...played.events);
    }
  }
  return { seed: seriesSeed, games, events };
});

const games = batches.flatMap((batch) => batch.games);
const events = batches.flatMap((batch) => batch.events);
const ranking = summarizeTournamentGames([candidate, champion], games);
const candidateStats = ranking.find((entry) => entry.id === candidate.id)!;
const championStats = ranking.find((entry) => entry.id === champion.id)!;

function confidence95(wins: number, gamesCount: number) {
  const p = wins / gamesCount;
  const margin = 1.96 * Math.sqrt(p * (1 - p) / gamesCount);
  return { low: Math.max(0, p - margin), high: Math.min(1, p + margin) };
}

function coreMetrics(stats: BotTournamentStats) {
  return {
    games: stats.games,
    wins: stats.wins,
    losses: stats.losses,
    winRate: stats.winRate,
    averageScore: stats.averageScore,
    averageDifferential: stats.averageDifferential,
    contractsTaken: stats.contractsTaken,
    contractsSucceeded: stats.contractsSucceeded,
    contractSuccessRate: stats.contractsTaken ? stats.contractsSucceeded / stats.contractsTaken : 0,
    averageContract: stats.averageContract,
    bidLevels: stats.bidLevels,
    attackRounds: stats.attackRounds,
    averageAttackScore: stats.averageAttackScore,
    defenseRounds: stats.defenseRounds,
    defensiveSets: stats.defensiveSets,
    defensiveSetRate: stats.defensiveSetRate,
    averageDefenseScore: stats.averageDefenseScore,
    averageBidMs: stats.averageBidMs,
    p95BidMs: stats.p95BidMs,
    averageCardMs: stats.averageCardMs,
    p95CardMs: stats.p95CardMs,
    averageCpuMsPerGame: stats.averageCpuMsPerGame,
  };
}

const structures = (["jack-only", "nine-only", "thirty-four", "jack-nine-third", "strong-long-trump", "weak-long-trump", "ordinary"] as CommunicativeTrumpStructure[])
  .map((structure) => {
    const decisions = events.filter((event) => event.structure === structure);
    const openings = decisions.filter((event) => event.isOpening && event.action === "bid" && event.value !== null);
    const contractEvents = decisions.filter((event) => event.tookContract);
    return {
      structure,
      decisions: decisions.length,
      openings: openings.length,
      averageOpening: openings.length ? openings.reduce((sum, event) => sum + event.value!, 0) / openings.length : null,
      gameWinRateAroundDecision: decisions.length ? decisions.filter((event) => event.gameWon).length / decisions.length : null,
      contractsTaken: contractEvents.length,
      contractSuccessRate: contractEvents.length ? contractEvents.filter((event) => event.contractSucceeded).length / contractEvents.length : null,
      averageRoundDifferential: decisions.length ? decisions.reduce((sum, event) => sum + event.roundDifferential, 0) / decisions.length : null,
    };
  });

const document = {
  experiment: "Human bidding doctrine V2 communication versus official V1",
  generatedAt: new Date().toISOString(),
  settings: {
    scoringMode: CANONICAL_SCORING_MODE,
    targetScore: CANONICAL_TARGET_SCORE,
    totalGames,
    seeds,
    gamesPerSeed,
    pairedDeals: true,
    invertedSides: true,
    candidateCardEngine: candidate.card.kind,
    championCardEngine: champion.card.kind,
  },
  result: {
    candidate: { id: candidate.id, ...coreMetrics(candidateStats), confidence95: confidence95(candidateStats.wins, candidateStats.games) },
    champion: { id: champion.id, ...coreMetrics(championStats) },
    perSeed: batches.map((batch) => {
      const wins = batch.games.filter((game) => game.teamStrategies[game.winnerTeam] === candidate.id).length;
      return { seed: batch.seed, games: batch.games.length, wins, losses: batch.games.length - wins, winRate: wins / batch.games.length };
    }),
  },
  doctrineMetrics: {
    openingsCappedTo80ForProbing: events.filter((event) => event.probingCap80).length,
    partnerSupportedRaises: events.filter((event) => event.partnerSupportedRaise).length,
    singleMajorOpenings: events.filter((event) => event.isOpening && event.action === "bid" && (event.structure === "jack-only" || event.structure === "nine-only")).length,
    jackOnly: structures.find((entry) => entry.structure === "jack-only"),
    nineOnly: structures.find((entry) => entry.structure === "nine-only"),
    thirtyFourOpenings: events.filter((event) => event.isOpening && event.action === "bid" && event.structure === "thirty-four").length,
    jackNineThirdOpenings: events.filter((event) => event.isOpening && event.action === "bid" && event.structure === "jack-nine-third").length,
    averageOpeningByTrumpStructure: structures.map(({ structure, openings, averageOpening }) => ({ structure, openings, averageOpening })),
    structureResults: structures,
  },
  privacy: "Metrics and traces use only the acting hand, public auction, public score and posterior outcomes; no hidden hand feeds a decision.",
};

const json = JSON.stringify(document, null, 2);
console.log(json);
if (output) {
  const { writeFileSync } = await import("node:fs");
  writeFileSync(output, `${json}\n`, "utf8");
}
