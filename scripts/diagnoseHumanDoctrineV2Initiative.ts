import { cardId } from "@/engine/cards";
import { chooseHumanDoctrineBid } from "@/bots/strategy/humanDoctrine";
import { chooseHumanDoctrineV2Bid, type CommunicativeTrumpStructure } from "@/bots/strategy/humanDoctrineV2";
import { playerTeam } from "@/engine/rules";
import type { BidValue, GameState, PlayerId, TeamId } from "@/engine/types";
import { findBotStrategy, type BotStrategyDefinition, type StrategyBid } from "@/simulation/botRegistry";
import { normalizeStrategyBid, playTournamentGame, summarizeTournamentGames, type TournamentGame } from "@/simulation/tournament";

const output = process.argv.find((argument) => argument.startsWith("--output="))?.slice(9)
  ?? "reports/human-bidding-doctrine-v2-initiative-diagnostic.json";
const seeds = [20261001, 20262001, 20263001, 20264001];
const gamesPerSeed = 50;
const candidate = findBotStrategy("human_doctrine_v2_comm_mc_v1");
const champion = findBotStrategy("human_doctrine_v1_mc_v1");

type DecisionEvent = {
  gameIndex: number;
  roundNumber: number;
  team: TeamId;
  playerId: PlayerId;
  structure: CommunicativeTrumpStructure;
  trumpCount: number;
  outsideAces: number;
  protectedOutsideTens: number;
  outsideControls: number;
  isPartance: boolean;
  position: string;
  role: string;
  opponentContractPresent: boolean;
  partnerSupportPresent: boolean;
  intrinsicStrength: number;
  intrinsicBand: string;
  bidCeiling: BidValue | null;
  v1: string;
  v2: string;
  v2Capped80V1Higher: boolean;
  v2PassV1Bid: boolean;
  missedCompetitiveOvercall: boolean;
  ownHand: string[];
  publicBids: GameState["bids"];
  finalContractTeam: TeamId | null;
  finalContractValue: number | null;
  candidateTookContract: boolean;
  contractSucceeded: boolean | null;
};

type PendingEvent = Omit<DecisionEvent, "finalContractTeam" | "finalContractValue" | "candidateTookContract" | "contractSucceeded">;

function decisionLabel(decision: StrategyBid): string {
  return decision.action === "bid" ? `${decision.value}-${decision.trump}` : decision.action;
}

function strengthBand(value: number): string {
  if (value < 60) return "<60";
  if (value < 76) return "60-75";
  if (value < 94) return "76-93";
  if (value < 125) return "94-124";
  return "125+";
}

function captureDecision(state: GameState, gameIndex: number): PendingEvent {
  const v2Raw = chooseHumanDoctrineV2Bid(state);
  const v2 = normalizeStrategyBid(state, v2Raw);
  const v1 = normalizeStrategyBid(state, chooseHumanDoctrineBid(state));
  const evaluation = v2Raw.trace.intrinsic.evaluation;
  const auction = v2Raw.trace.auction;
  const opponentContractPresent = Boolean(auction.context.currentContract && auction.context.currentContract.teamId !== playerTeam(state.currentPlayerId));
  const v2Capped80V1Higher = v2.action === "bid" && v2.value === 80
    && v1.action === "bid" && Boolean(v1.value && v1.value > 80)
    && auction.ceiling.openingCap === 80;
  const v2PassV1Bid = v2.action === "pass" && v1.action === "bid";
  return {
    gameIndex,
    roundNumber: state.roundNumber,
    team: playerTeam(state.currentPlayerId),
    playerId: state.currentPlayerId,
    structure: evaluation.structure,
    trumpCount: evaluation.trumpQuantity,
    outsideAces: evaluation.outsideAces,
    protectedOutsideTens: evaluation.protectedOutsideTens,
    outsideControls: evaluation.outsideControlCount,
    isPartance: auction.context.isPartance,
    position: auction.context.biddingPosition,
    role: auction.context.auctionRole,
    opponentContractPresent,
    partnerSupportPresent: auction.partnerInference.supportKnown,
    intrinsicStrength: evaluation.intrinsicHandStrength,
    intrinsicBand: strengthBand(evaluation.intrinsicHandStrength),
    bidCeiling: auction.ceiling.value,
    v1: decisionLabel(v1),
    v2: decisionLabel(v2),
    v2Capped80V1Higher,
    v2PassV1Bid,
    missedCompetitiveOvercall: opponentContractPresent && v2PassV1Bid,
    ownHand: state.hands[state.currentPlayerId].map(cardId),
    publicBids: state.bids.map((bid) => ({ ...bid })),
  };
}

function resolveEvents(game: TournamentGame, pending: PendingEvent[]): DecisionEvent[] {
  return pending.map((event) => {
    const round = game.rounds[event.roundNumber - 1];
    const played = round?.result.kind === "played" ? round.result : null;
    const candidateTookContract = played?.contract.teamId === event.team;
    return {
      ...event,
      finalContractTeam: played?.contract.teamId ?? null,
      finalContractValue: played?.contract.value ?? null,
      candidateTookContract,
      contractSucceeded: candidateTookContract ? played?.contractSucceeded ?? null : null,
    };
  });
}

const games: TournamentGame[] = [];
const events: DecisionEvent[] = [];
let gameIndex = 0;
for (const seriesSeed of seeds) {
  for (let pair = 0; pair < gamesPerSeed / 2; pair += 1) {
    const dealSeed = seriesSeed + pair;
    for (const teams of [
      { 0: candidate, 1: champion },
      { 0: champion, 1: candidate },
    ] as Array<Record<TeamId, BotStrategyDefinition>>) {
      const pending: PendingEvent[] = [];
      const game = playTournamentGame({
        seed: dealSeed,
        teamStrategies: teams,
        onBidDecision: (state, strategy) => {
          if (strategy.id === candidate.id) pending.push(captureDecision(state, gameIndex));
        },
      });
      game.seriesSeed = seriesSeed;
      games.push(game);
      events.push(...resolveEvents(game, pending));
      gameIndex += 1;
    }
  }
}

type Bucket = {
  key: string;
  decisions: number;
  v2Bids: number;
  v1Bids: number;
  v2Capped80V1Higher: number;
  v2PassV1Bid: number;
  missedCompetitiveOvercall: number;
  candidateContractsTaken: number;
};

function bucketBy(label: string, keyFor: (event: DecisionEvent) => string | number | boolean | null): { dimension: string; buckets: Bucket[] } {
  const buckets = new Map<string, Bucket>();
  for (const event of events) {
    const key = String(keyFor(event));
    const bucket = buckets.get(key) ?? { key, decisions: 0, v2Bids: 0, v1Bids: 0, v2Capped80V1Higher: 0, v2PassV1Bid: 0, missedCompetitiveOvercall: 0, candidateContractsTaken: 0 };
    bucket.decisions += 1;
    if (event.v2 !== "pass") bucket.v2Bids += 1;
    if (event.v1 !== "pass") bucket.v1Bids += 1;
    if (event.v2Capped80V1Higher) bucket.v2Capped80V1Higher += 1;
    if (event.v2PassV1Bid) bucket.v2PassV1Bid += 1;
    if (event.missedCompetitiveOvercall) bucket.missedCompetitiveOvercall += 1;
    if (event.candidateTookContract) bucket.candidateContractsTaken += 1;
    buckets.set(key, bucket);
  }
  return { dimension: label, buckets: [...buckets.values()].sort((a, b) => b.decisions - a.decisions || a.key.localeCompare(b.key)) };
}

const defendedRoundKeys = new Set<string>();
const divergentDefendedRoundKeys = new Set<string>();
const competitiveMissRoundKeys = new Set<string>();
for (const event of events) {
  const key = `${event.gameIndex}:${event.roundNumber}`;
  if (event.finalContractTeam !== null && event.finalContractTeam !== event.team) {
    defendedRoundKeys.add(key);
    if (event.v2PassV1Bid) divergentDefendedRoundKeys.add(key);
    if (event.missedCompetitiveOvercall) competitiveMissRoundKeys.add(key);
  }
}

const stats = summarizeTournamentGames([candidate, champion], games);
const examples = (predicate: (event: DecisionEvent) => boolean) => events.filter(predicate).slice(0, 8);
const report = {
  sourceBenchmark: "reports/human-bidding-doctrine-v2-screening-200.json",
  replay: { scoringMode: "ffb", targetScore: 1000, games: games.length, seeds, pairedDeals: true, invertedSides: true },
  totals: {
    decisions: events.length,
    v2Bids: events.filter((event) => event.v2 !== "pass").length,
    v1WouldBid: events.filter((event) => event.v1 !== "pass").length,
    v2Capped80V1Higher: events.filter((event) => event.v2Capped80V1Higher).length,
    v2PassV1Bid: events.filter((event) => event.v2PassV1Bid).length,
    missedCompetitiveOvercalls: events.filter((event) => event.missedCompetitiveOvercall).length,
    defendedRounds: defendedRoundKeys.size,
    defendedRoundsWithV2PassV1Bid: divergentDefendedRoundKeys.size,
    defendedRoundsWithMissedCompetitiveOvercall: competitiveMissRoundKeys.size,
  },
  ranking: stats,
  buckets: [
    bucketBy("structure", (event) => event.structure),
    bucketBy("trumpCount", (event) => event.trumpCount),
    bucketBy("outsideAces", (event) => event.outsideAces),
    bucketBy("protectedOutsideTens", (event) => event.protectedOutsideTens),
    bucketBy("outsideControls", (event) => event.outsideControls),
    bucketBy("partance", (event) => event.isPartance),
    bucketBy("position", (event) => event.position),
    bucketBy("auctionRole", (event) => event.role),
    bucketBy("opponentContractPresent", (event) => event.opponentContractPresent),
    bucketBy("partnerSupportPresent", (event) => event.partnerSupportPresent),
    bucketBy("intrinsicStrength", (event) => event.intrinsicBand),
    bucketBy("bidCeiling", (event) => event.bidCeiling),
  ],
  examples: {
    capped80VersusHigherV1: examples((event) => event.v2Capped80V1Higher),
    passVersusV1Bid: examples((event) => event.v2PassV1Bid),
    missedCompetitiveOvercall: examples((event) => event.missedCompetitiveOvercall),
    highControlSingleMajorCapped: examples((event) =>
      (event.structure === "jack-only" || event.structure === "nine-only")
      && event.trumpCount >= 4 && event.outsideControls >= 2 && event.bidCeiling === 80),
  },
  privacy: "Examples contain only the acting hand and public auction. No real partner or opponent hand is retained.",
};

const json = JSON.stringify(report, null, 2);
const { writeFileSync } = await import("node:fs");
writeFileSync(output, `${json}\n`, "utf8");
console.log(JSON.stringify({ output, totals: report.totals, ranking: stats.map(({ id, wins, games: count, winRate, contractsTaken }) => ({ id, wins, games: count, winRate, contractsTaken })) }, null, 2));
