import { detectAnnouncements } from "@/engine/announcements";
import { SUITS } from "@/engine/cards";
import { cardStrength } from "@/engine/rules";
import { resolveGameRules } from "@/engine/rulesets/resolve";
import type { GameRulesetSnapshot } from "@/engine/rulesets/types";
import type { BidValue, Card, ContractMode, GameState, PlayerId, Suit } from "@/engine/types";

export type ModeHandEvaluation = {
  mode: ContractMode;
  strength: number;
  ceiling: BidValue | null;
  controls: number;
  dangerousHoles: number;
  announcementPotential: number;
  reasons: string[];
};

const CEILINGS: Array<{ minimum: number; value: BidValue }> = [
  { minimum: 115, value: 160 }, { minimum: 107, value: 150 },
  { minimum: 99, value: 140 }, { minimum: 91, value: 130 },
  { minimum: 83, value: 120 }, { minimum: 75, value: 110 },
  { minimum: 67, value: 100 }, { minimum: 59, value: 90 },
  { minimum: 51, value: 80 },
];

function ceilingFor(strength: number): BidValue | null {
  return CEILINGS.find(({ minimum }) => strength >= minimum)?.value ?? null;
}

function suitCards(hand: Card[], suit: Suit): Card[] {
  return hand.filter((card) => card.suit === suit);
}

function announcementPotential(
  hand: Card[], playerId: PlayerId, mode: ContractMode, rules: GameRulesetSnapshot,
): number {
  if (!rules.announcements.enabled) return 0;
  const raw = detectAnnouncements(hand, playerId, mode, rules.announcements)
    .reduce((sum, announcement) => sum + announcement.value, 0);
  // Opposing announcements can beat and cancel ours. They count toward the
  // contract threshold only when that ruleset explicitly enables it.
  return Math.min(14, raw * (rules.contractSuccess.announcementsCount ? 0.12 : 0.045));
}

function belotePotential(hand: Card[], mode: ContractMode, rules: GameRulesetSnapshot): number {
  if (!rules.belote.enabled || !rules.belote.countsForContractSuccess) return 0;
  if (mode.kind === "no-trump" || (mode.kind === "all-trump" && !rules.belote.allowInAllTrump)) return 0;
  const suits = mode.kind === "suit" ? [mode.suit] : SUITS;
  return suits.reduce((sum, suit) => {
    const ranks = new Set(suitCards(hand, suit).map((card) => card.rank));
    return sum + (ranks.has("K") && ranks.has("Q") ? Math.min(4, rules.belote.points * 0.2) : 0);
  }, 0);
}

export function ruleBonusForHand(
  hand: Card[], playerId: PlayerId, mode: ContractMode, rules: GameRulesetSnapshot,
): { announcements: number; belote: number; total: number } {
  const announcements = announcementPotential(hand, playerId, mode, rules);
  const belote = belotePotential(hand, mode, rules);
  return { announcements, belote, total: announcements + belote };
}

function noTrumpStrength(hand: Card[]): { strength: number; controls: number; holes: number; reasons: string[] } {
  let strength = 0;
  let controls = 0;
  let holes = 0;
  const reasons: string[] = [];
  for (const suit of SUITS) {
    const cards = suitCards(hand, suit);
    const ranks = new Set(cards.map((card) => card.rank));
    const ace = ranks.has("A");
    const ten = ranks.has("10");
    const king = ranks.has("K");
    if (ace) { strength += 17; controls += 1; }
    if (ten) strength += ace ? 12 : king && cards.length >= 3 ? 7 : 2;
    if (king) strength += ace || ten ? 4 : 2;
    if (ranks.has("Q")) strength += king ? 3 : 1;
    if (cards.length >= 3 && ace) strength += Math.min(6, (cards.length - 2) * 2);
    if (cards.length >= 4 && ace && ten) strength += 5;
    if (!ace && cards.length >= 2) { holes += 1; strength -= 3; }
    if (!ace && ten && cards.length <= 2) { holes += 1; strength -= 5; }
  }
  if (controls >= 3) { strength += 7; reasons.push("contrôles dans plusieurs couleurs"); }
  if (holes >= 2) reasons.push("couleurs sans As vulnérables");
  return { strength, controls, holes, reasons };
}

function allTrumpStrength(hand: Card[]): { strength: number; controls: number; holes: number; reasons: string[] } {
  let strength = 0;
  let controls = 0;
  let holes = 0;
  const reasons: string[] = [];
  for (const suit of SUITS) {
    const cards = suitCards(hand, suit);
    const ranks = new Set(cards.map((card) => card.rank));
    const jack = ranks.has("J");
    const nine = ranks.has("9");
    const ace = ranks.has("A");
    if (jack) { strength += 19; controls += 1; }
    if (nine) strength += jack ? 14 : 9;
    if (ace) strength += jack || nine ? 11 : 7;
    if (ranks.has("10")) strength += jack || nine || ace ? 8 : 2;
    if (jack && nine) strength += 7;
    if (jack && cards.length >= 3) strength += 3;
    if (!jack && !nine && cards.length >= 2) { holes += 1; strength -= 3; }
  }
  if (controls >= 2) { strength += 5; reasons.push("Valets maîtres dans plusieurs couleurs"); }
  if (holes >= 2) reasons.push("couleurs sans Valet ni 9");
  return { strength, controls, holes, reasons };
}

export function evaluateAdvancedModeHand(
  hand: Card[], mode: ContractMode, state: GameState,
): ModeHandEvaluation {
  const rules = resolveGameRules(state.settings);
  const base = mode.kind === "no-trump" ? noTrumpStrength(hand) : allTrumpStrength(hand);
  const { announcements, belote } = ruleBonusForHand(hand, state.currentPlayerId, mode, rules);
  const strength = base.strength + announcements + belote;
  return {
    mode, strength, ceiling: ceilingFor(strength), controls: base.controls,
    dangerousHoles: base.holes, announcementPotential: announcements,
    reasons: [...base.reasons, ...(announcements ? ["annonces possibles, décotées car non garanties"] : []),
      ...(belote ? ["Belote/Rebelote connue dans la main"] : [])],
  };
}

export type CapotEvaluation = { mode: ContractMode; sureWinners: number; gaps: number; reason: string };

export function assessCapotHand(hand: Card[], mode: ContractMode): CapotEvaluation {
  let sureWinners = 0;
  let gaps = 0;
  for (const suit of SUITS) {
    const cards = suitCards(hand, suit).sort((a, b) => cardStrength(b, mode) - cardStrength(a, mode));
    if (!cards.length) continue;
    const ranks = new Set(cards.map((card) => card.rank));
    const top = mode.kind === "no-trump" || (mode.kind === "suit" && suit !== mode.suit)
      ? ["A", "10", "K", "Q", "J", "9", "8", "7"]
      : ["J", "9", "A", "10", "K", "Q", "8", "7"];
    let run = 0;
    for (const rank of top) {
      if (!ranks.has(rank as Card["rank"])) break;
      run += 1;
    }
    sureWinners += run;
    gaps += cards.length - run;
  }
  // Only fully controlled hands can request a solo-safe Capot. Partner bids
  // may improve a later version, but cannot turn unseen cards into certainties.
  return { mode, sureWinners, gaps,
    reason: sureWinners === 8 ? "Huit cartes en séquences maîtresses sans trou."
      : `${sureWinners} cartes personnellement maîtresses ; ${gaps} trou(s) à couvrir.` };
}

export function evaluateCapotHand(hand: Card[], mode: ContractMode): CapotEvaluation | null {
  if (hand.length !== 8) return null;
  // Side-suit masters can be cut in a suit contract. A solo Capot needs
  // enough top trumps to remove that risk before cashing the side Aces.
  if (mode.kind === "suit" && suitCards(hand, mode.suit).length < 5) return null;
  const assessment = assessCapotHand(hand, mode);
  return assessment.sureWinners === 8 && assessment.gaps === 0 ? assessment : null;
}

export function estimateDefensiveTricks(hand: Card[], mode: ContractMode): number {
  return SUITS.reduce((sum, suit) => {
    const cards = suitCards(hand, suit);
    const ranks = new Set(cards.map((card) => card.rank));
    const trumpRanking = mode.kind === "all-trump" || (mode.kind === "suit" && mode.suit === suit);
    const first = trumpRanking ? "J" : "A";
    const second = trumpRanking ? "9" : "10";
    return sum + (ranks.has(first) ? 0.85 : 0)
      + (ranks.has(first) && ranks.has(second) ? 0.7 : 0)
      + (mode.kind === "suit" && mode.suit === suit && cards.length >= 4 ? 0.4 : 0);
  }, 0);
}
