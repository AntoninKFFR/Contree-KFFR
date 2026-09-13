import { playerTeam } from "./rules";
import { resolveGameRules } from "./rulesets/resolve";
import type { GameState, PlayerId, TeamId } from "./types";
import type { PlayerGameView } from "./views";

type PublicGameState = GameState | PlayerGameView;

const ZERO_POINTS: Record<TeamId, number> = { 0: 0, 1: 0 };

function publicAnnouncementPoints(state: PublicGameState): Record<TeamId, number> {
  const declarationsComplete = (state.announcements?.declaredPlayerIds.length ?? 0) >= 4;
  return declarationsComplete ? state.announcements?.pointsByTeam ?? ZERO_POINTS : ZERO_POINTS;
}

export function getPublicRoundPoints(state: PublicGameState): Record<TeamId, number> {
  const rules = resolveGameRules(state.settings);
  const announcements = rules.announcements.enabled ? publicAnnouncementPoints(state) : ZERO_POINTS;
  const belote = rules.belote.enabled ? state.belote?.pointsByTeam ?? ZERO_POINTS : ZERO_POINTS;
  return {
    0: state.trickPoints[0] + announcements[0] + belote[0],
    1: state.trickPoints[1] + announcements[1] + belote[1],
  };
}

export type ContractProgress = {
  takerTeam: TeamId;
  takerPoints: number;
  defenderPoints: number;
  target: number;
  pointsNeeded: number;
  label: string;
};

export function getContractProgress(state: PublicGameState): ContractProgress | null {
  if (!state.contract) return null;
  const contract = state.contract;
  const takerTeam = contract.teamId;
  const defenderTeam = takerTeam === 0 ? 1 : 0;
  if (contract.kind === "generale") {
    const personalTricks = state.completedTricks.filter((trick) => trick.winnerId === contract.playerId).length;
    return {
      takerTeam,
      takerPoints: personalTricks,
      defenderPoints: state.completedTricks.length - personalTricks,
      target: 8,
      pointsNeeded: Math.max(0, 8 - personalTricks),
      label: `${personalTricks} / 8 plis personnels`,
    };
  }
  if (contract.kind === "capot") {
    const teamTricks = state.completedTricks.filter((trick) => playerTeam(trick.winnerId) === takerTeam).length;
    return {
      takerTeam,
      takerPoints: teamTricks,
      defenderPoints: state.completedTricks.length - teamTricks,
      target: 8,
      pointsNeeded: Math.max(0, 8 - teamTricks),
      label: `${teamTricks} / 8 plis`,
    };
  }

  const rules = resolveGameRules(state.settings);
  const announcements = rules.announcements.enabled && rules.contractSuccess.announcementsCount
    ? publicAnnouncementPoints(state)
    : ZERO_POINTS;
  const belote = rules.belote.enabled ? state.belote?.pointsByTeam ?? ZERO_POINTS : ZERO_POINTS;
  const takerPoints = state.trickPoints[takerTeam]
    + announcements[takerTeam]
    + (rules.belote.countsForContractSuccess ? belote[takerTeam] : 0);
  const defenderPoints = state.trickPoints[defenderTeam]
    + announcements[defenderTeam]
    + (rules.belote.countsForContractFailure ? belote[defenderTeam] : 0);
  const bidNeed = rules.contractSuccess.mustReachBid ? contract.value - takerPoints : 0;
  const defenseNeed = rules.contractSuccess.mustBeatDefense ? defenderPoints + 1 - takerPoints : 0;
  const pointsNeeded = Math.max(0, bidNeed, defenseNeed);
  const target = rules.contractSuccess.mustReachBid ? contract.value : defenderPoints + 1;
  return {
    takerTeam,
    takerPoints,
    defenderPoints,
    target,
    pointsNeeded,
    label: pointsNeeded === 0
      ? `${takerPoints} pts · objectif atteint provisoirement`
      : `${takerPoints} pts · ${pointsNeeded} pts manquants`,
  };
}

export function tricksWonByPlayer(state: PublicGameState): Record<PlayerId, number> {
  return state.completedTricks.reduce<Record<PlayerId, number>>((counts, trick) => {
    counts[trick.winnerId] += 1;
    return counts;
  }, { 0: 0, 1: 0, 2: 0, 3: 0 });
}
