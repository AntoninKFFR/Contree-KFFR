import { assessCapotHand, evaluateAdvancedModeHand, evaluateCapotHand, estimateDefensiveTricks, ruleBonusForHand, type ModeHandEvaluation } from "@/bots/evaluation/advancedRulesEvaluation";
import { evaluateGenerale } from "@/bots/evaluation/generaleEvaluation";
import { chooseHumanDoctrineV31Bid } from "@/bots/strategy/humanDoctrineV31";
import { BID_VALUES, canBidCapot, canBidGenerale, canBidGeneraleMode, canCoinche, canSurcoinche, getAvailableBidValues } from "@/engine/bidding";
import { resolveContractMode } from "@/engine/contractMode";
import { getCurrentContract } from "@/engine/game";
import { playerTeam } from "@/engine/rules";
import { resolveGameRules } from "@/engine/rulesets/resolve";
import type { BidValue, Card, ContractMode, GameState, Suit } from "@/engine/types";

export type AdvancedBotBid =
  | { action: "pass" | "coinche" | "surcoinche" }
  | { action: "bid"; value: BidValue; trump?: Suit; contractMode?: ContractMode }
  | { action: "capot" | "generale"; contractMode: ContractMode };

type Candidate = { mode: ContractMode; value: BidValue; quality: number; explanation: string };

function modeKey(mode: ContractMode): string {
  return mode.kind === "suit" ? mode.suit : mode.kind;
}

function specialModes(state: GameState): ContractMode[] {
  const bidding = resolveGameRules(state.settings).bidding;
  return [
    ...(bidding.allowNoTrump ? [{ kind: "no-trump" } as const] : []),
    ...(bidding.allowAllTrump ? [{ kind: "all-trump" } as const] : []),
  ];
}

function canDefendWithCoinche(state: GameState, mode: ContractMode, value: number, kind: string): boolean {
  const hand = state.hands[state.currentPlayerId];
  const defensiveTricks = estimateDefensiveTricks(hand, mode);
  if (kind === "generale") return defensiveTricks >= 1.65;
  if (kind === "capot") return defensiveTricks >= 1.4;
  if (mode.kind === "suit") {
    const trumpRanks = new Set(hand.filter((card) => card.suit === mode.suit).map((card) => card.rank));
    // Six classical Coinches in 500 paired games produced only one set.
    // Require control of the declared trump and several independent tricks.
    return value >= 120 && trumpRanks.has("J") && trumpRanks.has("9") && defensiveTricks >= 4.5;
  }
  // A failed Coinche doubles the taker's reward. A few isolated Aces are not
  // enough: require roughly four credible defensive controls even at 160.
  const pressure = Math.max(0, value - 80) / 80;
  return defensiveTricks >= 3.6 - Math.min(0.25, pressure * 0.25);
}

function canRiskSurcoinche(state: GameState, mode: ContractMode, value: number, kind: string): boolean {
  const hand = state.hands[state.currentPlayerId];
  // The partner sits out a Générale: its own masters cannot secure the taker's eight tricks.
  if (kind === "generale") return getCurrentContract(state)?.playerId === state.currentPlayerId
    && Boolean(evaluateCapotHand(hand, mode));
  if (kind === "capot") return Boolean(evaluateCapotHand(hand, mode));
  if (mode.kind !== "suit") {
    const evaluation = evaluateAdvancedModeHand(hand, mode, state);
    return evaluation.ceiling !== null && evaluation.ceiling >= value + 20 && evaluation.dangerousHoles <= 1;
  }
  if (evaluateCapotHand(hand, mode)) return true;
  const suit = chooseHumanDoctrineV31Bid(state);
  return suit.trace.trump === mode.suit
    && suit.trace.intrinsicCeiling !== null
    && suit.trace.intrinsicCeiling >= value + 20;
}

function strongestSpecial(
  state: GameState, hand: Card[], available: BidValue[],
): { candidate: Candidate; evaluation: ModeHandEvaluation } | null {
  const minimum = available[0];
  if (!minimum) return null;
  const current = getCurrentContract(state);
  const partnerOwnsContract = current?.teamId === playerTeam(state.currentPlayerId);
  const candidates = specialModes(state).map((mode) => {
    const evaluation = evaluateAdvancedModeHand(hand, mode, state);
    const candidate = evaluation.ceiling !== null && evaluation.ceiling >= minimum
      && evaluation.controls >= (mode.kind === "no-trump" ? 2 : 1)
      ? {
          mode, value: minimum,
          quality: evaluation.strength - (partnerOwnsContract ? 18 : 0),
          explanation: evaluation.reasons.join(" ; "),
        }
      : null;
    return candidate ? { candidate, evaluation } : null;
  }).filter((value): value is { candidate: Candidate; evaluation: ModeHandEvaluation } => value !== null);
  candidates.sort((a, b) => b.candidate.quality - a.candidate.quality || modeKey(a.candidate.mode).localeCompare(modeKey(b.candidate.mode)));
  return candidates[0] ?? null;
}

/** Experimental extension of V3.1. The classical suit path remains the V3.1 decision. */
export function chooseAdvancedRulesBid(state: GameState): AdvancedBotBid {
  if (state.phase !== "bidding") throw new Error("Le bot ne peut enchérir que pendant les enchères.");
  const rules = resolveGameRules(state.settings);
  const current = getCurrentContract(state);
  const currentMode = current ? resolveContractMode(current) : null;
  const hand = state.hands[state.currentPlayerId];

  if (current && currentMode && canSurcoinche(state.currentPlayerId, current, rules.bidding)
    && canRiskSurcoinche(state, currentMode, current.value, current.kind ?? "points")) {
    return { action: "surcoinche" };
  }
  if (current && currentMode && canCoinche(state.currentPlayerId, current, rules.bidding)
    && canDefendWithCoinche(state, currentMode, current.value, current.kind ?? "points")) {
    return { action: "coinche" };
  }
  if (current?.status && current.status !== "normal") return { action: "pass" };

  if (canBidGenerale(current, rules.bidding)) {
    const generale = evaluateGenerale(hand, specialModes(state).filter((mode) => canBidGeneraleMode(mode, rules.bidding)));
    if (generale && canBidGeneraleMode(generale.contractMode, rules.bidding)) {
      return { action: "generale", contractMode: generale.contractMode };
    }
  }

  if (canBidCapot(current, rules.bidding)) {
    const modes: ContractMode[] = [
      { kind: "suit", suit: "clubs" }, { kind: "suit", suit: "diamonds" },
      { kind: "suit", suit: "hearts" }, { kind: "suit", suit: "spades" },
      ...specialModes(state),
    ];
    const partnerSignal = state.bids.filter((bid) => bid.action === "bid"
      && bid.playerId !== state.currentPlayerId && playerTeam(bid.playerId) === playerTeam(state.currentPlayerId))
      .at(-1);
    const capot = modes.map((mode) => {
      const solo = evaluateCapotHand(hand, mode);
      if (solo) return solo;
      const partnerMode = partnerSignal?.action === "bid" ? resolveContractMode(partnerSignal) : null;
      if (!partnerSignal || partnerSignal.action !== "bid" || partnerSignal.value < 110
        || !partnerMode || modeKey(partnerMode) !== modeKey(mode)) return null;
      if (mode.kind === "suit" && hand.filter((card) => card.suit === mode.suit).length < 4) return null;
      const assessment = assessCapotHand(hand, mode);
      return assessment.sureWinners >= 7 && assessment.gaps <= 1 ? assessment : null;
    }).find((value) => value !== null);
    if (capot) return { action: "capot", contractMode: capot.mode };
  }

  const suit = chooseHumanDoctrineV31Bid(state);
  const available = getAvailableBidValues(current, rules.bidding);
  const special = strongestSpecial(state, hand, available);
  const suitBonus = ruleBonusForHand(hand, state.currentPlayerId, { kind: "suit", suit: suit.trace.trump }, rules);
  const ceiling = suit.trace.intrinsicCeiling;
  const ceilingIndex = ceiling === null ? -1 : BID_VALUES.indexOf(ceiling);
  const enhancedCeiling = suitBonus.total >= 8 && ceilingIndex >= 0
    ? BID_VALUES[Math.min(BID_VALUES.length - 1, ceilingIndex + 1)] : ceiling;
  const suitValue = suit.action === "bid" && available.includes(suit.value)
    ? suit.value
    : suitBonus.total >= 8 && current?.teamId !== playerTeam(state.currentPlayerId)
      && suit.trace.trumpFoundation !== "none" && enhancedCeiling !== null
      && available[0] !== undefined && available[0] <= enhancedCeiling
      ? available[0] : null;
  if (!special) return suitValue !== null
    ? { action: "bid", value: suitValue, trump: suit.trace.trump }
    : { action: "pass" };

  const suitStrength = (suit.trace.evaluations.find((evaluation) => evaluation.trump === suit.trace.trump)?.intrinsicHandStrength ?? 0) + suitBonus.total;
  const suitCandidateValid = suitValue !== null;
  // V3.1 suit messages win close comparisons. Special modes need meaningful
  // additional control before replacing an existing partnership conversation.
  if (suitCandidateValid && suitStrength + 7 >= special.candidate.quality) {
    return { action: "bid", value: suitValue!, trump: suit.trace.trump };
  }
  return { action: "bid", value: special.candidate.value, contractMode: special.candidate.mode };
}
