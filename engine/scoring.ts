import type { Contract, GameSettings, RoundResult, TeamId } from "./types";

export function contractMultiplier(contract: Contract): 1 | 2 | 4 {
  if (contract.status === "surcoinched") return 4;
  if (contract.status === "coinched") return 2;
  return 1;
}

export function scoreRound({
  contract,
  settings,
  trickPointsByTeam,
}: {
  contract: Contract;
  settings: GameSettings;
  trickPointsByTeam: Record<TeamId, number>;
}): Extract<RoundResult, { kind: "played" }> {
  const takerTeam = contract.teamId;
  const defenderTeam = takerTeam === 0 ? 1 : 0;
  const takerPoints = trickPointsByTeam[takerTeam];
  const defenderPoints = trickPointsByTeam[defenderTeam];
  const contractSucceeded = takerPoints >= contract.value;
  const multiplier = contractMultiplier(contract);
  const contractScore = contract.value * multiplier;

  const roundScore: Record<TeamId, number> =
    settings.scoringMode === "announced-points"
      ? scoreAnnouncedPoints({
          contractScore,
          contractSucceeded,
          defenderTeam,
          takerTeam,
        })
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
    ? {
        0: 0,
        1: 0,
        [takerTeam]: contractScore,
      }
    : {
        0: 0,
        1: 0,
        [defenderTeam]: contractScore,
      };
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
    ? {
        0: 0,
        1: 0,
        [takerTeam]: takerPoints + contractScore,
        [defenderTeam]: defenderPoints,
      }
    : {
        0: 0,
        1: 0,
        [defenderTeam]: 162 + contractScore,
      };
}
