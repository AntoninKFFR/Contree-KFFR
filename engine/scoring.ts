import type { Contract, GameSettings, RoundResult, TeamId } from "./types";

const ZERO_POINTS: Record<TeamId, number> = { 0: 0, 1: 0 };

export function contractMultiplier(contract: Contract): 1 | 2 | 4 {
  if (contract.status === "surcoinched") return 4;
  if (contract.status === "coinched") return 2;
  return 1;
}

export function roundFfbScore(points: number): number {
  return Math.floor((points + 5) / 10) * 10;
}

function capotTeamFrom(tricksWonByTeam: Record<TeamId, number>): TeamId | null {
  if (tricksWonByTeam[0] === 8) return 0;
  if (tricksWonByTeam[1] === 8) return 1;
  return null;
}

function scoreFfb({
  belotePoints,
  capotTeam,
  contract,
  contractSucceeded,
  defenderTeam,
  multiplier,
  takerTeam,
  totalPoints,
}: {
  belotePoints: Record<TeamId, number>;
  capotTeam: TeamId | null;
  contract: Contract;
  contractSucceeded: boolean;
  defenderTeam: TeamId;
  multiplier: 1 | 2 | 4;
  takerTeam: TeamId;
  totalPoints: Record<TeamId, number>;
}): Record<TeamId, number> {
  const contractAmount = contract.value;
  const regulatoryBase = contract.kind === "capot" || capotTeam !== null ? 250 : 160;
  let raw: Record<TeamId, number>;

  if (contractSucceeded && multiplier === 1) {
    raw = {
      0: 0,
      1: 0,
      [takerTeam]: totalPoints[takerTeam] + contractAmount,
      [defenderTeam]: totalPoints[defenderTeam],
    };
  } else if (contractSucceeded) {
    raw = {
      0: 0,
      1: 0,
      [takerTeam]: (
        regulatoryBase
        + contractAmount
        + belotePoints[takerTeam]
      ) * multiplier,
      [defenderTeam]: belotePoints[defenderTeam],
    };
  } else {
    raw = {
      0: 0,
      1: 0,
      [takerTeam]: belotePoints[takerTeam],
      [defenderTeam]: (
        regulatoryBase
        + contractAmount
        + belotePoints[defenderTeam]
      ) * multiplier,
    };
  }

  return { 0: roundFfbScore(raw[0]), 1: roundFfbScore(raw[1]) };
}

export function scoreRound({
  belotePointsByTeam = ZERO_POINTS,
  contract,
  settings,
  trickPointsByTeam,
  tricksWonByTeam = ZERO_POINTS,
}: {
  /** Accepted only so historical callers remain readable; card-announcement points are ignored. */
  announcementPointsByTeam?: Record<TeamId, number>;
  belotePointsByTeam?: Record<TeamId, number>;
  contract: Contract;
  settings: GameSettings;
  trickPointsByTeam: Record<TeamId, number>;
  tricksWonByTeam?: Record<TeamId, number>;
}): Extract<RoundResult, { kind: "played" }> {
  const takerTeam = contract.teamId;
  const defenderTeam = takerTeam === 0 ? 1 : 0;
  const capotTeam = capotTeamFrom(tricksWonByTeam);
  const totalPointsByTeam: Record<TeamId, number> = {
    0: trickPointsByTeam[0] + belotePointsByTeam[0],
    1: trickPointsByTeam[1] + belotePointsByTeam[1],
  };
  const takerPoints = totalPointsByTeam[takerTeam];
  const defenderPoints = totalPointsByTeam[defenderTeam];
  const contractSucceeded = contract.kind === "capot"
    ? capotTeam === takerTeam
    : takerPoints >= contract.value && takerPoints > defenderPoints;
  const multiplier = contractMultiplier(contract);
  const contractScore = contract.value * multiplier;

  const roundScore: Record<TeamId, number> = settings.scoringMode === "ffb"
    ? scoreFfb({
        belotePoints: belotePointsByTeam,
        capotTeam,
        contract,
        contractSucceeded,
        defenderTeam,
        multiplier,
        takerTeam,
        totalPoints: totalPointsByTeam,
      })
    : settings.scoringMode === "announced-points"
      ? scoreAnnouncedPoints({ contractScore, contractSucceeded, defenderTeam, takerTeam })
      : scoreMadePoints({
          contractScore,
          contractSucceeded,
          defenderPoints,
          defenderTeam,
          takerPoints,
          takerTeam,
        });

  return {
    kind: "played",
    contract,
    takerPoints,
    defenderPoints,
    trickPointsByTeam: { ...trickPointsByTeam },
    announcementPointsByTeam: { ...ZERO_POINTS },
    belotePointsByTeam: { ...belotePointsByTeam },
    totalPointsByTeam,
    capotTeam,
    contractSucceeded,
    scoringMode: settings.scoringMode,
    multiplier,
    roundScore,
  };
}

function scoreAnnouncedPoints({
  contractScore,
  contractSucceeded,
  defenderTeam,
  takerTeam,
}: {
  contractScore: number;
  contractSucceeded: boolean;
  defenderTeam: TeamId;
  takerTeam: TeamId;
}): Record<TeamId, number> {
  return contractSucceeded
    ? { 0: 0, 1: 0, [takerTeam]: contractScore }
    : { 0: 0, 1: 0, [defenderTeam]: contractScore };
}

function scoreMadePoints({
  contractScore,
  contractSucceeded,
  defenderPoints,
  defenderTeam,
  takerPoints,
  takerTeam,
}: {
  contractScore: number;
  contractSucceeded: boolean;
  defenderPoints: number;
  defenderTeam: TeamId;
  takerPoints: number;
  takerTeam: TeamId;
}): Record<TeamId, number> {
  return contractSucceeded
    ? { 0: 0, 1: 0, [takerTeam]: takerPoints + contractScore, [defenderTeam]: defenderPoints }
    : { 0: 0, 1: 0, [defenderTeam]: 162 + contractScore };
}
