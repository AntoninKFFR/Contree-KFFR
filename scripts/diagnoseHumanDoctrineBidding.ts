import { chooseSimpleBid as chooseLegacyBid } from "@/bots/heuristicBot 2";
import {
  HUMAN_DOCTRINE_DEFAULT_OPTIONS,
  chooseHumanDoctrineBid,
  type HumanDoctrineBidDecision,
  type HumanDoctrineOptions,
} from "@/bots/strategy/humanDoctrine";
import { cardId } from "@/engine/cards";
import { createInitialGame } from "@/engine/game";
import { createSeededRandom } from "@/engine/random";
import type { Bid, GameState, Suit } from "@/engine/types";
import {
  findBotStrategy,
  type BotStrategyDefinition,
  type StrategyBid,
} from "@/simulation/botRegistry";
import {
  normalizeStrategyBid,
  applyStrategyBid,
  runPairedMatchup,
  summarizeTournamentGames,
  type BotTournamentStats,
} from "@/simulation/tournament";

const read = (name: string) => process.argv.find((argument) => argument.startsWith(`--${name}=`))?.slice(name.length + 3);
const phase = read("phase") ?? "screen";
const gamesPerSeed = Number(read("games") ?? (phase === "final" ? 18 : 4));
const seeds = (read("seeds") ?? "20260909,20261909,20262909").split(",").map(Number);

type DiagnosticVariant = {
  id: string;
  label: string;
  options: HumanDoctrineOptions;
};

const options = (overrides: Partial<HumanDoctrineOptions>): HumanDoctrineOptions => ({
  ...HUMAN_DOCTRINE_DEFAULT_OPTIONS,
  ...overrides,
});

const variants: DiagnosticVariant[] = [
  {
    id: "doctrine_eval_legacy_thresholds",
    label: "Doctrine evaluation + legacy 54/70/86 thresholds",
    options: options({ thresholds: "legacy", allow110: false }),
  },
  {
    id: "doctrine_current",
    label: "Current human doctrine V1",
    options: options({}),
  },
  {
    id: "doctrine_no_opponent_penalty",
    label: "Doctrine without opponent-contract penalty",
    options: options({ opponentContractPenalty: false }),
  },
  {
    id: "doctrine_no_score_gap",
    label: "Doctrine without game-score gap adjustment",
    options: options({ scoreGapAdjustment: false }),
  },
  {
    id: "doctrine_no_partner_support",
    label: "Doctrine without partner support",
    options: options({ partnerSupport: false }),
  },
  {
    id: "doctrine_structural_only",
    label: "Dry nine / 34 / J+9+x only, legacy thresholds",
    options: options({
      thresholds: "legacy",
      allow110: false,
      outsideControls: false,
      handShape: false,
      partnerSupport: false,
      opponentContractPenalty: false,
      scoreGapAdjustment: false,
    }),
  },
  {
    id: "doctrine_structure_outside",
    label: "Structure + outside controls, legacy thresholds",
    options: options({
      thresholds: "legacy",
      allow110: false,
      handShape: false,
      partnerSupport: false,
      opponentContractPenalty: false,
      scoreGapAdjustment: false,
    }),
  },
  {
    id: "doctrine_full_no_110",
    label: "Full doctrine with current thresholds, capped at 100",
    options: options({ allow110: false }),
  },
];

const official = findBotStrategy("hybrid_legacy_v1");

function strategyFor(variant: DiagnosticVariant): BotStrategyDefinition {
  return {
    id: variant.id,
    label: variant.label,
    status: "diagnostic",
    bidding: { kind: "human-doctrine-v1", options: variant.options },
    card: { kind: "monte-carlo-v1" },
    biddingStrategyId: "human_doctrine_v1",
    cardStrategyId: "monte_carlo_v1",
  };
}

function metrics(stats: BotTournamentStats) {
  const bidActions = stats.passes + stats.bids + stats.coinches + stats.surcoinches;
  const bid80 = stats.bidLevels[80] ?? 0;
  const bid90 = stats.bidLevels[90] ?? 0;
  const bid100 = stats.bidLevels[100] ?? 0;
  const bid110Plus = stats.bids - bid80 - bid90 - bid100;
  const playedRounds = stats.attackRounds + stats.defenseRounds;
  return {
    id: stats.id,
    games: stats.games,
    wins: stats.wins,
    winRate: stats.winRate,
    averageScore: stats.averageScore,
    averageDifferential: stats.averageDifferential,
    passRate: bidActions ? stats.passes / bidActions : 0,
    contractsTaken: stats.contractsTaken,
    contractSuccessRate: stats.contractsTaken ? stats.contractsSucceeded / stats.contractsTaken : 0,
    averageContract: stats.averageContract,
    bidDistribution: { 80: bid80, 90: bid90, 100: bid100, "110+": bid110Plus },
    trumpChanges: stats.trumpChanges,
    trumpChangeRate: stats.bids ? stats.trumpChanges / stats.bids : 0,
    leavesContractToOpponentRate: playedRounds ? stats.defenseRounds / playedRounds : 0,
    averagePointsWhenTaking: stats.averageAttackScore,
    averagePointsWhenDefending: stats.averageDefenseScore,
    defensiveSetRate: stats.defensiveSetRate,
    averageBidMs: stats.averageBidMs,
  };
}

type DisagreementExample = {
  category: string;
  playerId: number;
  ownHand: string[];
  bids: Bid[];
  totalScore: GameState["totalScore"];
  legacy: string;
  doctrine: string;
  cause: {
    structure: string;
    trump: Suit;
    legacyScore: number;
    intrinsicScore: number;
    auctionScore: number;
    adjustments: HumanDoctrineBidDecision["evaluation"]["adjustments"];
  };
};

const disagreementCounts = new Map<string, number>();
const disagreementExamples = new Map<string, DisagreementExample[]>();
const ablationDecisionChanges = new Map(variants.map((variant) => [variant.id, 0]));
const seenStates = new Set<string>();
let auditedStates = 0;
let disagreements = 0;
const ALL_AUDIT_CATEGORIES = [
  "A_LEGACY_BID_DOCTRINE_PASS",
  "B_LEGACY_PASS_DOCTRINE_BID",
  "C_DIFFERENT_VALUE",
  "D_DIFFERENT_TRUMP",
  "E_DOCTRINE_110_LEGACY_100",
  "F_PARTNER_SUPPORT_EFFECT",
  "G_OPPONENT_PENALTY_EFFECT",
  "H_GAME_SCORE_EFFECT",
  "I_STRUCTURE_DRY_NINE",
  "I_STRUCTURE_THIRTY_FOUR",
  "I_STRUCTURE_JACK_NINE_THIRD",
  "I_STRUCTURE_LONG_TRUMP",
  "I_STRUCTURE_ORDINARY",
  "I_OUTSIDE_ACES",
  "I_PROTECTED_TENS",
  "I_LONG_SUITS",
  "I_VOIDS",
  "I_VULNERABLE_TO_CUTS",
] as const;

function bidLabel(decision: StrategyBid): string {
  if (decision.action !== "bid") return decision.action.toUpperCase();
  return `${decision.value} ${decision.trump}`;
}

function recordCategory(category: string, example: DisagreementExample) {
  disagreementCounts.set(category, (disagreementCounts.get(category) ?? 0) + 1);
  const examples = disagreementExamples.get(category) ?? [];
  if (examples.length < 2) examples.push(example);
  disagreementExamples.set(category, examples);
}

function auditState(state: GameState) {
  const publicKey = JSON.stringify({
    playerId: state.currentPlayerId,
    ownHand: state.hands[state.currentPlayerId].map(cardId).sort(),
    bids: state.bids,
    totalScore: state.totalScore,
    startingPlayerId: state.startingPlayerId,
  });
  if (seenStates.has(publicKey)) return;
  seenStates.add(publicKey);
  auditedStates += 1;

  const legacy = normalizeStrategyBid(state, chooseLegacyBid(state.hands[state.currentPlayerId]));
  const doctrineRaw = chooseHumanDoctrineBid(state);
  const doctrine = normalizeStrategyBid(state, doctrineRaw);
  const currentLabel = bidLabel(doctrine);
  for (const variant of variants) {
    const ablated = normalizeStrategyBid(state, chooseHumanDoctrineBid(state, variant.options));
    if (bidLabel(ablated) !== currentLabel) {
      ablationDecisionChanges.set(variant.id, (ablationDecisionChanges.get(variant.id) ?? 0) + 1);
    }
  }
  if (bidLabel(legacy) === currentLabel) return;
  disagreements += 1;

  const example: DisagreementExample = {
    category: "",
    playerId: state.currentPlayerId,
    ownHand: state.hands[state.currentPlayerId].map(cardId),
    bids: state.bids.map((bid) => ({ ...bid })),
    totalScore: { ...state.totalScore },
    legacy: bidLabel(legacy),
    doctrine: bidLabel(doctrine),
    cause: {
      structure: doctrineRaw.evaluation.structure,
      trump: doctrineRaw.evaluation.trump,
      legacyScore: doctrineRaw.evaluation.legacyScore,
      intrinsicScore: doctrineRaw.evaluation.intrinsicScore,
      auctionScore: doctrineRaw.evaluation.doctrineScore,
      adjustments: { ...doctrineRaw.evaluation.adjustments },
    },
  };
  const categories: string[] = [];
  if (legacy.action === "bid" && doctrine.action !== "bid") categories.push("A_LEGACY_BID_DOCTRINE_PASS");
  if (legacy.action !== "bid" && doctrine.action === "bid") categories.push("B_LEGACY_PASS_DOCTRINE_BID");
  if (legacy.action === "bid" && doctrine.action === "bid" && legacy.value !== doctrine.value) categories.push("C_DIFFERENT_VALUE");
  if (legacy.action === "bid" && doctrine.action === "bid" && legacy.trump !== doctrine.trump) categories.push("D_DIFFERENT_TRUMP");
  if (legacy.action === "bid" && doctrine.action === "bid" && legacy.value === 100 && doctrine.value === 110) categories.push("E_DOCTRINE_110_LEGACY_100");
  if (doctrineRaw.evaluation.adjustments.partnerSupport !== 0) categories.push("F_PARTNER_SUPPORT_EFFECT");
  if (doctrineRaw.evaluation.adjustments.opponentContract !== 0) categories.push("G_OPPONENT_PENALTY_EFFECT");
  if (doctrineRaw.evaluation.adjustments.scoreGap !== 0) categories.push("H_GAME_SCORE_EFFECT");
  categories.push(`I_STRUCTURE_${doctrineRaw.evaluation.structure.toUpperCase().replaceAll("-", "_")}`);
  if (doctrineRaw.evaluation.outsideAces) categories.push("I_OUTSIDE_ACES");
  if (doctrineRaw.evaluation.protectedOutsideTens) categories.push("I_PROTECTED_TENS");
  if (doctrineRaw.evaluation.longOutsideSuits.length) categories.push("I_LONG_SUITS");
  if (doctrineRaw.evaluation.voidSuits.length) categories.push("I_VOIDS");
  if (doctrineRaw.evaluation.vulnerableToCuts.length) categories.push("I_VULNERABLE_TO_CUTS");
  for (const category of categories) recordCategory(category, { ...example, category });
}

function summarizeDisagreements() {
  return {
    auditedStates,
    disagreements,
    disagreementRate: auditedStates ? disagreements / auditedStates : 0,
    ablationDecisionChanges: variants.map((variant) => ({
      id: variant.id,
      count: ablationDecisionChanges.get(variant.id) ?? 0,
      rate: auditedStates ? (ablationDecisionChanges.get(variant.id) ?? 0) / auditedStates : 0,
    })),
    categories: ALL_AUDIT_CATEGORIES
      .map((category) => ({ category, count: disagreementCounts.get(category) ?? 0, rateAmongDisagreements: disagreements ? (disagreementCounts.get(category) ?? 0) / disagreements : 0 }))
      .sort((first, second) => second.count - first.count),
    examples: Object.fromEntries(disagreementExamples),
    privacy: "Examples contain only the current player's own hand and public bidding/score context.",
  };
}

function playVariantAgainstOfficial(variant: DiagnosticVariant) {
  const strategy = strategyFor(variant);
  const games = seeds.flatMap((seed) => runPairedMatchup(
    strategy,
    official,
    gamesPerSeed,
    seed,
    300,
    (state) => auditState(state),
  ));
  const stats = summarizeTournamentGames([strategy, official], games);
  const variantStats = stats.find((item) => item.id === strategy.id)!;
  const officialStats = stats.find((item) => item.id === official.id)!;
  const wins = games.filter((game) => game.teamStrategies[game.winnerTeam] === strategy.id).length;
  return {
    id: variant.id,
    options: variant.options,
    games: games.length,
    directWins: wins,
    directWinRate: wins / games.length,
    variant: metrics(variantStats),
    official: metrics(officialStats),
    perSeed: seeds.map((seed) => {
      const seeded = games.filter((game) => game.seed >= seed && game.seed < seed + gamesPerSeed / 2);
      const seededWins = seeded.filter((game) => game.teamStrategies[game.winnerTeam] === strategy.id).length;
      return { seed, games: seeded.length, wins: seededWins, winRate: seeded.length ? seededWins / seeded.length : 0 };
    }),
  };
}

function screen() {
  const results = variants.map((variant) => {
    const result = playVariantAgainstOfficial(variant);
    console.error(`[screen] ${variant.id}: ${result.directWins}/${result.games}`);
    return result;
  });
  console.log(JSON.stringify({
    phase: "screen",
    seeds,
    gamesPerSeed,
    totalGames: results.reduce((sum, result) => sum + result.games, 0),
    baseline: { id: official.id, bidding: "legacy", cards: "monte-carlo-v1" },
    results: results.sort((first, second) => second.directWinRate - first.directWinRate),
    disagreements: summarizeDisagreements(),
  }, null, 2));
}

function audit() {
  const deals = Number(read("deals") ?? 5000);
  for (let deal = 0; deal < deals; deal += 1) {
    const seed = seeds[deal % seeds.length] + deal * 17;
    let state = createInitialGame(createSeededRandom(seed), { targetScore: 1000 });
    const scoreContext = deal % 3;
    state = {
      ...state,
      totalScore: scoreContext === 0 ? { 0: 0, 1: 0 } : scoreContext === 1 ? { 0: 0, 1: 300 } : { 0: 300, 1: 0 },
    };
    let decisions = 0;
    while (state.phase === "bidding" && decisions < 20) {
      auditState(state);
      const progression = deal % 2 === 0
        ? chooseLegacyBid(state.hands[state.currentPlayerId])
        : chooseHumanDoctrineBid(state);
      state = applyStrategyBid(state, progression);
      decisions += 1;
    }
  }
  console.log(JSON.stringify({
    phase: "audit",
    deals,
    seedBases: seeds,
    progressionPolicies: ["legacy", "human_doctrine_v1"],
    disagreements: summarizeDisagreements(),
  }, null, 2));
}

function finalTournament() {
  const requested = (read("finalists") ?? "").split(",").filter(Boolean);
  if (requested.length < 1 || requested.length > 4) {
    throw new Error("Final phase requires one to four diagnostic --finalists ids.");
  }
  const selected = requested.map((id) => {
    const variant = variants.find((candidate) => candidate.id === id);
    if (!variant) throw new Error(`Unknown diagnostic finalist: ${id}`);
    return strategyFor(variant);
  });
  const results = selected.map((strategy, finalistIndex) => {
    const batches = seeds.map((seed) => ({
      seed,
      games: runPairedMatchup(strategy, official, gamesPerSeed, seed + finalistIndex * 100_000),
    }));
    const games = batches.flatMap((batch) => batch.games);
    const stats = summarizeTournamentGames([strategy, official], games);
    const directWins = games.filter((game) => game.teamStrategies[game.winnerTeam] === strategy.id).length;
    console.error(`[final] ${strategy.id}: ${directWins}/${games.length}`);
    return {
      id: strategy.id,
      games: games.length,
      directWins,
      directWinRate: directWins / games.length,
      variant: metrics(stats.find((item) => item.id === strategy.id)!),
      official: metrics(stats.find((item) => item.id === official.id)!),
      perSeed: batches.map((batch) => {
        const wins = batch.games.filter((game) => game.teamStrategies[game.winnerTeam] === strategy.id).length;
        return { seed: batch.seed, games: batch.games.length, wins, winRate: wins / batch.games.length };
      }),
    };
  });
  console.log(JSON.stringify({
    phase: "final",
    seeds,
    gamesPerSeedPerFinalist: gamesPerSeed,
    gamesPerFinalist: gamesPerSeed * seeds.length,
    totalGames: gamesPerSeed * seeds.length * selected.length,
    invariant: "Every finalist plays the official legacy bidder on paired deals with side inversion; all card play is Monte Carlo V1.",
    results: results.sort((first, second) => second.directWinRate - first.directWinRate),
    promotion: "NONE: diagnostic phase only",
  }, null, 2));
}

if (phase === "audit") audit();
else if (phase === "screen") screen();
else if (phase === "final") finalTournament();
else throw new Error(`Unknown phase: ${phase}`);
