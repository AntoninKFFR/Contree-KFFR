import type { Contract, GameSettings, RoundResult, TeamId } from "./types";
import { CONTREE_KFFR_RULESET } from "./rulesets/presets";
import { resolveGameRules } from "./rulesets/resolve";
import type { GameRulesetSnapshot } from "./rulesets/types";

const ZERO_POINTS: Record<TeamId, number> = { 0: 0, 1: 0 };

export function contractMultiplier(
  contract: Contract,
  rules: GameRulesetSnapshot["scoring"] = CONTREE_KFFR_RULESET.scoring,
): number {
  if (contract.status === "surcoinched") return rules.surcoincheMultiplier;
  if (contract.status === "coinched") return rules.coincheMultiplier;
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
  rules,
}: {
  belotePoints: Record<TeamId, number>;
  capotTeam: TeamId | null;
  contract: Contract;
  contractSucceeded: boolean;
  defenderTeam: TeamId;
  multiplier: number;
  takerTeam: TeamId;
  totalPoints: Record<TeamId, number>;
  rules: GameRulesetSnapshot;
}): Record<TeamId, number> {
  const contractAmount = contract.value;
  const regulatoryBase = contract.kind === "capot" || capotTeam !== null
    ? rules.scoring.capotBasePoints
    : rules.scoring.failureBasePoints;
  const takerBelote = rules.belote.enabled ? belotePoints[takerTeam] : 0;
  const defenderBelote = rules.belote.enabled ? belotePoints[defenderTeam] : 0;
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
        + takerBelote
      ) * multiplier,
      [defenderTeam]: defenderBelote,
    };
  } else {
    raw = {
      0: 0,
      1: 0,
      [takerTeam]: rules.belote.countsForContractFailure ? takerBelote : 0,
      [defenderTeam]: (
        regulatoryBase
        + contractAmount
        + defenderBelote
      ) * multiplier,
    };
  }

  return rules.scoring.roundToTen
    ? { 0: roundFfbScore(raw[0]), 1: roundFfbScore(raw[1]) }
    : raw;
}

export function scoreRound({
  belotePointsByTeam = ZERO_POINTS,
  contract,
  settings,
  rules: explicitRules,
  trickPointsByTeam,
  tricksWonByTeam = ZERO_POINTS,
}: {
  /** Accepted only so historical callers remain readable; card-announcement points are ignored. */
  announcementPointsByTeam?: Record<TeamId, number>;
  belotePointsByTeam?: Record<TeamId, number>;
  contract: Contract;
  settings: GameSettings;
  rules?: GameRulesetSnapshot;
  trickPointsByTeam: Record<TeamId, number>;
  tricksWonByTeam?: Record<TeamId, number>;
}): Extract<RoundResult, { kind: "played" }> {
  const rules = explicitRules
    ? resolveGameRules({ ruleset: explicitRules })
    : resolveGameRules(settings);
  const takerTeam = contract.teamId;
  const defenderTeam = takerTeam === 0 ? 1 : 0;
  const capotTeam = capotTeamFrom(tricksWonByTeam);
  const awardedBelotePoints: Record<TeamId, number> = rules.belote.enabled
    ? { ...belotePointsByTeam }
    : { ...ZERO_POINTS };
  const totalPointsByTeam: Record<TeamId, number> = {
    0: trickPointsByTeam[0] + awardedBelotePoints[0],
    1: trickPointsByTeam[1] + awardedBelotePoints[1],
  };
  const contractPointsByTeam: Record<TeamId, number> = {
    0: trickPointsByTeam[0] + (rules.belote.countsForContractSuccess ? awardedBelotePoints[0] : 0),
    1: trickPointsByTeam[1] + (rules.belote.countsForContractSuccess ? awardedBelotePoints[1] : 0),
  };
  const takerPoints = totalPointsByTeam[takerTeam];
  const defenderPoints = totalPointsByTeam[defenderTeam];
  const contractSucceeded = contract.kind === "capot"
    ? capotTeam === takerTeam
    : (!rules.contractSuccess.mustReachBid || contractPointsByTeam[takerTeam] >= contract.value)
      && (!rules.contractSuccess.mustBeatDefense
        || contractPointsByTeam[takerTeam] > contractPointsByTeam[defenderTeam]);
  const multiplier = contractMultiplier(contract, rules.scoring);
  const contractScore = contract.value * multiplier;

  const roundScore: Record<TeamId, number> = rules.scoring.mode === "ffb"
    ? scoreFfb({
        belotePoints: awardedBelotePoints,
        capotTeam,
        contract,
        contractSucceeded,
        defenderTeam,
        multiplier,
        takerTeam,
        totalPoints: totalPointsByTeam,
        rules,
      })
    : rules.scoring.mode === "contract-only"
      ? scoreAnnouncedPoints({ contractScore, contractSucceeded, defenderTeam, takerTeam })
      : scoreMadePoints({
          contractScore,
          contractSucceeded,
          defenderPoints,
          defenderTeam,
          takerPoints,
          takerTeam,
          failureBasePoints: rules.scoring.failureBasePoints,
        });

  return {
    kind: "played",
    contract,
    takerPoints,
    defenderPoints,
    trickPointsByTeam: { ...trickPointsByTeam },
    announcementPointsByTeam: { ...ZERO_POINTS },
    belotePointsByTeam: awardedBelotePoints,
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
  failureBasePoints,
}: {
  contractScore: number;
  contractSucceeded: boolean;
  defenderPoints: number;
  defenderTeam: TeamId;
  takerPoints: number;
  takerTeam: TeamId;
  failureBasePoints: number;
}): Record<TeamId, number> {
  return contractSucceeded
    ? { 0: 0, 1: 0, [takerTeam]: takerPoints + contractScore, [defenderTeam]: defenderPoints }
    : { 0: 0, 1: 0, [defenderTeam]: failureBasePoints + contractScore };
}
