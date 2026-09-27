import { assessCapotHand, evaluateAdvancedModeHand, evaluateCapotHand, estimateDefensiveTricks, ruleBonusForHand, type ModeHandEvaluation } from "@/bots/evaluation/advancedRulesEvaluation";
import { evaluateGenerale } from "@/bots/evaluation/generaleEvaluation";
import { chooseHumanDoctrineV31Bid, type HumanDoctrineV31Trace } from "@/bots/strategy/humanDoctrineV31";
import { BID_VALUES, canBidCapot, canBidGenerale, canBidGeneraleMode, canCoinche, canSurcoinche, getAvailableBidValues } from "@/engine/bidding";
import { resolveContractMode } from "@/engine/contractMode";
import { getCurrentContract } from "@/engine/game";
import { playerTeam } from "@/engine/rules";
import { resolveGameRules } from "@/engine/rulesets/resolve";
import type { BidValue, Card, Contract, ContractMode, GameState, Suit } from "@/engine/types";

export type AdvancedBotBid =
  | { action: "pass" | "coinche" | "surcoinche" }
  | { action: "bid"; value: BidValue; trump?: Suit; contractMode?: ContractMode }
  | { action: "capot" | "generale"; contractMode: ContractMode };

export type DefensiveBidAssessment = {
  estimatedTricks: number;
  hardControls: number;
  pairedSideControls: number;
  trumpControl: "both" | "jack" | "nine" | "none";
  overbidThreshold: number | null;
  overbidQualifies: boolean;
};

export type AdvancedRulesBidReasonCode =
  | "weak-trump-foundation" | "weak-long-trump-show-80"
  | "single-major-probe" | "autonomous-opening" | "partner-fit" | "strong-partner-fit"
  | "rebid-after-support" | "competitive-overcall" | "partner-suit-respected"
  | "partner-suit-override" | "coinche-strong-trump-control" | "coinche-obvious-overbid"
  | "coinche-special-control" | "surcoinche-large-margin" | "capot-full-control"
  | "capot-partner-supported"
  | "generale-full-control" | "special-mode-strength" | "pass-ceiling-too-low"
  | "pass-contract-blocked";

export type AdvancedRulesBidTrace = {
  doctrineId: "advanced_rules_v4";
  doctrineRevision: "4.1";
  decisionBranch: "pass" | "suit" | "coinche-control" | "coinche-overbid"
    | "surcoinche" | "capot" | "generale" | "special-mode";
  finalAction: AdvancedBotBid;
  currentContract: Contract | null;
  selectedMode?: ContractMode;
  selectedSuit?: Suit;
  defensiveAssessment?: DefensiveBidAssessment;
  coincheReason?: "control" | "overbid" | "special";
  weakTrumpCapApplied: boolean;
  suitFoundation?: HumanDoctrineV31Trace["trumpFoundation"];
  intrinsicCeiling?: BidValue | null;
  effectiveCeiling?: BidValue | null;
  partnerFit?: HumanDoctrineV31Trace["partnerFit"];
  communicationIntent?: HumanDoctrineV31Trace["communicationIntent"];
  competitiveMinimum?: BidValue | null;
  rebidCeiling?: BidValue | null;
  partnerSuitOverride?: HumanDoctrineV31Trace["partnerSuitOverride"];
  suitTrace?: HumanDoctrineV31Trace;
  reasonCode: AdvancedRulesBidReasonCode;
  shortReason: string;
};

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

function assessSuitDefense(hand: Card[], suit: Suit, value: number): DefensiveBidAssessment {
  const trumps = new Set(hand.filter((card) => card.suit === suit).map((card) => card.rank));
  const sideSuits = ["clubs", "diamonds", "hearts", "spades"] as const;
  const sideRanks = sideSuits.filter((side) => side !== suit).map((side) =>
    new Set(hand.filter((card) => card.suit === side).map((card) => card.rank)));
  const hardControls = sideRanks.filter((ranks) => ranks.has("A")).length;
  const pairedSideControls = sideRanks.filter((ranks) => ranks.has("A") && ranks.has("10")).length;
  const estimatedTricks = estimateDefensiveTricks(hand, { kind: "suit", suit });
  const overbidThreshold = value >= 160 ? 3.1 : value >= 150 ? 3.95 : value >= 140 ? 4.65 : null;
  // Two side A-10 controls are the minimum credible independent defense;
  // 140 additionally requires all three side suits to be controlled in sequence.
  const overbidQualifies = overbidThreshold !== null && estimatedTricks + 1e-9 >= overbidThreshold
    && hardControls >= (value >= 160 ? 2 : 3)
    && pairedSideControls >= (value >= 150 ? 2 : 3);
  return {
    estimatedTricks, hardControls, pairedSideControls,
    trumpControl: trumps.has("J") && trumps.has("9") ? "both"
      : trumps.has("J") ? "jack" : trumps.has("9") ? "nine" : "none",
    overbidThreshold, overbidQualifies,
  };
}

function coincheReason(
  state: GameState, mode: ContractMode, value: number, kind: string,
  assessment?: DefensiveBidAssessment,
): "control" | "overbid" | "special" | null {
  const hand = state.hands[state.currentPlayerId];
  const defensiveTricks = estimateDefensiveTricks(hand, mode);
  if (kind === "generale") return defensiveTricks >= 1.65 ? "special" : null;
  if (kind === "capot") return defensiveTricks >= 1.4 ? "special" : null;
  if (mode.kind === "suit") {
    // Six classical Coinches in 500 paired games produced only one set.
    // Require control of the declared trump and several independent tricks.
    const defense = assessment ?? assessSuitDefense(hand, mode.suit, value);
    if (value >= 120 && defense.trumpControl === "both" && defensiveTricks >= 4.5) return "control";
    return defense.overbidQualifies ? "overbid" : null;
  }
  // A failed Coinche doubles the taker's reward. A few isolated Aces are not
  // enough: require roughly four credible defensive controls even at 160.
  const pressure = Math.max(0, value - 80) / 80;
  return defensiveTricks >= 3.6 - Math.min(0.25, pressure * 0.25) ? "special" : null;
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

function suitReasonCode(trace: HumanDoctrineV31Trace): AdvancedRulesBidReasonCode {
  switch (trace.communicationIntent) {
    case "probe-for-jack":
    case "probe-for-nine": return "single-major-probe";
    case "show-autonomous-strength": return "autonomous-opening";
    case "support-partner-major": return "partner-fit";
    case "support-partner-strongly": return "strong-partner-fit";
    case "rebid-after-support": return "rebid-after-support";
    case "competitive-overcall": return "competitive-overcall";
    case "override-partner-suit": return "partner-suit-override";
    case "pass-with-partner": return "partner-suit-respected";
    case "reject-weak-foundation": return "weak-trump-foundation";
  }
}

/** V4.1 keeps V3.1's suit conversation, adding a narrow weak-trump guard and explicit trace. */
export function chooseAdvancedRulesBidWithTrace(state: GameState): {
  bid: AdvancedBotBid; trace: AdvancedRulesBidTrace;
} {
  if (state.phase !== "bidding") throw new Error("Le bot ne peut enchérir que pendant les enchères.");
  const rules = resolveGameRules(state.settings);
  const current = getCurrentContract(state);
  const currentMode = current ? resolveContractMode(current) : null;
  const hand = state.hands[state.currentPlayerId];
  const defensiveAssessment = current?.kind === "points" && currentMode?.kind === "suit"
    ? assessSuitDefense(hand, currentMode.suit, current!.value) : undefined;
  const finish = (
    bid: AdvancedBotBid, decisionBranch: AdvancedRulesBidTrace["decisionBranch"],
    reasonCode: AdvancedRulesBidReasonCode, shortReason: string,
    details: Partial<AdvancedRulesBidTrace> = {},
  ): { bid: AdvancedBotBid; trace: AdvancedRulesBidTrace } => ({
    bid,
    trace: {
      doctrineId: "advanced_rules_v4", doctrineRevision: "4.1", decisionBranch,
      finalAction: bid, currentContract: current ? { ...current } : null,
      weakTrumpCapApplied: false,
      ...(defensiveAssessment ? { defensiveAssessment } : {}),
      ...details, reasonCode, shortReason,
    },
  });

  if (current && currentMode && canSurcoinche(state.currentPlayerId, current, rules.bidding)
    && canRiskSurcoinche(state, currentMode, current.value, current.kind ?? "points")) {
    return finish({ action: "surcoinche" }, "surcoinche", "surcoinche-large-margin",
      "La main propre permet une Surcoinche avec une marge suffisante.", { selectedMode: currentMode });
  }
  if (current && currentMode && canCoinche(state.currentPlayerId, current, rules.bidding)) {
    const reason = coincheReason(state, currentMode, current.value, current.kind ?? "points", defensiveAssessment);
    if (reason) return finish({ action: "coinche" }, reason === "overbid" ? "coinche-overbid" : "coinche-control",
      reason === "overbid" ? "coinche-obvious-overbid"
        : reason === "control" ? "coinche-strong-trump-control" : "coinche-special-control",
      reason === "overbid" ? "Le contrat adverse très élevé se heurte à plusieurs contrôles défensifs indépendants."
        : "La main possède des contrôles défensifs suffisants pour Coincher.",
      { selectedMode: currentMode, coincheReason: reason });
  }
  if (current?.status && current.status !== "normal") return finish({ action: "pass" }, "pass",
    "pass-contract-blocked", "Le contrat déjà doublé bloque une nouvelle enchère ordinaire.");

  if (canBidGenerale(current, rules.bidding)) {
    const generale = evaluateGenerale(hand, specialModes(state).filter((mode) => canBidGeneraleMode(mode, rules.bidding)));
    if (generale && canBidGeneraleMode(generale.contractMode, rules.bidding)) {
      return finish({ action: "generale", contractMode: generale.contractMode }, "generale",
        "generale-full-control", generale.reason, { selectedMode: generale.contractMode });
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
    if (capot) return finish({ action: "capot", contractMode: capot.mode }, "capot",
      capot.gaps === 0 ? "capot-full-control" : "capot-partner-supported",
      capot.reason, { selectedMode: capot.mode });
  }

  const suit = chooseHumanDoctrineV31Bid(state);
  const available = getAvailableBidValues(current, rules.bidding);
  const special = strongestSpecial(state, hand, available);
  const suitBonus = ruleBonusForHand(hand, state.currentPlayerId, { kind: "suit", suit: suit.trace.trump }, rules);
  const ceiling = suit.trace.intrinsicCeiling;
  const ceilingIndex = ceiling === null ? -1 : BID_VALUES.indexOf(ceiling);
  const enhancedCeiling = suitBonus.total >= 8 && ceilingIndex >= 0
    ? BID_VALUES[Math.min(BID_VALUES.length - 1, ceilingIndex + 1)] : ceiling;
  const evaluation = suit.trace.evaluations.find((candidate) => candidate.trump === suit.trace.trump)!;
  const weakLongTrump = evaluation.trumpQuantity >= 4
    && !evaluation.trumpStructure.hasJack && !evaluation.trumpStructure.hasNine;
  const canShowWeak80 = weakLongTrump && evaluation.intrinsicHandStrength >= 60
    && evaluation.outsideAces >= 2
    && (evaluation.protectedOutsideTens >= 1 || evaluation.outsideAces >= 3);
  const partnerRaise = suit.trace.communicationIntent === "rebid-after-support"
    || suit.trace.communicationIntent === "support-partner-major"
    || suit.trace.communicationIntent === "support-partner-strongly";
  const conversationalCeiling = partnerRaise && suit.trace.rebidCeiling !== null
    ? Math.max(enhancedCeiling ?? 0, suit.trace.rebidCeiling) as BidValue : enhancedCeiling;
  const effectiveCeiling = weakLongTrump ? canShowWeak80 ? 80 : null : conversationalCeiling;
  const suitValue = suit.action === "bid" && available.includes(suit.value)
    && (!weakLongTrump || (canShowWeak80 && suit.value === 80))
    ? suit.value
    : canShowWeak80 && !current && available.includes(80) ? 80
      : !weakLongTrump && suitBonus.total >= 8 && current?.teamId !== playerTeam(state.currentPlayerId)
      && suit.trace.trumpFoundation !== "none" && enhancedCeiling !== null
      && available[0] !== undefined && available[0] <= enhancedCeiling
      ? available[0] : null;
  const bonusChangedPassToBid = !weakLongTrump && suit.action === "pass" && suitValue !== null;
  const suitDetails: Partial<AdvancedRulesBidTrace> = {
    selectedSuit: suit.trace.trump, selectedMode: { kind: "suit", suit: suit.trace.trump },
    weakTrumpCapApplied: weakLongTrump, suitFoundation: suit.trace.trumpFoundation,
    intrinsicCeiling: ceiling, effectiveCeiling, partnerFit: suit.trace.partnerFit,
    communicationIntent: suit.trace.communicationIntent, competitiveMinimum: suit.trace.competitiveMinimum,
    rebidCeiling: suit.trace.rebidCeiling, partnerSuitOverride: suit.trace.partnerSuitOverride,
    suitTrace: suit.trace,
  };
  const chooseSuit = () => finish({ action: "bid", value: suitValue!, trump: suit.trace.trump }, "suit",
    weakLongTrump ? "weak-long-trump-show-80" : bonusChangedPassToBid
      ? current ? "competitive-overcall" : "autonomous-opening" : suitReasonCode(suit.trace),
    weakLongTrump ? "La longueur faible et les contrôles extérieurs justifient seulement 80."
      : bonusChangedPassToBid ? "Les bonus permis par les règles complètent une fondation d’atout suffisante."
        : suit.trace.reason, suitDetails);
  if (!special) return suitValue !== null ? chooseSuit()
    : finish({ action: "pass" }, "pass",
      weakLongTrump ? "weak-trump-foundation" : suitReasonCode(suit.trace) === "partner-suit-respected"
        ? "partner-suit-respected" : "pass-ceiling-too-low",
      weakLongTrump ? "Cette couleur sans Valet ni 9 ne peut dépasser 80 et manque peut-être de contrôles pour ouvrir."
        : suit.trace.reason, suitDetails);

  const suitStrength = evaluation.intrinsicHandStrength + suitBonus.total;
  const suitCandidateValid = suitValue !== null;
  // V3.1 suit messages win close comparisons. Special modes need meaningful
  // additional control before replacing an existing partnership conversation.
  if (suitCandidateValid && suitStrength + 7 >= special.candidate.quality) {
    return chooseSuit();
  }
  return finish({ action: "bid", value: special.candidate.value, contractMode: special.candidate.mode },
    "special-mode", "special-mode-strength", special.candidate.explanation || "Le mode spécial dispose des contrôles requis.",
    { selectedMode: special.candidate.mode, effectiveCeiling: special.evaluation.ceiling });
}

export function chooseAdvancedRulesBid(state: GameState): AdvancedBotBid {
  return chooseAdvancedRulesBidWithTrace(state).bid;
}
