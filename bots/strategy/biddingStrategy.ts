import { getAvailableBidValues } from "@/engine/bidding";
import { getCurrentContract } from "@/engine/game";
import { playerTeam } from "@/engine/rules";
import type { Bid, BidValue, Card, Contract, GameState, Suit } from "@/engine/types";
import type { BotProfile } from "@/bots/profiles";
import { evaluateBestTrump, evaluateHandForTrump, type HandEvaluation } from "@/bots/evaluation/handEvaluation";
import { buildBiddingContext } from "@/bots/strategy/biddingContext";

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

function clampBidValue(value: number): BidValue {
  if (value <= 80) return 80;
  if (value <= 90) return 90;
  if (value <= 100) return 100;
  if (value <= 110) return 110;
  if (value <= 120) return 120;
  if (value <= 130) return 130;
  if (value <= 140) return 140;
  if (value <= 150) return 150;
  return 160;
}

function adjustedScore(evaluation: HandEvaluation, profile: BotProfile): number {
  const profileScore = evaluation.score * profile.bidRisk - profile.bidOffset;

  // Une main avec beaucoup de points mais peu d'atouts est plus fragile en contrat.
  const fragilityPenalty = evaluation.trumpCount <= 2 ? 12 : 0;
  return profileScore - fragilityPenalty;
}

function conventionalBidValue(
  evaluation: HandEvaluation,
  score: number,
  allowStructuralOverride = true,
): BidValue | null {
  const scoreValue = bidValueForScore(score);
  if (!allowStructuralOverride) {
    return scoreValue;
  }

  const singlePieceSmallGame =
    (evaluation.hasJackTrump || evaluation.hasNineTrump) &&
    !(evaluation.hasJackTrump && evaluation.hasNineTrump) &&
    evaluation.trumpSupportCount >= 2;

  if (evaluation.capotPotential >= 20) {
    if (evaluation.sideMasterTrickCount >= 4 && evaluation.trumpCount >= 5) {
      return 140;
    }

    return 130;
  }

  if (
    evaluation.hasJackTrump &&
    evaluation.hasNineTrump &&
    evaluation.strongSecondarySuitCount >= 1 &&
    evaluation.trumpCount >= 4
  ) {
    return scoreValue && scoreValue >= 130 ? scoreValue : 120;
  }

  if (
    evaluation.hasJackTrump &&
    evaluation.hasNineTrump &&
    evaluation.trumpSupportCount >= 2 &&
    evaluation.aceCount >= 2
  ) {
    return 110;
  }

  if (
    evaluation.hasJackTrump &&
    evaluation.hasNineTrump &&
    evaluation.trumpSupportCount >= 2 &&
    evaluation.aceCount >= 1
  ) {
    return 100;
  }

  if (
    evaluation.hasJackTrump &&
    evaluation.hasNineTrump &&
    evaluation.trumpSupportCount >= 1 &&
    evaluation.sideMasterTrickCount >= 1
  ) {
    return 90;
  }

  if (singlePieceSmallGame) {
    return 80;
  }

  return scoreValue;
}

function isMainProfile(profile: BotProfile): boolean {
  return (
    profile.id === "main" ||
    profile.id === "main_montecarlo" ||
    profile.id === "main_montecarlo_v2" ||
    profile.id === "main_montecarlo_bidding"
  );
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
  const wantedValue = conventionalBidValue(best, score, isMainProfile(profile));

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
  const context = buildBiddingContext(state);
  const partnerBid = lastTeamBid(
    state.bids.filter((bid) => bid.playerId !== playerId),
    teamId,
  );

  if (currentContract && currentContract.teamId === teamId && context.isSupportingPartner) {
    const support = evaluateHandForTrump(hand, currentContract.trump);
    const bestScore = withMainOpeningBonus(adjustedScore(best, profile), state, profile);

    // Quand le partenaire a deja choisi une couleur, on la respecte.
    // On ne change d'atout que si notre couleur est nettement superieure.
    const supportBonus = partnerBid ? 10 + support.trumpCount * 3 + support.strongTrumpCount * 5 : 0;
    const supportScore = adjustedScore(support, profile) + supportBonus;
    const clearlyBetterOwnTrump = best.trump !== currentContract.trump && bestScore >= supportScore + 26;
    const preferredTrump = clearlyBetterOwnTrump ? best.trump : currentContract.trump;
    const preferredScore = clearlyBetterOwnTrump ? bestScore : supportScore;
    let supportRaise =
      support.hasJackTrump && support.hasNineTrump && support.trumpSupportCount >= 2
        ? 20 + (support.aceCount >= 2 || support.strongSecondarySuitCount >= 1 ? 10 : 0)
        : (support.hasJackTrump || support.hasNineTrump) && support.trumpSupportCount >= 2
          ? 10
          : support.trumpCount >= 3 && support.aceCount >= 1
            ? 10
            : 0;
    if (context.partnerStrength === "strong" && supportRaise >= 10) {
      supportRaise += 10;
    } else if (context.partnerStrength === "weak" && context.isLateBidding && supportRaise >= 20) {
      supportRaise -= 10;
    }

    if (context.isLateBidding && supportRaise < 30) {
      supportRaise = Math.max(0, supportRaise - 10);
    }

    if (context.opponentHasOvercalled && context.partnerStrength !== "weak" && supportRaise >= 10) {
      supportRaise += 10;
    }

    const supportValue = supportRaise > 0 ? clampBidValue(currentContract.value + supportRaise) : null;
    const wantedValue = clearlyBetterOwnTrump
      ? conventionalBidValue(best, preferredScore)
      : supportValue;
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
  const wantedValue = conventionalBidValue(best, score);
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
    const isSmallGame =
      (best.hasJackTrump || best.hasNineTrump) &&
      !(best.hasJackTrump && best.hasNineTrump) &&
      best.trumpSupportCount >= 2;

    if (opponentOwnsContract && isSmallGame && currentContract.value >= 90) {
      return {
        action: "pass",
        confidence: confidenceFromScore(score),
        reason: "Petit jeu: intervention trop ambitieuse sur un contrat deja installe.",
      };
    }

    if (opponentOwnsContract && context.isContestingOpponent) {
      const hasRealTrumpBase =
        (best.hasJackTrump && best.hasNineTrump && best.trumpSupportCount >= 2) ||
        ((best.hasJackTrump || best.hasNineTrump) && best.trumpSupportCount >= 3);
      const contractIsHigh = currentContract.value >= 120 || context.isLateBidding;
      const onlyMinimumRaise = wantedValue <= clampBidValue(currentContract.value + 10);

      if (context.opponentStrength === "strong" && contractIsHigh && !hasRealTrumpBase) {
        return {
          action: "pass",
          confidence: confidenceFromScore(score),
          reason: "Annonce adverse forte en fin de sequence: main insuffisante pour se battre.",
        };
      }

      if (
        context.opponentStrength === "strong" &&
        onlyMinimumRaise &&
        best.aceCount === 0 &&
        best.strongSecondarySuitCount === 0
      ) {
        return {
          action: "pass",
          confidence: confidenceFromScore(score),
          reason: "Contrat adverse solide: montee trop courte sans appuis lateraux.",
        };
      }
    }

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

function bidDecisionKey(decision: BidDecision): string {
  return decision.action === "bid"
    ? `${decision.action}:${decision.value}:${decision.trump}`
    : decision.action;
}

function addUniqueDecision(decisions: BidDecision[], decision: BidDecision): void {
  if (!decisions.some((existing) => bidDecisionKey(existing) === bidDecisionKey(decision))) {
    decisions.push(decision);
  }
}

function nearbyBidValues(wantedValue: BidValue, currentContract: Contract | null): BidValue[] {
  const available = getAvailableBidValues(currentContract);
  const startIndex = available.findIndex((value) => value >= wantedValue);

  if (startIndex === -1) return [];

  return available.slice(startIndex, startIndex + 2);
}

function addBidCandidatesForScore(
  decisions: BidDecision[],
  trump: Suit,
  score: number,
  currentContract: Contract | null,
  reason: string,
): void {
  const wantedValue = bidValueForScore(score);
  if (!wantedValue) return;

  for (const value of nearbyBidValues(wantedValue, currentContract)) {
    addUniqueDecision(decisions, {
      action: "bid",
      trump,
      value,
      confidence: confidenceFromScore(score),
      reason,
    });
  }
}

export function getPlausibleBidCandidates(
  state: GameState,
  profile: BotProfile,
  baseDecision: BidDecision = chooseProfileBid(state, profile),
): BidDecision[] {
  if (baseDecision.action === "coinche" || baseDecision.action === "surcoinche") {
    return [baseDecision];
  }

  const currentContract = getCurrentContract(state);
  if (currentContract && currentContract.status !== "normal") {
    return [baseDecision];
  }

  const playerId = state.currentPlayerId;
  const teamId = playerTeam(playerId);
  const hand = state.hands[playerId];
  const decisions: BidDecision[] = [];

  addUniqueDecision(decisions, {
    action: "pass",
    confidence: 1 - baseDecision.confidence,
    reason: "Candidat Monte Carlo: passer.",
  });
  if (baseDecision.action === "bid") {
    addUniqueDecision(decisions, baseDecision);
  }

  const best = evaluateBestTrump(hand);
  const bestScore = withMainOpeningBonus(adjustedScore(best, profile), state, profile);
  addBidCandidatesForScore(
    decisions,
    best.trump,
    bestScore,
    currentContract,
    "Candidat Monte Carlo: meilleure couleur de la main.",
  );

  if (currentContract && currentContract.teamId === teamId) {
    const support = evaluateHandForTrump(hand, currentContract.trump);
    const partnerBid = lastTeamBid(
      state.bids.filter((bid) => bid.playerId !== playerId),
      teamId,
    );
    const supportBonus = partnerBid ? 10 + support.trumpCount * 3 + support.strongTrumpCount * 5 : 0;

    addBidCandidatesForScore(
      decisions,
      currentContract.trump,
      adjustedScore(support, profile) + supportBonus,
      currentContract,
      "Candidat Monte Carlo: soutenir la couleur du partenaire.",
    );
  }

  const alternativeTrumps = (["clubs", "diamonds", "hearts", "spades"] as Suit[])
    .map((trump) => {
      const evaluation = evaluateHandForTrump(hand, trump);
      return {
        trump,
        score: withMainOpeningBonus(adjustedScore(evaluation, profile), state, profile),
      };
    })
    .filter((candidate) => candidate.trump !== best.trump && candidate.score >= bestScore - 22)
    .sort((first, second) => second.score - first.score)
    .slice(0, 2);

  for (const candidate of alternativeTrumps) {
    addBidCandidatesForScore(
      decisions,
      candidate.trump,
      candidate.score,
      currentContract,
      "Candidat Monte Carlo: autre couleur proche de la meilleure evaluation.",
    );
  }

  return decisions.slice(0, 6);
}
