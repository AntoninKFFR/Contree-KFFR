import type { Contract, GameSettings, RoundResult, TeamId } from "./types";
import { CONTREE_KFFR_RULESET } from "./rulesets/presets";
import { normalizeGameSettings, resolveGameRules } from "./rulesets/resolve";
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

export function applyScoreRounding(
  points: Record<TeamId, number>,
  roundToTen: boolean,
): Record<TeamId, number> {
  return roundToTen
    ? { 0: roundFfbScore(points[0]), 1: roundFfbScore(points[1]) }
    : { ...points };
}

function capotTeamFrom(tricksWonByTeam: Record<TeamId, number>): TeamId | null {
  if (tricksWonByTeam[0] === 8) return 0;
  if (tricksWonByTeam[1] === 8) return 1;
  return null;
}

function scoringAnnouncementPoints({
  announcementPoints,
  capotTeam,
  contractSucceeded,
  defenderTeam,
  rules,
  takerTeam,
}: {
  announcementPoints: Record<TeamId, number>;
  capotTeam: TeamId | null;
  contractSucceeded: boolean;
  defenderTeam: TeamId;
  rules: GameRulesetSnapshot;
  takerTeam: TeamId;
}): Record<TeamId, number> {
  if (!rules.announcements.enabled) return { ...ZERO_POINTS };
  const points = { ...announcementPoints };
  if (capotTeam !== null && rules.scoring.announcementsLostOnCapot) {
    const otherTeam = capotTeam === 0 ? 1 : 0;
    return { 0: 0, 1: 0, [capotTeam]: points[capotTeam] + points[otherTeam] };
  }
  if (!contractSucceeded && rules.scoring.announcementsLostOnFailure) {
    return { 0: 0, 1: 0, [defenderTeam]: points[defenderTeam] + points[takerTeam] };
  }
  return points;
}

function multiplyScore(points: Record<TeamId, number>, multiplier: number): Record<TeamId, number> {
  return { 0: points[0] * multiplier, 1: points[1] * multiplier };
}

function scoreFfb({
  announcementPoints,
  belotePoints,
  capotTeam,
  contract,
  contractSucceeded,
  defenderTeam,
  multiplier,
  rules,
  takerTeam,
  totalPoints,
}: {
  announcementPoints: Record<TeamId, number>;
  belotePoints: Record<TeamId, number>;
  capotTeam: TeamId | null;
  contract: Contract;
  contractSucceeded: boolean;
  defenderTeam: TeamId;
  multiplier: number;
  rules: GameRulesetSnapshot;
  takerTeam: TeamId;
  totalPoints: Record<TeamId, number>;
}): Record<TeamId, number> {
  const contractAmount = contract.value;
  const regulatoryBase = contract.kind === "capot" || capotTeam !== null
    ? rules.scoring.capotBasePoints
    : rules.scoring.failureBasePoints;
  const takerBelote = belotePoints[takerTeam];
  const defenderBelote = belotePoints[defenderTeam];
  const takerRetained = takerBelote + announcementPoints[takerTeam];
  const normalFormula: Record<TeamId, number> = contractSucceeded
    ? {
        0: 0,
        1: 0,
        [takerTeam]: totalPoints[takerTeam] + contractAmount,
        [defenderTeam]: totalPoints[defenderTeam],
      }
    : {
        0: 0,
        1: 0,
        [takerTeam]: takerRetained,
        [defenderTeam]: regulatoryBase
          + contractAmount
          + announcementPoints[defenderTeam]
          + defenderBelote,
      };

  if (multiplier === 1) return normalFormula;
  if (rules.scoring.doubleAllPointsOnCoinche) return multiplyScore(normalFormula, multiplier);
  return contractSucceeded
    ? {
        0: 0,
        1: 0,
        [takerTeam]: (
          regulatoryBase
          + contractAmount
          + announcementPoints[takerTeam]
          + takerBelote
        ) * multiplier,
        [defenderTeam]: announcementPoints[defenderTeam] + defenderBelote,
      }
    : {
        0: 0,
        1: 0,
        [takerTeam]: takerRetained,
        [defenderTeam]: (
          regulatoryBase
          + contractAmount
          + announcementPoints[defenderTeam]
          + defenderBelote
        ) * multiplier,
      };
}

function scoreContractOnly({
  contract,
  contractSucceeded,
  defenderTeam,
  failureIsFixed,
  multiplier,
  takerTeam,
}: {
  contract: Contract;
  contractSucceeded: boolean;
  defenderTeam: TeamId;
  failureIsFixed: boolean;
  multiplier: number;
  takerTeam: TeamId;
}): Record<TeamId, number> {
  const awarded = contractSucceeded
    ? contract.value
    : failureIsFixed ? 160 : contract.value;
  const recipient = contractSucceeded ? takerTeam : defenderTeam;
  return { 0: 0, 1: 0, [recipient]: awarded * multiplier };
}

function scorePointsOnly({
  contract,
  contractSucceeded,
  defenderTeam,
  multiplier,
  rules,
  takerTeam,
  totalPoints,
}: {
  contract: Contract;
  contractSucceeded: boolean;
  defenderTeam: TeamId;
  multiplier: number;
  rules: GameRulesetSnapshot;
  takerTeam: TeamId;
  totalPoints: Record<TeamId, number>;
}): Record<TeamId, number> {
  const normalFormula: Record<TeamId, number> = contractSucceeded
    ? {
        0: 0,
        1: 0,
        [takerTeam]: totalPoints[takerTeam] + contract.value,
        [defenderTeam]: totalPoints[defenderTeam],
      }
    : { 0: 0, 1: 0, [defenderTeam]: rules.scoring.failureBasePoints + contract.value };
  if (multiplier === 1) return normalFormula;
  if (rules.scoring.doubleAllPointsOnCoinche) return multiplyScore(normalFormula, multiplier);
  return contractSucceeded
    ? { ...normalFormula, [takerTeam]: totalPoints[takerTeam] + contract.value * multiplier }
    : { ...normalFormula, [defenderTeam]: rules.scoring.failureBasePoints + contract.value * multiplier };
}

export function scoreRound({
  announcementPointsByTeam = ZERO_POINTS,
  belotePointsByTeam = ZERO_POINTS,
  contract,
  settings,
  rules: explicitRules,
  trickPointsByTeam,
  tricksWonByTeam = ZERO_POINTS,
}: {
  announcementPointsByTeam?: Record<TeamId, number>;
  belotePointsByTeam?: Record<TeamId, number>;
  contract: Contract;
  settings: GameSettings;
  rules?: GameRulesetSnapshot;
  trickPointsByTeam: Record<TeamId, number>;
  tricksWonByTeam?: Record<TeamId, number>;
}): Extract<RoundResult, { kind: "played" }> {
  const rules = explicitRules ? resolveGameRules({ ruleset: explicitRules }) : resolveGameRules(settings);
  const takerTeam = contract.teamId;
  const defenderTeam = takerTeam === 0 ? 1 : 0;
  const capotTeam = capotTeamFrom(tricksWonByTeam);
  const awardedBelotePoints: Record<TeamId, number> = rules.belote.enabled
    ? { ...belotePointsByTeam }
    : { ...ZERO_POINTS };
  const qualifyingAnnouncementPoints = rules.announcements.enabled && rules.contractSuccess.announcementsCount
    ? announcementPointsByTeam
    : ZERO_POINTS;
  const contractPointsByTeam: Record<TeamId, number> = {
    0: trickPointsByTeam[0] + qualifyingAnnouncementPoints[0],
    1: trickPointsByTeam[1] + qualifyingAnnouncementPoints[1],
  };
  contractPointsByTeam[takerTeam] += rules.belote.countsForContractSuccess
    ? awardedBelotePoints[takerTeam]
    : 0;
  contractPointsByTeam[defenderTeam] += rules.belote.countsForContractFailure
    ? awardedBelotePoints[defenderTeam]
    : 0;
  const contractSucceeded = contract.kind === "capot"
    ? capotTeam === takerTeam
    : (!rules.contractSuccess.mustReachBid || contractPointsByTeam[takerTeam] >= contract.value)
      && (!rules.contractSuccess.mustBeatDefense
        || contractPointsByTeam[takerTeam] > contractPointsByTeam[defenderTeam]);
  const awardedAnnouncementPoints = scoringAnnouncementPoints({
    announcementPoints: announcementPointsByTeam,
    capotTeam,
    contractSucceeded,
    defenderTeam,
    rules,
    takerTeam,
  });
  const totalPointsByTeam: Record<TeamId, number> = {
    0: trickPointsByTeam[0] + awardedAnnouncementPoints[0] + awardedBelotePoints[0],
    1: trickPointsByTeam[1] + awardedAnnouncementPoints[1] + awardedBelotePoints[1],
  };
  const takerPoints = totalPointsByTeam[takerTeam];
  const defenderPoints = totalPointsByTeam[defenderTeam];
  const multiplier = contractMultiplier(contract, rules.scoring);
  const rawRoundScore = rules.scoring.mode === "ffb"
    ? scoreFfb({
        announcementPoints: awardedAnnouncementPoints,
        belotePoints: awardedBelotePoints,
        capotTeam,
        contract,
        contractSucceeded,
        defenderTeam,
        multiplier,
        rules,
        takerTeam,
        totalPoints: totalPointsByTeam,
      })
    : rules.scoring.mode === "contract-only" || rules.scoring.mode === "contract-only-160-failure"
      ? scoreContractOnly({
          contract,
          contractSucceeded,
          defenderTeam,
          failureIsFixed: rules.scoring.mode === "contract-only-160-failure",
          multiplier,
          takerTeam,
        })
      : scorePointsOnly({
          contract,
          contractSucceeded,
          defenderTeam,
          multiplier,
          rules,
          takerTeam,
          totalPoints: totalPointsByTeam,
        });
  const roundScore = applyScoreRounding(rawRoundScore, rules.scoring.roundToTen);

  return {
    kind: "played",
    contract,
    takerPoints,
    defenderPoints,
    trickPointsByTeam: { ...trickPointsByTeam },
    announcementPointsByTeam: awardedAnnouncementPoints,
    belotePointsByTeam: awardedBelotePoints,
    totalPointsByTeam,
    capotTeam,
    contractSucceeded,
    scoringMode: normalizeGameSettings({ ruleset: rules }).scoringMode,
    multiplier,
    roundScore,
  };
}
