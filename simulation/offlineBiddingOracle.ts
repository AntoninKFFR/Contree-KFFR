// Offline-only perfect-information bidding oracle. Production code must never import this module.
import { canCoinche, canSurcoinche, getAvailableBidValues } from "@/engine/bidding";
import { getCurrentContract, playCard } from "@/engine/game";
import { playerTeam } from "@/engine/rules";
import type { GameState, Suit, TeamId } from "@/engine/types";
import {
  chooseStrategyBid,
  chooseStrategyCard,
  type BotStrategyDefinition,
  type StrategyBid,
} from "@/simulation/botRegistry";
import { applyStrategyBid } from "@/simulation/tournament";

export type OracleBidValue = { decision: StrategyBid; value: number };
export type OracleBidDecision = { bestDecision: StrategyBid; values: OracleBidValue[] };

const SUITS: Suit[] = ["clubs", "diamonds", "hearts", "spades"];

function decisionKey(decision: StrategyBid): string {
  return decision.action === "bid"
    ? `bid:${decision.value}:${decision.trump}`
    : decision.action;
}

export function legalOracleBidCandidates(state: GameState): StrategyBid[] {
  const contract = getCurrentContract(state);
  const candidates: StrategyBid[] = [{ action: "pass" }];
  if (contract && canCoinche(state.currentPlayerId, contract)) candidates.push({ action: "coinche" });
  if (contract && canSurcoinche(state.currentPlayerId, contract)) candidates.push({ action: "surcoinche" });
  if (!contract || contract.status === "normal") {
    for (const value of getAvailableBidValues(contract)) {
      for (const trump of SUITS) candidates.push({ action: "bid", value, trump });
    }
  }
  return candidates;
}

function roundValue(state: GameState, team: TeamId): number {
  const opponent = team === 0 ? 1 : 0;
  return state.roundScore[team] - state.roundScore[opponent];
}

function rolloutRound(
  state: GameState,
  biddingEngine: BotStrategyDefinition,
  cardEngine: BotStrategyDefinition,
): GameState {
  let next = state;
  let guard = 0;
  while ((next.phase === "bidding" || next.phase === "playing") && guard < 64) {
    next = next.phase === "bidding"
      ? applyStrategyBid(next, chooseStrategyBid(next, biddingEngine))
      : playCard(next, next.currentPlayerId, chooseStrategyCard(next, cardEngine));
    guard += 1;
  }
  return next;
}

export function oracleBidValues(
  state: GameState,
  options: { biddingEngine: BotStrategyDefinition; cardEngine: BotStrategyDefinition },
): OracleBidDecision {
  if (state.phase !== "bidding") throw new Error("Oracle annonces: position hors phase d'encheres.");
  const team = playerTeam(state.currentPlayerId);
  const values = legalOracleBidCandidates(state).map((decision) => ({
    decision,
    value: roundValue(
      rolloutRound(applyStrategyBid(state, decision), options.biddingEngine, options.cardEngine),
      team,
    ),
  })).sort((first, second) => second.value - first.value || decisionKey(first.decision).localeCompare(decisionKey(second.decision)));
  return { bestDecision: values[0].decision, values };
}

export function biddingDecisionRegret(oracle: OracleBidDecision, decision: StrategyBid): number {
  const chosen = oracle.values.find((candidate) => decisionKey(candidate.decision) === decisionKey(decision));
  if (!chosen) throw new Error("La decision d'annonce evaluee n'est pas legale dans cette position oracle.");
  return oracle.values[0].value - chosen.value;
}
