import { getAvailableBidValues } from "@/engine/bidding";
import { getCurrentContract } from "@/engine/game";
import { playerTeam } from "@/engine/rules";
import type { BidValue, Card, GameState, Suit } from "@/engine/types";
import { evaluateHandForTrump } from "@/bots/evaluation/handEvaluation";
import { getBotProfile } from "@/bots/profiles";
import { chooseProfileBid, type BidDecision } from "@/bots/strategy/biddingStrategy";

const SUITS: Suit[] = ["clubs", "diamonds", "hearts", "spades"];

type ConservativeEvaluation = ReturnType<typeof evaluateHandForTrump> & { conservativeScore: number };

function evaluateConservatively(hand: Card[], trump: Suit): ConservativeEvaluation {
  const evaluation = evaluateHandForTrump(hand, trump);
  const aceCount = hand.filter((card) => card.rank === "A").length;
  const tenCount = hand.filter((card) => card.rank === "10").length;
  return {
    ...evaluation,
    conservativeScore:
      evaluation.totalPoints +
      evaluation.trumpCount * 5 +
      evaluation.strongTrumpCount * 12 +
      aceCount * 5 +
      tenCount * 2 +
      evaluation.shortSuitCount * 3,
  };
}

function valueForScore(score: number): BidValue | null {
  if (score < 54) return null;
  if (score >= 86) return 100;
  if (score >= 70) return 90;
  return 80;
}

function bestEvaluation(hand: Card[]): ConservativeEvaluation {
  return SUITS.map((trump) => evaluateConservatively(hand, trump))
    .sort((first, second) => second.conservativeScore - first.conservativeScore)[0];
}

function confidence(score: number): number {
  return Math.min(1, Math.max(0, score / 110));
}

/**
 * Conservative bidding extracted from the legacy signal, using current public
 * auction context. It deliberately caps hand-driven bids at 100; only a strong
 * fit with a partner can justify one incremental raise above their contract.
 */
export function chooseBiddingV2(state: GameState): BidDecision {
  const playerId = state.currentPlayerId;
  const teamId = playerTeam(playerId);
  const hand = state.hands[playerId];
  const currentContract = getCurrentContract(state);

  if (currentContract?.status !== "normal") {
    const modernDecision = chooseProfileBid(state, getBotProfile("main"));
    return modernDecision.action === "surcoinche" ? modernDecision : {
      action: "pass",
      confidence: 0.5,
      reason: "Bidding V2: aucune surcoinche suffisamment sure.",
    };
  }

  if (currentContract && currentContract.teamId !== teamId) {
    const modernDecision = chooseProfileBid(state, getBotProfile("main"));
    if (modernDecision.action === "coinche") return modernDecision;
  }

  if (currentContract?.teamId === teamId) {
    const support = evaluateConservatively(hand, currentContract.trump);
    const hasFit =
      support.trumpCount >= 3 &&
      (support.hasJackTrump || support.hasNineTrump || support.aceCount >= 1);
    const nextValue = getAvailableBidValues(currentContract)[0];
    if (hasFit && support.conservativeScore >= 62 && nextValue && nextValue <= 110) {
      return {
        action: "bid",
        trump: currentContract.trump,
        value: nextValue,
        confidence: confidence(support.conservativeScore),
        reason: "Bidding V2: soutien prudent de la couleur du partenaire.",
      };
    }
    return {
      action: "pass",
      confidence: confidence(support.conservativeScore),
      reason: "Bidding V2: soutien insuffisant pour relever le partenaire.",
    };
  }

  const best = bestEvaluation(hand);
  const wantedValue = valueForScore(best.conservativeScore);
  if (!wantedValue || (currentContract && wantedValue <= currentContract.value)) {
    return {
      action: "pass",
      confidence: confidence(best.conservativeScore),
      reason: currentContract
        ? "Bidding V2: le contrat adverse depasse la valeur prudente de la main."
        : "Bidding V2: main trop faible pour ouvrir.",
    };
  }

  return {
    action: "bid",
    trump: best.trump,
    value: wantedValue,
    confidence: confidence(best.conservativeScore),
    reason: currentContract
      ? "Bidding V2: intervention conservatrice justifiee."
      : "Bidding V2: ouverture conservatrice.",
  };
}
