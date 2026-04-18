import { BOT_PROFILES, type BotProfileId } from "@/bots/profiles";
import type { Bid, BidValue, RoundResult, TeamId } from "@/engine/types";

export type TeamProfiles = Record<TeamId, BotProfileId>;

export type SimulationRoundRecord = {
  result: RoundResult;
  bids: Bid[];
  tricksWon: Record<TeamId, number>;
  teamProfiles: TeamProfiles;
};

export type SimulationGameRecord = {
  winnerTeam: TeamId;
  totalScore: Record<TeamId, number>;
  rounds: SimulationRoundRecord[];
  teamProfiles: TeamProfiles;
};

type ProfileStats = {
  games: number;
  wins: number;
  totalGameScore: number;
  rounds: number;
  attackRounds: number;
  defenseRounds: number;
  attackScore: number;
  defenseScore: number;
  contractsAttempted: number;
  contractsSucceeded: number;
  contractsFailed: number;
};

export type SimulationSummary = {
  games: number;
  rounds: number;
  wins: Record<TeamId, number>;
  totalScore: Record<TeamId, number>;
  totalRoundScore: Record<TeamId, number>;
  tricksWon: Record<TeamId, number>;
  contractsAttempted: number;
  contractsSucceeded: number;
  contractsFailed: number;
  totalContractValue: number;
  bidLevels: Partial<Record<BidValue, number>>;
  coinchesAttempted: number;
  coinchesSucceeded: number;
  coinchesNotProfitable: number;
  surcoinchesAttempted: number;
  profileStats: Record<BotProfileId, ProfileStats>;
};

function emptyProfileStats(): Record<BotProfileId, ProfileStats> {
  return Object.fromEntries(
    Object.keys(BOT_PROFILES).map((profileId) => [profileId, createProfileStats()]),
  ) as Record<BotProfileId, ProfileStats>;
}

function createProfileStats(): ProfileStats {
  return {
    games: 0,
    wins: 0,
    totalGameScore: 0,
    rounds: 0,
    attackRounds: 0,
    defenseRounds: 0,
    attackScore: 0,
    defenseScore: 0,
    contractsAttempted: 0,
    contractsSucceeded: 0,
    contractsFailed: 0,
  };
}

export function createEmptySummary(): SimulationSummary {
  return {
    games: 0,
    rounds: 0,
    wins: { 0: 0, 1: 0 },
    totalScore: { 0: 0, 1: 0 },
    totalRoundScore: { 0: 0, 1: 0 },
    tricksWon: { 0: 0, 1: 0 },
    contractsAttempted: 0,
    contractsSucceeded: 0,
    contractsFailed: 0,
    totalContractValue: 0,
    bidLevels: {},
    coinchesAttempted: 0,
    coinchesSucceeded: 0,
    coinchesNotProfitable: 0,
    surcoinchesAttempted: 0,
    profileStats: emptyProfileStats(),
  };
}

function addProfileGame(summary: SimulationSummary, game: SimulationGameRecord, teamId: TeamId) {
  const profile = game.teamProfiles[teamId];
  const stats = summary.profileStats[profile];

  stats.games += 1;
  stats.totalGameScore += game.totalScore[teamId];
  if (game.winnerTeam === teamId) stats.wins += 1;
}

function addProfileRound(
  summary: SimulationSummary,
  round: SimulationRoundRecord,
  teamId: TeamId,
) {
  const profile = round.teamProfiles[teamId];
  const stats = summary.profileStats[profile];
  const roundScore = round.result.roundScore[teamId];

  stats.rounds += 1;

  if (round.result.kind === "played") {
    const isAttacking = round.result.contract.teamId === teamId;
    if (isAttacking) {
      stats.attackRounds += 1;
      stats.attackScore += roundScore;
      stats.contractsAttempted += 1;
      if (round.result.contractSucceeded) stats.contractsSucceeded += 1;
      else stats.contractsFailed += 1;
    } else {
      stats.defenseRounds += 1;
      stats.defenseScore += roundScore;
    }
  }
}

function addBids(summary: SimulationSummary, bids: Bid[]) {
  for (const bid of bids) {
    if (bid.action === "bid") {
      summary.bidLevels[bid.value] = (summary.bidLevels[bid.value] ?? 0) + 1;
    }
  }
}

export function addGameToSummary(
  summary: SimulationSummary,
  game: SimulationGameRecord,
): SimulationSummary {
  const next = summary;

  next.games += 1;
  next.wins[game.winnerTeam] += 1;

  for (const teamId of [0, 1] as TeamId[]) {
    next.totalScore[teamId] += game.totalScore[teamId];
    addProfileGame(next, game, teamId);
  }

  for (const round of game.rounds) {
    next.rounds += 1;
    addBids(next, round.bids);

    for (const teamId of [0, 1] as TeamId[]) {
      next.totalRoundScore[teamId] += round.result.roundScore[teamId];
      next.tricksWon[teamId] += round.tricksWon[teamId];
      addProfileRound(next, round, teamId);
    }

    if (round.result.kind === "played") {
      const { contract, contractSucceeded } = round.result;
      next.contractsAttempted += 1;
      next.totalContractValue += contract.value;
      if (contractSucceeded) next.contractsSucceeded += 1;
      else next.contractsFailed += 1;

      if (contract.status === "coinched" || contract.status === "surcoinched") {
        next.coinchesAttempted += 1;
        if (!contractSucceeded) next.coinchesSucceeded += 1;
        else next.coinchesNotProfitable += 1;
      }

      if (contract.status === "surcoinched") {
        next.surcoinchesAttempted += 1;
      }
    }
  }

  return next;
}

function percent(value: number, total: number): string {
  if (total === 0) return "0.0%";
  return `${((value / total) * 100).toFixed(1)}%`;
}

function average(value: number, total: number): string {
  if (total === 0) return "0.0";
  return (value / total).toFixed(1);
}

export function formatSimulationSummary(summary: SimulationSummary): string {
  const lines: string[] = [];

  lines.push("Simulation bots coinche / contree");
  lines.push("");
  lines.push(`Parties simulees: ${summary.games}`);
  lines.push(`Manches jouees: ${summary.rounds}`);
  lines.push(
    `Victoires equipe 0: ${summary.wins[0]} (${percent(summary.wins[0], summary.games)})`,
  );
  lines.push(
    `Victoires equipe 1: ${summary.wins[1]} (${percent(summary.wins[1], summary.games)})`,
  );
  lines.push(
    `Score moyen par partie: equipe 0 ${average(summary.totalScore[0], summary.games)} | equipe 1 ${average(summary.totalScore[1], summary.games)}`,
  );
  lines.push(
    `Score moyen par manche: equipe 0 ${average(summary.totalRoundScore[0], summary.rounds)} | equipe 1 ${average(summary.totalRoundScore[1], summary.rounds)}`,
  );
  lines.push(
    `Plis moyens gagnes par manche: equipe 0 ${average(summary.tricksWon[0], summary.rounds)} | equipe 1 ${average(summary.tricksWon[1], summary.rounds)}`,
  );
  lines.push("");
  lines.push("Contrats");
  lines.push(`Contrats tentes: ${summary.contractsAttempted}`);
  lines.push(`Contrats reussis: ${summary.contractsSucceeded}`);
  lines.push(`Contrats chutes: ${summary.contractsFailed}`);
  lines.push(
    `Taux de reussite: ${percent(summary.contractsSucceeded, summary.contractsAttempted)}`,
  );
  lines.push(
    `Annonce moyenne: ${average(summary.totalContractValue, summary.contractsAttempted)}`,
  );
  lines.push(`Coinches tentees: ${summary.coinchesAttempted}`);
  lines.push(`Coinches reussies: ${summary.coinchesSucceeded}`);
  lines.push(`Coinches non rentables: ${summary.coinchesNotProfitable}`);
  lines.push(`Surcoinches tentees: ${summary.surcoinchesAttempted}`);
  lines.push("");
  lines.push("Repartition des annonces");

  for (const value of [80, 90, 100, 110, 120, 130, 140, 150, 160] as BidValue[]) {
    lines.push(`${value}: ${summary.bidLevels[value] ?? 0}`);
  }

  lines.push("");
  lines.push("Profils");

  for (const profileId of Object.keys(BOT_PROFILES) as BotProfileId[]) {
    const profile = BOT_PROFILES[profileId];
    const stats = summary.profileStats[profileId];
    lines.push(
      `${profile.label}: victoires ${stats.wins}/${stats.games} (${percent(stats.wins, stats.games)}), score moyen ${average(stats.totalGameScore, stats.games)}, attaque ${average(stats.attackScore, stats.attackRounds)}, defense ${average(stats.defenseScore, stats.defenseRounds)}, contrats ${stats.contractsSucceeded}/${stats.contractsAttempted}`,
    );
  }

  return lines.join("\n");
}
