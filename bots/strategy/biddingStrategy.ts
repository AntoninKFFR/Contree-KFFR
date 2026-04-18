import { getAvailableBidValues } from "@/engine/bidding";
import { getCurrentContract } from "@/engine/game";
import { playerTeam } from "@/engine/rules";
import type { Bid, BidValue, Card, Contract, GameState, Suit } from "@/engine/types";
import type { BotProfile } from "@/bots/profiles";
import { evaluateBestTrump, evaluateHandForTrump, type HandEvaluation } from "@/bots/evaluation/handEvaluation";

export type BidDecision = {
  action: "pass" | "bid" | "coinche" | "surcoinche";
  trump?: Suit;
  value?: BidValue;
  confidence: number;
  reason: string;
};

const BID_THRESHOLDS: Array<{ value: BidValue; minimumScore: number }> = [
  { value: 80, minimumScore: 80 },
  { value: 90, minimumScore: 95 },
  { value: 100, minimumScore: 110 },
  { value: 110, minimumScore: 125 },
  { value: 120, minimumScore: 140 },
  { value: 130, minimumScore: 155 },
  { value: 140, minimumScore: 170 },
  { value: 150, minimumScore: 190 },
  { value: 160, minimumScore: 215 },
];

function confidenceFromScore(score: number): number {
  return Math.min(1, Math.max(0, score / 150));
}

function bidValueForScore(score: number): BidValue | null {
  const possible = BID_THRESHOLDS.filter((threshold) => score >= threshold.minimumScore);
  return possible.at(-1)?.value ?? null;
}

function adjustedScore(evaluation: HandEvaluation, profile: BotProfile): number {
  const profileScore = evaluation.score * profile.bidRisk - profile.bidOffset;

  // Une main avec beaucoup de points mais peu d'atouts est plus fragile en contrat.
  const fragilityPenalty = evaluation.trumpCount <= 2 ? 12 : 0;
  return profileScore - fragilityPenalty;
}

function isMainProfile(profile: BotProfile): boolean {
  return profile.id === "main";
}

function nextHigherBid(wantedValue: BidValue, currentContract: Contract | null): BidValue | null {
  const available = getAvailableBidValues(currentContract);
  return available.find((value) => value >= wantedValue) ?? null;
}

export function chooseProfileBidFromHand(
  hand: Card[],
  profile: BotProfile,
  currentContract: Contract | null,
): BidDecision {
  const best = evaluateBestTrump(hand);
  const score = adjustedScore(best, profile);
  const wantedValue = bidValueForScore(score);

  if (!wantedValue) {
    return {
      action: "pass",
      confidence: confidenceFromScore(score),
      reason: "Main trop faible pour annoncer avec ce profil.",
    };
  }

  const value = nextHigherBid(wantedValue, currentContract);

  if (!value) {
    return {
      action: "pass",
      confidence: confidenceFromScore(score),
      reason: "Le contrat actuel est deja trop haut pour cette main.",
    };
  }

  const raiseRisk = currentContract ? currentContract.value - wantedValue : 0;
  if (currentContract && raiseRisk > profile.raiseMargin) {
    return {
      action: "pass",
      confidence: confidenceFromScore(score),
      reason: "Surenchere jugee trop risquee.",
    };
  }

  return {
    action: "bid",
    trump: best.trump,
    value,
    confidence: confidenceFromScore(score),
    reason: `Meilleur atout estime: ${best.trump}.`,
  };
}

function lastTeamBid(bids: Bid[], teamId: ReturnType<typeof playerTeam>): Extract<Bid, { action: "bid" }> | null {
  for (let index = bids.length - 1; index >= 0; index -= 1) {
    const bid = bids[index];
    if (bid.action === "bid" && playerTeam(bid.playerId) === teamId) {
      return bid;
    }
  }

  return null;
}

function withMainOpeningBonus(score: number, state: GameState, profile: BotProfile): number {
  if (!isMainProfile(profile)) return score;

  const isPartance = state.bids.length === 0 && state.currentPlayerId === state.startingPlayerId;
  return isPartance ? score + 5 : score;
}

function chooseMainBid(state: GameState, profile: BotProfile): BidDecision {
  const currentContract = getCurrentContract(state);
  const playerId = state.currentPlayerId;
  const teamId = playerTeam(playerId);
  const hand = state.hands[playerId];
  const best = evaluateBestTrump(hand);
  const partnerBid = lastTeamBid(
    state.bids.filter((bid) => bid.playerId !== playerId),
    teamId,
  );

  if (currentContract && currentContract.teamId === teamId) {
    const support = evaluateHandForTrump(hand, currentContract.trump);
    const bestScore = withMainOpeningBonus(adjustedScore(best, profile), state, profile);

    // Quand le partenaire a deja choisi une couleur, on la respecte.
    // On ne change d'atout que si notre couleur est nettement superieure.
    const supportBonus = partnerBid ? 10 + support.trumpCount * 3 + support.strongTrumpCount * 5 : 0;
    const supportScore = adjustedScore(support, profile) + supportBonus;
    const clearlyBetterOwnTrump = best.trump !== currentContract.trump && bestScore >= supportScore + 26;
    const preferredTrump = clearlyBetterOwnTrump ? best.trump : currentContract.trump;
    const preferredScore = clearlyBetterOwnTrump ? bestScore : supportScore;
    const wantedValue = bidValueForScore(preferredScore);
    const value = wantedValue ? nextHigherBid(wantedValue, currentContract) : null;

    if (!value) {
      return {
        action: "pass",
        confidence: confidenceFromScore(preferredScore),
        reason: "Le soutien au partenaire ne justifie pas une surenchere.",
      };
    }

    const raiseRisk = currentContract.value - wantedValue!;
    if (raiseRisk > profile.raiseMargin) {
      return {
        action: "pass",
        confidence: confidenceFromScore(preferredScore),
        reason: "Surenchere trop fragile malgre le soutien au partenaire.",
      };
    }

    return {
      action: "bid",
      trump: preferredTrump,
      value,
      confidence: confidenceFromScore(preferredScore),
      reason: clearlyBetterOwnTrump
        ? "Main nettement meilleure dans une autre couleur que celle du partenaire."
        : "Soutien de la couleur annoncee par le partenaire.",
    };
  }

  const score = withMainOpeningBonus(adjustedScore(best, profile), state, profile);
  const wantedValue = bidValueForScore(score);
  if (!wantedValue) {
    return {
      action: "pass",
      confidence: confidenceFromScore(score),
      reason: "Main trop faible pour ouvrir proprement.",
    };
  }

  const value = nextHigherBid(wantedValue, currentContract);
  if (!value) {
    return {
      action: "pass",
      confidence: confidenceFromScore(score),
      reason: "Le contrat actuel est trop haut pour intervenir proprement.",
    };
  }

  if (currentContract) {
    const raiseRisk = currentContract.value - wantedValue;
    const opponentOwnsContract = currentContract.teamId !== teamId;
    const interventionMargin = opponentOwnsContract ? profile.raiseMargin + 8 : profile.raiseMargin;

    if (raiseRisk > interventionMargin) {
      return {
        action: "pass",
        confidence: confidenceFromScore(score),
        reason: opponentOwnsContract
          ? "Intervention trop risquee sur le contrat adverse."
          : "Surenchere trop fragile.",
      };
    }
  }

  return {
    action: "bid",
    trump: best.trump,
    value,
    confidence: confidenceFromScore(score),
    reason: state.bids.length === 0 ? "Bonne main de partance." : `Meilleur atout estime: ${best.trump}.`,
  };
}

function shouldCoinche(hand: Card[], profile: BotProfile, contract: Contract): boolean {
  const defense = evaluateHandForTrump(hand, contract.trump);
  const defenseScore = adjustedScore(defense, profile);
  return defenseScore >= contract.value + profile.coincheMargin;
}

function shouldSurcoinche(hand: Card[], profile: BotProfile, contract: Contract): boolean {
  const attack = evaluateHandForTrump(hand, contract.trump);
  const attackScore = adjustedScore(attack, profile);
  return attackScore >= contract.value + profile.surcoincheMargin;
}

export function chooseProfileBid(state: GameState, profile: BotProfile): BidDecision {
  const currentContract = getCurrentContract(state);
  const playerId = state.currentPlayerId;
  const hand = state.hands[playerId];

  if (currentContract?.status === "coinched" && playerTeam(playerId) === currentContract.teamId) {
    if (shouldSurcoinche(hand, profile, currentContract)) {
      return {
        action: "surcoinche",
        confidence: 1,
        reason: "Main assez forte pour accepter le risque de surcoinche.",
      };
    }

    return {
      action: "pass",
      confidence: 0.5,
      reason: "Apres une coinche, le camp du contrat doit passer ou surcoincher.",
    };
  }

  if (currentContract?.status === "coinched") {
    return {
      action: "pass",
      confidence: 0.5,
      reason: "Apres une coinche, les annonces normales sont bloquees.",
    };
  }

  if (currentContract?.status === "normal" && playerTeam(playerId) !== currentContract.teamId) {
    if (shouldCoinche(hand, profile, currentContract)) {
      return {
        action: "coinche",
        confidence: 1,
        reason: "Defense assez forte contre l'atout adverse.",
      };
    }
  }

  if (isMainProfile(profile)) {
    return chooseMainBid(state, profile);
  }

  return chooseProfileBidFromHand(hand, profile, currentContract);
}
