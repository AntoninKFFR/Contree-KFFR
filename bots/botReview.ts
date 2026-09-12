import { OFFICIAL_BOT_PROFILE_ID } from "@/bots/profiles";
import { buildTrickKnowledge } from "@/bots/strategy/trickKnowledge";
import type { HumanDoctrineV2Trace } from "@/bots/strategy/humanDoctrineV2";
import type { HumanDoctrineV3Trace } from "@/bots/strategy/humanDoctrineV3";
import { cardId, createDeck } from "@/engine/cards";
import { getCurrentContract, playableCardsForCurrentPlayer } from "@/engine/game";
import type {
  Bid,
  Card,
  CompletedTrick,
  Contract,
  GameSettings,
  GameState,
  PlayerId,
  Suit,
  TeamId,
  Trick,
} from "@/engine/types";

export function isBotReviewModeEnabled(value = process.env.NEXT_PUBLIC_BOT_REVIEW_MODE): boolean {
  return value === "true";
}

export const BOT_REVIEW_MODE_ENABLED = isBotReviewModeEnabled();

export type BotReviewBidDecision =
  | { action: "pass" | "coinche" | "surcoinche" }
  | { action: "bid"; value: NonNullable<Extract<Bid, { action: "bid" }>["value"]>; trump: Suit };

export type BotReviewKnowledgeV1 = {
  voidSuitsByPlayer: Record<PlayerId, Suit[]>;
  playedTrumps: Card[];
  masterCardsBySuit: Record<Suit, Card | null>;
  cutRiskBySuit: Record<Suit, { level: string; knownVoidOpponents: PlayerId[]; knownVoidPartner: boolean }>;
};

export type BotReviewScenarioV1 = {
  version: 1;
  decisionId: string;
  capturedAt: string;
  botProfile: string;
  playerId: PlayerId;
  phase: "bidding" | "playing";
  roundNumber: number;
  trickNumber: number;
  startingPlayerId: PlayerId;
  settings: GameSettings;
  ownHand: Card[];
  trump: Suit | null;
  contract: Contract | null;
  bids: Bid[];
  currentTrick: Trick;
  completedTricks: CompletedTrick[];
  totalScore: Record<TeamId, number>;
  trickPoints: Record<TeamId, number>;
  roundScore: Record<TeamId, number>;
  legalCards: Card[];
  chosenCard: Card | null;
  chosenBid: BotReviewBidDecision | null;
  decisionEngine: "legacy_heuristic" | "human_doctrine_v2_comm" | "auction_doctrine_v3" | "montecarlo_v1";
  elapsedMs: number;
  trace: {
    source: "legacy-heuristic" | "human-doctrine-v2-communication" | "auction-doctrine-v3-conversation" | "monte-carlo-v1";
    knowledge?: BotReviewKnowledgeV1;
    bidding?: HumanDoctrineV2Trace | HumanDoctrineV3Trace;
  };
  humanComment?: string;
};

type CaptureOptions = {
  decisionNumber: number;
  elapsedMs: number;
  chosenCard?: Card;
  chosenBid?: BotReviewBidDecision;
  botProfile?: string;
  biddingTrace?: HumanDoctrineV2Trace | HumanDoctrineV3Trace;
  capturedAt?: string;
};

function cloneCards(cards: Card[]): Card[] {
  return cards.map((card) => ({ ...card }));
}

function cloneTrick<T extends Trick | CompletedTrick>(trick: T): T {
  return {
    ...trick,
    cards: trick.cards.map((played) => ({ playerId: played.playerId, card: { ...played.card } })),
  };
}

function reviewKnowledge(state: GameState): BotReviewKnowledgeV1 | undefined {
  if (state.phase !== "playing") return undefined;
  const knowledge = buildTrickKnowledge(state);
  return {
    voidSuitsByPlayer: knowledge.voidSuitsByPlayer,
    playedTrumps: cloneCards(knowledge.playedTrumps),
    masterCardsBySuit: Object.fromEntries(
      Object.entries(knowledge.masterCardsBySuit).map(([suit, card]) => [suit, card ? { ...card } : null]),
    ) as Record<Suit, Card | null>,
    cutRiskBySuit: Object.fromEntries(
      Object.entries(knowledge.cutRiskBySuit).map(([suit, risk]) => [suit, {
        level: risk.level,
        knownVoidOpponents: [...risk.knownVoidOpponents],
        knownVoidPartner: risk.knownVoidPartner,
      }]),
    ) as BotReviewKnowledgeV1["cutRiskBySuit"],
  };
}

export function captureBotReviewScenario(
  state: GameState,
  options: CaptureOptions,
): BotReviewScenarioV1 {
  if (state.phase !== "bidding" && state.phase !== "playing") {
    throw new Error("Bot review: la capture exige une decision active.");
  }
  const isCardDecision = state.phase === "playing";
  if (isCardDecision !== Boolean(options.chosenCard)) {
    throw new Error("Bot review: la decision ne correspond pas a la phase.");
  }
  if (!isCardDecision && !options.chosenBid) {
    throw new Error("Bot review: annonce choisie manquante.");
  }
  if (isCardDecision && options.biddingTrace) {
    throw new Error("Bot review: une trace d'enchere ne peut pas accompagner une decision carte.");
  }
  const playerId = state.currentPlayerId;
  const trickNumber = state.completedTricks.length + 1;
  const isV3Bidding = Boolean(
    options.biddingTrace
    && "version" in options.biddingTrace
    && options.biddingTrace.version === 3,
  );
  return {
    version: 1,
    decisionId: `r${state.roundNumber}-t${trickNumber}-p${playerId}-d${options.decisionNumber}`,
    capturedAt: options.capturedAt ?? new Date().toISOString(),
    botProfile: options.botProfile ?? OFFICIAL_BOT_PROFILE_ID,
    playerId,
    phase: state.phase,
    roundNumber: state.roundNumber,
    trickNumber,
    startingPlayerId: state.startingPlayerId,
    settings: { ...state.settings },
    ownHand: cloneCards(state.hands[playerId]),
    trump: state.trump,
    contract: getCurrentContract(state) ? { ...getCurrentContract(state)! } : null,
    bids: state.bids.map((bid) => ({ ...bid })),
    currentTrick: cloneTrick(state.currentTrick),
    completedTricks: state.completedTricks.map(cloneTrick),
    totalScore: { ...state.totalScore },
    trickPoints: { ...state.trickPoints },
    roundScore: { ...state.roundScore },
    legalCards: isCardDecision ? cloneCards(playableCardsForCurrentPlayer(state)) : [],
    chosenCard: options.chosenCard ? { ...options.chosenCard } : null,
    chosenBid: options.chosenBid ? { ...options.chosenBid } : null,
    decisionEngine: isCardDecision
      ? "montecarlo_v1"
      : isV3Bidding
        ? "auction_doctrine_v3"
        : options.biddingTrace
          ? "human_doctrine_v2_comm"
          : "legacy_heuristic",
    elapsedMs: options.elapsedMs,
    trace: {
      source: isCardDecision
        ? "monte-carlo-v1"
        : isV3Bidding
          ? "auction-doctrine-v3-conversation"
          : options.biddingTrace
            ? "human-doctrine-v2-communication"
            : "legacy-heuristic",
      knowledge: reviewKnowledge(state),
      bidding: options.biddingTrace,
    },
  };
}

function assertCard(card: Card, label: string): void {
  if (!createDeck().some((candidate) => cardId(candidate) === cardId(card))) {
    throw new Error(`Bot review: ${label} invalide.`);
  }
}

export function validateBotReviewScenario(scenario: BotReviewScenarioV1): void {
  if (scenario.version !== 1) throw new Error("Bot review: version non supportee.");
  if (![0, 1, 2, 3].includes(scenario.playerId)) throw new Error("Bot review: playerId invalide.");
  if (!scenario.decisionId) throw new Error("Bot review: decisionId manquant.");
  scenario.ownHand.forEach((card) => assertCard(card, "carte de la main"));
  scenario.legalCards.forEach((card) => assertCard(card, "carte legale"));
  if (scenario.phase === "playing") {
    if (!scenario.chosenCard || scenario.chosenBid) throw new Error("Bot review: decision carte invalide.");
    assertCard(scenario.chosenCard, "carte choisie");
    const handIds = new Set(scenario.ownHand.map(cardId));
    const legalIds = new Set(scenario.legalCards.map(cardId));
    if (!handIds.has(cardId(scenario.chosenCard)) || !legalIds.has(cardId(scenario.chosenCard))) {
      throw new Error("Bot review: la carte choisie n'est pas legale.");
    }
  } else if (!scenario.chosenBid || scenario.chosenCard || scenario.legalCards.length > 0) {
    throw new Error("Bot review: decision d'annonce invalide.");
  }
}

export function botReviewScenarioToGameState(scenario: BotReviewScenarioV1): GameState {
  validateBotReviewScenario(scenario);
  const hands: GameState["hands"] = { 0: [], 1: [], 2: [], 3: [] };
  hands[scenario.playerId] = cloneCards(scenario.ownHand);
  const state: GameState = {
    settings: { ...scenario.settings },
    phase: scenario.phase,
    roundNumber: scenario.roundNumber,
    startingPlayerId: scenario.startingPlayerId,
    totalScore: { ...scenario.totalScore },
    roundHistory: [],
    winnerTeam: null,
    trump: scenario.trump,
    hands,
    currentPlayerId: scenario.playerId,
    currentTrick: cloneTrick(scenario.currentTrick),
    completedTricks: scenario.completedTricks.map(cloneTrick),
    bids: scenario.bids.map((bid) => ({ ...bid })),
    contract: scenario.contract ? { ...scenario.contract } : null,
    result: null,
    trickPoints: { ...scenario.trickPoints },
    roundScore: { ...scenario.roundScore },
    message: `Bot review ${scenario.decisionId}`,
  };
  if (scenario.phase === "playing") {
    const computedLegal = playableCardsForCurrentPlayer(state).map(cardId).sort();
    const capturedLegal = scenario.legalCards.map(cardId).sort();
    if (JSON.stringify(computedLegal) !== JSON.stringify(capturedLegal)) {
      throw new Error("Bot review: legalCards ne correspond pas a la position.");
    }
  }
  return state;
}

export function serializeBotReviewScenario(
  scenario: BotReviewScenarioV1,
  humanComment?: string,
): string {
  return JSON.stringify({
    ...scenario,
    ...(humanComment?.trim() ? { humanComment: humanComment.trim() } : {}),
  }, null, 2);
}
