import { detectAnnouncements } from "@/engine/announcements";
import { playableCardsForCurrentPlayer } from "@/engine/game";
import { resolveContractMode } from "@/engine/contractMode";
import { playerTeam } from "@/engine/rules";
import { cloneRulesetSnapshot, CONTREE_KFFR_RULESET, freezeRulesetSnapshot } from "@/engine/rulesets/presets";
import type { GameRulesetSnapshot } from "@/engine/rulesets/types";
import type { CardAnnouncement, GameState, TeamId } from "@/engine/types";
import { ADVANCED_RULES_STRATEGY, OFFICIAL_RULES_BASELINE_STRATEGY, type BotStrategyDefinition } from "@/simulation/botRegistry";
import { playTournamentGame, type TournamentGame } from "@/simulation/tournament";

type Variant = { name: string; rules: GameRulesetSnapshot };
type MutableRuleset = { -readonly [K in keyof GameRulesetSnapshot]: GameRulesetSnapshot[K] };
type Kind = "suit" | "no-trump" | "all-trump" | "capot" | "generale";
type ModeCount = { requested: number; succeeded: number };
type StrategyMetrics = {
  games: number; wins: number; totalScore: number; totalDifferential: number; rounds: number; contracts: Record<Kind, ModeCount>;
  contractValueTotal: number; failedContractShortfallTotal: number; failedContracts: number;
  defenseRounds: number; defensiveSets: number;
  coinches: Record<Kind, number>; successfulCoinches: Record<Kind, number>; surcoinches: Record<Kind, number>;
  announcementPoints: number; takerAnnouncements: Record<CardAnnouncement["type"], ModeCount>;
  attackTrumpLeads: number; voluntaryDefenseTrumpLeads: number; defensiveSetAfterTrumpLead: number;
  bidMs: number[]; cardMs: number[]; cpuMs: number;
};

function parsePairs(): number {
  const raw = process.argv.find((arg) => arg.startsWith("--pairs="))?.slice(8) ?? "4";
  const count = Number(raw);
  if (!Number.isInteger(count) || count < 1 || count > 500) throw new Error("--pairs must be an integer from 1 to 500.");
  return count;
}

function variant(name: string, edit: (rules: MutableRuleset) => void): Variant {
  const rules = cloneRulesetSnapshot(CONTREE_KFFR_RULESET) as MutableRuleset;
  rules.id = `benchmark-${name}`;
  edit(rules);
  return { name, rules: freezeRulesetSnapshot(rules) };
}

const variants: Variant[] = [
  { name: "classic-reference", rules: CONTREE_KFFR_RULESET },
  variant("announcements", (rules) => {
    rules.announcements = { enabled: true, tierce: true, fifty: true, hundred: true, squares: true };
    rules.contractSuccess = { ...rules.contractSuccess, announcementsCount: true };
  }),
  variant("no-trump", (rules) => { rules.bidding = { ...rules.bidding, allowNoTrump: true }; }),
  variant("all-trump", (rules) => { rules.bidding = { ...rules.bidding, allowAllTrump: true }; }),
  variant("capot-expanded", (rules) => { rules.bidding = { ...rules.bidding, allowCapot: true, allowNoTrump: true, allowAllTrump: true }; }),
  variant("generale", (rules) => { rules.bidding = { ...rules.bidding, allowGenerale: true }; }),
  variant("all-compatible", (rules) => {
    rules.bidding = { ...rules.bidding, allowNoTrump: true, allowAllTrump: true, allowCapot: true,
      allowGenerale: true, generaleAllowNoTrump: true, generaleAllowAllTrump: true };
    rules.announcements = { enabled: true, tierce: true, fifty: true, hundred: true, squares: true };
    rules.contractSuccess = { ...rules.contractSuccess, announcementsCount: true };
    rules.belote = { ...rules.belote, allowInAllTrump: true };
  }),
];

function emptyModeCount(): Record<Kind, ModeCount> {
  return Object.fromEntries((["suit", "no-trump", "all-trump", "capot", "generale"] as Kind[])
    .map((kind) => [kind, { requested: 0, succeeded: 0 }])) as Record<Kind, ModeCount>;
}

function emptyMetrics(): StrategyMetrics {
  return {
    games: 0, wins: 0, totalScore: 0, totalDifferential: 0, rounds: 0, contracts: emptyModeCount(),
    contractValueTotal: 0, failedContractShortfallTotal: 0, failedContracts: 0,
    defenseRounds: 0, defensiveSets: 0,
    coinches: { suit: 0, "no-trump": 0, "all-trump": 0, capot: 0, generale: 0 },
    successfulCoinches: { suit: 0, "no-trump": 0, "all-trump": 0, capot: 0, generale: 0 },
    surcoinches: { suit: 0, "no-trump": 0, "all-trump": 0, capot: 0, generale: 0 },
    announcementPoints: 0,
    takerAnnouncements: { tierce: { requested: 0, succeeded: 0 }, fifty: { requested: 0, succeeded: 0 },
      hundred: { requested: 0, succeeded: 0 }, square: { requested: 0, succeeded: 0 } },
    attackTrumpLeads: 0, voluntaryDefenseTrumpLeads: 0, defensiveSetAfterTrumpLead: 0,
    bidMs: [], cardMs: [], cpuMs: 0,
  };
}

function contractKind(contract: NonNullable<GameState["contract"]>): Kind {
  if (contract.kind === "capot" || contract.kind === "generale") return contract.kind;
  return resolveContractMode(contract)?.kind ?? "suit";
}

function percentile(values: number[], fraction: number): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * fraction) - 1)];
}

function mean(values: number[]): number {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function rounded(value: number): number { return Math.round(value * 100) / 100; }

function finalize(metrics: StrategyMetrics) {
  return {
    games: metrics.games, wins: metrics.wins, winRate: rounded(metrics.wins / metrics.games),
    averageScore: rounded(metrics.totalScore / metrics.games),
    averageDifferential: rounded(metrics.totalDifferential / metrics.games),
    rounds: metrics.rounds, contracts: metrics.contracts, coinches: metrics.coinches,
    averageContract: rounded(metrics.contractValueTotal / Math.max(1, Object.values(metrics.contracts).reduce((sum, item) => sum + item.requested, 0))),
    averageFailedContractShortfall: rounded(metrics.failedContractShortfallTotal / Math.max(1, metrics.failedContracts)),
    defenseRounds: metrics.defenseRounds,
    defensiveSets: metrics.defensiveSets,
    defensiveSetRate: rounded(metrics.defensiveSets / Math.max(1, metrics.defenseRounds)),
    successfulCoinches: metrics.successfulCoinches,
    surcoinches: metrics.surcoinches, announcementPoints: metrics.announcementPoints,
    takerAnnouncements: metrics.takerAnnouncements, attackTrumpLeads: metrics.attackTrumpLeads,
    voluntaryDefenseTrumpLeads: metrics.voluntaryDefenseTrumpLeads,
    defensiveSetAfterTrumpLead: metrics.defensiveSetAfterTrumpLead,
    bidMs: { mean: rounded(mean(metrics.bidMs)), p95: rounded(percentile(metrics.bidMs, 0.95)), p99: rounded(percentile(metrics.bidMs, 0.99)) },
    cardMs: { mean: rounded(mean(metrics.cardMs)), p95: rounded(percentile(metrics.cardMs, 0.95)), p99: rounded(percentile(metrics.cardMs, 0.99)) },
    cpuMsPerGame: rounded(metrics.cpuMs / metrics.games),
  };
}

function recordGame(
  game: TournamentGame,
  teamStrategies: Record<TeamId, BotStrategyDefinition>,
  metrics: Record<string, StrategyMetrics>,
  leads: Array<{ strategy: string; round: number; defense: boolean; voluntaryTrump: boolean; attackTrump: boolean }>,
  takerTypes: Map<number, CardAnnouncement["type"][]>,
) {
  for (const team of [0, 1] as TeamId[]) {
    const stats = metrics[teamStrategies[team].id];
    stats.games += 1;
    stats.totalScore += game.totalScore[team];
    stats.totalDifferential += game.totalScore[team] - game.totalScore[team === 0 ? 1 : 0];
    if (game.winnerTeam === team) stats.wins += 1;
  }
  for (let index = 0; index < game.rounds.length; index += 1) {
    const round = game.rounds[index];
    if (round.result.kind !== "played") continue;
    const contract = round.result.contract;
    const takerStrategy = teamStrategies[contract.teamId].id;
    const taker = metrics[takerStrategy];
    const kind = contractKind(contract);
    taker.contracts[kind].requested += 1;
    taker.contractValueTotal += contract.value;
    if (round.result.contractSucceeded) taker.contracts[kind].succeeded += 1;
    else {
      taker.failedContracts += 1;
      if (contract.kind !== "capot" && contract.kind !== "generale") {
        taker.failedContractShortfallTotal += Math.max(0, contract.value - round.result.totalPointsByTeam[contract.teamId]);
      }
    }
    const defender = metrics[teamStrategies[contract.teamId === 0 ? 1 : 0].id];
    defender.defenseRounds += 1;
    if (!round.result.contractSucceeded) defender.defensiveSets += 1;
    if (contract.status === "coinched" || contract.status === "surcoinched") {
      defender.coinches[kind] += 1;
      if (!round.result.contractSucceeded) defender.successfulCoinches[kind] += 1;
    }
    if (contract.status === "surcoinched") taker.surcoinches[kind] += 1;
    for (const type of new Set(takerTypes.get(index + 1) ?? [])) {
      taker.takerAnnouncements[type].requested += 1;
      if (round.result.contractSucceeded) taker.takerAnnouncements[type].succeeded += 1;
    }
    for (const team of [0, 1] as TeamId[]) {
      const stats = metrics[teamStrategies[team].id];
      stats.rounds += 1;
      stats.announcementPoints += round.result.announcementPointsByTeam[team];
    }
  }
  for (const lead of leads) {
    const stats = metrics[lead.strategy];
    if (lead.attackTrump) stats.attackTrumpLeads += 1;
    if (lead.defense && lead.voluntaryTrump) {
      stats.voluntaryDefenseTrumpLeads += 1;
      const round = game.rounds[lead.round - 1];
      if (round?.result.kind === "played" && !round.result.contractSucceeded) stats.defensiveSetAfterTrumpLead += 1;
    }
  }
  for (const timing of game.timings) {
    const stats = metrics[timing.strategyId];
    if (!stats) continue;
    (timing.kind === "bid" ? stats.bidMs : stats.cardMs).push(timing.elapsedMs);
    stats.cpuMs += timing.cpuMs;
  }
}

const pairs = parsePairs();
const variantFilter = process.argv.find((arg) => arg.startsWith("--variant="))?.slice(10);
if (variantFilter && !variants.some((entry) => entry.name === variantFilter)) {
  throw new Error(`Unknown variant: ${variantFilter}.`);
}
const result: Record<string, unknown> = {};
for (const [variantIndex, entry] of variants.entries()) {
  if (variantFilter && entry.name !== variantFilter) continue;
  const metrics = {
    [OFFICIAL_RULES_BASELINE_STRATEGY.id]: emptyMetrics(),
    [ADVANCED_RULES_STRATEGY.id]: emptyMetrics(),
  };
  const seedBase = 20260917 + variantIndex * 1000;
  for (let pair = 0; pair < pairs; pair += 1) {
    const seed = seedBase + pair;
    for (const teamStrategies of [
      { 0: OFFICIAL_RULES_BASELINE_STRATEGY, 1: ADVANCED_RULES_STRATEGY },
      { 0: ADVANCED_RULES_STRATEGY, 1: OFFICIAL_RULES_BASELINE_STRATEGY },
    ] as Array<Record<TeamId, BotStrategyDefinition>>) {
      const leads: Parameters<typeof recordGame>[3] = [];
      const takerTypes = new Map<number, CardAnnouncement["type"][]>();
      const game = playTournamentGame({
        seed, teamStrategies, settings: { ruleset: entry.rules },
        onCardDecision: (state, strategy, card) => {
          if (!takerTypes.has(state.roundNumber) && state.contract && entry.rules.announcements.enabled) {
            const mode = resolveContractMode(state.contract)!;
            takerTypes.set(state.roundNumber, detectAnnouncements(
              state.hands[state.contract.playerId], state.contract.playerId, mode, entry.rules.announcements,
            ).map((announcement) => announcement.type));
          }
          if (state.currentTrick.cards.length !== 0 || !state.contract || !state.trump) return;
          const defense = state.contract.teamId !== playerTeam(state.currentPlayerId);
          const trump = card.suit === state.trump;
          const voluntaryTrump = trump && playableCardsForCurrentPlayer(state).some((legal) => legal.suit !== state.trump);
          leads.push({ strategy: strategy.id, round: state.roundNumber, defense, voluntaryTrump, attackTrump: !defense && trump });
        },
      });
      recordGame(game, teamStrategies, metrics, leads, takerTypes);
    }
    console.error(`${entry.name}: ${pair + 1}/${pairs} paired seeds`);
  }
  result[entry.name] = {
    seedBase, pairedSeeds: pairs, games: pairs * 2,
    official: finalize(metrics[OFFICIAL_RULES_BASELINE_STRATEGY.id]),
    candidate: finalize(metrics[ADVANCED_RULES_STRATEGY.id]),
  };
}
console.log(JSON.stringify({ generatedAt: new Date().toISOString(), reference: "official V3.1 + current special dispatch", candidate: ADVANCED_RULES_STRATEGY.id, variants: result }, null, 2));
