import { chooseHumanDoctrineBid, HUMAN_DOCTRINE_DEFAULT_OPTIONS } from "@/bots/strategy/humanDoctrine";
import { chooseHumanDoctrineV2Bid } from "@/bots/strategy/humanDoctrineV2";
import { cardId } from "@/engine/cards";
import { playerTeam } from "@/engine/rules";
import type { BidValue, GameState, TeamId } from "@/engine/types";
import { createHybridStrategy, findBotStrategy, type BotStrategyDefinition, type StrategyBid } from "@/simulation/botRegistry";
import {
  normalizeStrategyBid,
  playTournamentGame,
  summarizeTournamentGames,
  type BotTournamentStats,
  type TournamentGame,
} from "@/simulation/tournament";

const read = (name: string) => process.argv.find((argument) => argument.startsWith(`--${name}=`))?.slice(name.length + 3);
const variantId = read("variant") ?? "v2_no110";
const gamesPerSeed = Number(read("games") ?? 50);
const seeds = (read("seeds") ?? "20260909,20261909,20262909").split(",").map(Number);

const official = findBotStrategy("hybrid_legacy_v1");
const variants: Record<string, BotStrategyDefinition> = {
  v1: createHybridStrategy("human_doctrine_v1", "monte_carlo_v1", {
    id: "human_doctrine_v1_current",
    label: "Human doctrine V1 current + MC V1",
    status: "experimental",
  }),
  v2_no110: createHybridStrategy("human_doctrine_v2_no110", "monte_carlo_v1", {
    id: "human_doctrine_v2_no110",
    label: "Human doctrine V2 no 110 + MC V1",
    status: "experimental",
  }),
  v2_110: createHybridStrategy("human_doctrine_v2_110", "monte_carlo_v1", {
    id: "human_doctrine_v2_110",
    label: "Human doctrine V2 with 110 + MC V1",
    status: "experimental",
  }),
};
const variant = variants[variantId];
if (!variant) throw new Error(`Unknown V2 benchmark variant: ${variantId}`);
if (gamesPerSeed < 2 || gamesPerSeed % 2 !== 0) throw new Error("--games must be an even number >= 2 per seed.");

type HighLeverageEvent = {
  roundNumber: number;
  decisionTeam: TeamId;
  playerId: number;
  ownHand: string[];
  bids: GameState["bids"];
  score: GameState["totalScore"];
  v1: string;
  v1WithoutPenalty: string;
  v2: string;
  change: "v1-pass-v2-bid" | "trump" | "amount" | "other";
  finalContractTeam: TeamId | null;
  finalContractValue: BidValue | null;
  decisionTeamTookContract: boolean;
  contractSucceeded: boolean | null;
  roundImpact: number;
  gameWon: boolean;
};

function label(decision: StrategyBid): string {
  return decision.action === "bid" ? `${decision.value}-${decision.trump}` : decision.action;
}

function classify(v1: StrategyBid, v2: StrategyBid): HighLeverageEvent["change"] {
  if (v1.action !== "bid" && v2.action === "bid") return "v1-pass-v2-bid";
  if (v1.action === "bid" && v2.action === "bid" && v1.trump !== v2.trump) return "trump";
  if (v1.action === "bid" && v2.action === "bid" && v1.value !== v2.value) return "amount";
  return "other";
}

function collectPending(state: GameState) {
  const v1 = normalizeStrategyBid(state, chooseHumanDoctrineBid(state));
  const v1WithoutPenalty = normalizeStrategyBid(state, chooseHumanDoctrineBid(state, {
    ...HUMAN_DOCTRINE_DEFAULT_OPTIONS,
    opponentContractPenalty: false,
  }));
  if (label(v1) === label(v1WithoutPenalty)) return null;
  const v2Options = { allow110: variantId !== "v2_no110" };
  const v2 = normalizeStrategyBid(state, chooseHumanDoctrineV2Bid(state, v2Options));
  return {
    roundNumber: state.roundNumber,
    decisionTeam: playerTeam(state.currentPlayerId),
    playerId: state.currentPlayerId,
    ownHand: state.hands[state.currentPlayerId].map(cardId),
    bids: state.bids.map((bid) => ({ ...bid })),
    score: { ...state.totalScore },
    v1: label(v1),
    v1WithoutPenalty: label(v1WithoutPenalty),
    v2: label(v2),
    change: classify(v1, v2),
  };
}

function playOne(seed: number, teamStrategies: Record<TeamId, BotStrategyDefinition>) {
  const pending: Array<NonNullable<ReturnType<typeof collectPending>>> = [];
  const game = playTournamentGame({
    seed,
    teamStrategies,
    onBidDecision: (state) => {
      const event = collectPending(state);
      if (event) pending.push(event);
    },
  });
  const events: HighLeverageEvent[] = pending.map((event) => {
    const round = game.rounds[event.roundNumber - 1];
    const played = round?.result.kind === "played" ? round.result : null;
    const decisionTeamTookContract = played?.contract.teamId === event.decisionTeam;
    const opponent = event.decisionTeam === 0 ? 1 : 0;
    return {
      ...event,
      finalContractTeam: played?.contract.teamId ?? null,
      finalContractValue: played?.contract.value ?? null,
      decisionTeamTookContract,
      contractSucceeded: decisionTeamTookContract ? played?.contractSucceeded ?? null : null,
      roundImpact: round ? round.result.roundScore[event.decisionTeam] - round.result.roundScore[opponent] : 0,
      gameWon: game.winnerTeam === event.decisionTeam,
    };
  });
  return { game, events };
}

function pairedSeed(seed: number) {
  const games: TournamentGame[] = [];
  const events: HighLeverageEvent[] = [];
  for (let pair = 0; pair < gamesPerSeed / 2; pair += 1) {
    const dealSeed = seed + pair;
    for (const teams of [
      { 0: variant, 1: official },
      { 0: official, 1: variant },
    ] as Array<Record<TeamId, BotStrategyDefinition>>) {
      const result = playOne(dealSeed, teams);
      games.push(result.game);
      events.push(...result.events);
    }
  }
  return { seed, games, events };
}

function metrics(stats: BotTournamentStats) {
  const actions = stats.passes + stats.bids + stats.coinches + stats.surcoinches;
  const b80 = stats.bidLevels[80] ?? 0;
  const b90 = stats.bidLevels[90] ?? 0;
  const b100 = stats.bidLevels[100] ?? 0;
  const playedRounds = stats.attackRounds + stats.defenseRounds;
  return {
    id: stats.id,
    wins: stats.wins,
    games: stats.games,
    winRate: stats.winRate,
    averageScore: stats.averageScore,
    averageDifferential: stats.averageDifferential,
    passRate: actions ? stats.passes / actions : 0,
    actions,
    passes: stats.passes,
    contractsTaken: stats.contractsTaken,
    contractSuccessRate: stats.contractsTaken ? stats.contractsSucceeded / stats.contractsTaken : 0,
    contractsSucceeded: stats.contractsSucceeded,
    averageContract: stats.averageContract,
    bidDistribution: { 80: b80, 90: b90, 100: b100, "110+": stats.bids - b80 - b90 - b100 },
    trumpChanges: stats.trumpChanges,
    leavesContractToOpponentRate: playedRounds ? stats.defenseRounds / playedRounds : 0,
    attackRounds: stats.attackRounds,
    defenseRounds: stats.defenseRounds,
    averagePointsWhenTaking: stats.averageAttackScore,
    averagePointsWhenDefending: stats.averageDefenseScore,
    defensiveSetRate: stats.defensiveSetRate,
    defensiveSets: stats.defensiveSets,
  };
}

function confidence95(wins: number, games: number) {
  const p = wins / games;
  const margin = 1.96 * Math.sqrt(p * (1 - p) / games);
  return { low: Math.max(0, p - margin), high: Math.min(1, p + margin) };
}

function summarizeEvents(events: HighLeverageEvent[], allBidDecisions: number) {
  const takingEvents = events.filter((event) => event.decisionTeamTookContract);
  const succeeded = takingEvents.filter((event) => event.contractSucceeded).length;
  const lost = takingEvents.filter((event) => event.contractSucceeded === false).length;
  return {
    count: events.length,
    allBidDecisions,
    decisionRate: allBidDecisions ? events.length / allBidDecisions : 0,
    categories: {
      v1PassV2Bid: events.filter((event) => event.change === "v1-pass-v2-bid").length,
      trumpChange: events.filter((event) => event.change === "trump").length,
      amountChange: events.filter((event) => event.change === "amount").length,
      other: events.filter((event) => event.change === "other").length,
    },
    decisionTeamTookContract: takingEvents.length,
    contractsWon: succeeded,
    contractsLost: lost,
    roundImpactTotal: events.reduce((sum, event) => sum + event.roundImpact, 0),
    averageRoundImpact: events.length ? events.reduce((sum, event) => sum + event.roundImpact, 0) / events.length : 0,
    gameWins: events.filter((event) => event.gameWon).length,
    gameWinRate: events.length ? events.filter((event) => event.gameWon).length / events.length : 0,
    examples: events.slice(0, 8),
    privacy: "Only own hand and public state are exported; posterior outcome fields never feed a bot decision.",
  };
}

const batches = seeds.map(pairedSeed);
const games = batches.flatMap((batch) => batch.games);
const events = batches.flatMap((batch) => batch.events);
const stats = summarizeTournamentGames([variant, official], games);
const variantStats = stats.find((item) => item.id === variant.id)!;
const officialStats = stats.find((item) => item.id === official.id)!;

console.log(JSON.stringify({
  variant: variant.id,
  status: variant.status,
  seeds,
  gamesPerSeed,
  totalGames: games.length,
  pairedDealsAndSideInversion: true,
  cardEngine: "monte-carlo-v1",
  result: {
    wins: variantStats.wins,
    losses: variantStats.losses,
    winRate: variantStats.winRate,
    confidence95: confidence95(variantStats.wins, variantStats.games),
    variant: metrics(variantStats),
    official: metrics(officialStats),
    perSeed: batches.map((batch) => {
      const wins = batch.games.filter((game) => game.teamStrategies[game.winnerTeam] === variant.id).length;
      return { seed: batch.seed, games: batch.games.length, wins, losses: batch.games.length - wins, winRate: wins / batch.games.length };
    }),
  },
  highLeverageOpponentPenalty: summarizeEvents(
    events,
    variantStats.passes + variantStats.bids + variantStats.coinches + variantStats.surcoinches
      + officialStats.passes + officialStats.bids + officialStats.coinches + officialStats.surcoinches,
  ),
  promotion: "UNDECIDED_BY_TOOL; apply the project promotion rule to the final sample",
}, null, 2));
