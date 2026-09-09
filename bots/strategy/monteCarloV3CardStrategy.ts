import { sameCard } from "@/engine/cards";
import { playableCardsForCurrentPlayer, playCard } from "@/engine/game";
import { cardPoints, compareCards, getTrickWinner, playerTeam } from "@/engine/rules";
import type { Card, GameState, PlayerId, Suit, TeamId } from "@/engine/types";
import { buildBotKnowledgeV3, cardBeliefWeight, type BotKnowledgeV3 } from "@/bots/strategy/botKnowledgeV3";
import { chooseProfileCardToPlay } from "@/bots/strategy/cardStrategy";
import { getBotProfile } from "@/bots/profiles";

const PLAYERS: PlayerId[] = [0, 1, 2, 3];
const DEFAULT_BUDGET = 72;
const MAX_CANDIDATES = 5;
const ENDGAME_NODE_CAP = 12_000;

export const V3_EVALUATION_WEIGHTS = {
  trickPointDifference: 1,
  roundScoreDifference: 1,
  contractOutcome: 1.65,
  contractFailure: 1.9,
  immediateTrick: 0.3,
  protectedCardLoss: 0.45,
} as const;

export type MonteCarloV3Options = {
  totalBudget?: number;
  seed?: number;
  nodeCap?: number;
  disableTactics?: boolean;
};

export type BotDecisionTraceV3 = {
  card: Card;
  source: "tactical" | "monte-carlo" | "endgame" | "forced";
  reason: string;
  candidates: Card[];
  scores: Array<{ card: Card; score: number }>;
  samples: number;
  nodes: number;
};

function cardKey(card: Card): string {
  return `${card.rank}-${card.suit}`;
}

function seededRandom(seed: number): () => number {
  let value = seed >>> 0;
  return () => {
    value += 0x6d2b79f5;
    let next = value;
    next = Math.imul(next ^ (next >>> 15), next | 1);
    next ^= next + Math.imul(next ^ (next >>> 7), next | 61);
    return ((next ^ (next >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashPublicStateV3(state: GameState): number {
  const visible = [
    state.currentPlayerId,
    state.trump,
    state.contract ? `${state.contract.playerId}:${state.contract.value}:${state.contract.trump}:${state.contract.status}` : "-",
    state.hands[state.currentPlayerId].map(cardKey).sort().join("|"),
    state.currentTrick.cards.map((play) => `${play.playerId}:${cardKey(play.card)}`).join("|"),
    state.completedTricks.flatMap((trick) => trick.cards.map((play) => `${play.playerId}:${cardKey(play.card)}`)).join("|"),
    state.bids.map((bid) => bid.action === "bid" ? `${bid.playerId}:bid:${bid.value}:${bid.trump}` : `${bid.playerId}:${bid.action}`).join("|"),
    state.trickPoints[0],
    state.trickPoints[1],
    state.totalScore[0],
    state.totalScore[1],
  ].join("::");
  let hash = 2166136261;
  for (let index = 0; index < visible.length; index += 1) {
    hash ^= visible.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function currentWinnerCard(state: GameState): Card | null {
  if (!state.trump || state.currentTrick.cards.length === 0) return null;
  const winner = getTrickWinner(state.currentTrick, state.trump);
  return state.currentTrick.cards.find((play) => play.playerId === winner)?.card ?? null;
}

function wouldWin(card: Card, state: GameState): boolean {
  if (!state.trump || state.currentTrick.cards.length === 0) return true;
  const winner = currentWinnerCard(state);
  return Boolean(winner && compareCards(card, winner, state.currentTrick.cards[0].card.suit, state.trump) > 0);
}

function preservationCost(card: Card, trump: Suit, knowledge: BotKnowledgeV3): number {
  const isMaster = knowledge.masterCardsBySuit[card.suit];
  return cardPoints(card, trump)
    + (card.suit === trump && card.rank === "J" ? 24 : 0)
    + (card.suit === trump && card.rank === "9" ? 18 : 0)
    + (isMaster && sameCard(isMaster, card) ? 13 : 0)
    + knowledge.cutRiskBySuit[card.suit] * 2;
}

function lowestCost(cards: Card[], state: GameState, knowledge: BotKnowledgeV3): Card {
  return [...cards].sort((a, b) => preservationCost(a, state.trump as Suit, knowledge) - preservationCost(b, state.trump as Suit, knowledge) || cardKey(a).localeCompare(cardKey(b)))[0];
}

function weakestWinner(cards: Card[], state: GameState, knowledge: BotKnowledgeV3): Card | null {
  const winners = cards.filter((card) => wouldWin(card, state));
  return winners.length ? lowestCost(winners, state, knowledge) : null;
}

/** Only returns a card for near-obvious expert rules; ambiguous positions continue to search. */
export function chooseTacticalCardV3(state: GameState, knowledge = buildBotKnowledgeV3(state)): { card: Card; reason: string } | null {
  if (!state.trump) return null;
  const legal = playableCardsForCurrentPlayer(state);
  if (legal.length === 1) return { card: legal[0], reason: "seul coup légal" };

  if (state.currentTrick.cards.length > 0) {
    const trickPoints = state.currentTrick.cards.reduce((sum, play) => sum + cardPoints(play.card, state.trump as Suit), 0);
    if (knowledge.position.partnerWinning && knowledge.position.trickPosition === 4) {
      return { card: lowestCost(legal, state, knowledge), reason: "partenaire maître : préserver les cartes fortes" };
    }
    const winner = weakestWinner(legal, state, knowledge);
    if (winner && (knowledge.position.trickPosition === 4 || trickPoints >= 10)) {
      return { card: winner, reason: "prendre le pli avec la plus faible carte suffisante" };
    }
    if (!winner && knowledge.position.trickPosition === 4) {
      return { card: lowestCost(legal, state, knowledge), reason: "pli perdu : défausse la moins coûteuse" };
    }
  } else {
    const vulnerableHonors = legal.filter((card) =>
      card.suit !== state.trump && cardPoints(card, state.trump as Suit) >= 10 && knowledge.cutRiskBySuit[card.suit] >= 0.45,
    );
    const safeAlternatives = legal.filter((card) =>
      !vulnerableHonors.some((honor) => sameCard(honor, card)) && preservationCost(card, state.trump as Suit, knowledge) <= 4,
    );
    if (vulnerableHonors.length && safeAlternatives.length) {
      return { card: lowestCost(safeAlternatives, state, knowledge), reason: "éviter un honneur dans une coupe adverse connue" };
    }
    const partnerCutLeads = legal.filter((card) =>
      card.suit !== state.trump &&
      knowledge.partnerKnownCuttingBySuit[card.suit] &&
      knowledge.knownCuttingOpponentsBySuit[card.suit].length === 0 &&
      cardPoints(card, state.trump as Suit) <= 4,
    );
    if (partnerCutLeads.length) {
      return { card: lowestCost(partnerCutLeads, state, knowledge), reason: "donner une coupe connue au partenaire" };
    }
    const trumps = legal.filter((card) => card.suit === state.trump);
    const controlsTrump = trumps.some((card) => card.rank === "J") && trumps.length >= 3;
    const partnerCutUseful = Object.entries(knowledge.partnerKnownCuttingBySuit).some(([suit, cuts]) => cuts && suit !== state.trump);
    if (controlsTrump && knowledge.unknownTrumpCount > trumps.length && !partnerCutUseful) {
      return { card: lowestCost(trumps, state, knowledge), reason: "tirer atout avec contrôle sans détruire une coupe partenaire connue" };
    }
  }
  return null;
}

function unique(cards: Array<Card | null>): Card[] {
  const seen = new Set<string>();
  return cards.filter((card): card is Card => {
    if (!card || seen.has(cardKey(card))) return false;
    seen.add(cardKey(card));
    return true;
  });
}

export function getMonteCarloV3Candidates(state: GameState, knowledge = buildBotKnowledgeV3(state)): Card[] {
  const legal = playableCardsForCurrentPlayer(state);
  if (!state.trump || legal.length <= 1) return legal;
  const winners = legal.filter((card) => wouldWin(card, state));
  const losers = legal.filter((card) => !wouldWin(card, state));
  const masters = legal.filter((card) => {
    const master = knowledge.masterCardsBySuit[card.suit];
    return master && sameCard(master, card);
  });
  const safeLead = state.currentTrick.cards.length === 0
    ? masters.filter((card) => knowledge.cutRiskBySuit[card.suit] < 0.45)[0] ?? null
    : null;
  const candidates = unique([
    chooseProfileCardToPlay(state, getBotProfile("main")),
    lowestCost(legal, state, knowledge),
    weakestWinner(winners, state, knowledge),
    winners.length ? [...winners].sort((a, b) => preservationCost(b, state.trump as Suit, knowledge) - preservationCost(a, state.trump as Suit, knowledge))[0] : null,
    losers.length ? lowestCost(losers, state, knowledge) : null,
    safeLead,
    masters[0] ?? null,
  ]);
  return (candidates.length ? candidates : legal).slice(0, MAX_CANDIDATES);
}

function weightedChoice(players: PlayerId[], card: Card, knowledge: BotKnowledgeV3, random: () => number): PlayerId {
  const weights = players.map((player) => cardBeliefWeight(knowledge, player, card, knowledge.currentTrumpMaster?.suit ?? null));
  let cursor = random() * weights.reduce((sum, weight) => sum + weight, 0);
  for (let index = 0; index < players.length; index += 1) {
    cursor -= weights[index];
    if (cursor <= 0) return players[index];
  }
  return players[players.length - 1];
}

export function createPlausibleStateV3(state: GameState, random: () => number): GameState | null {
  const knowledge = buildBotKnowledgeV3(state);
  for (let attempt = 0; attempt < 24; attempt += 1) {
    const quotas = { ...knowledge.remainingCardCounts };
    quotas[knowledge.viewerId] = 0;
    const hands = { 0: [], 1: [], 2: [], 3: [] } as GameState["hands"];
    hands[knowledge.viewerId] = [...knowledge.ownHand];
    const shuffled = [...knowledge.unknownCards].sort(() => random() - 0.5).sort((a, b) => {
      const options = (card: Card) => PLAYERS.filter((player) => player !== knowledge.viewerId && quotas[player] > 0 && !knowledge.hardVoidSuits[player].includes(card.suit)).length;
      return options(a) - options(b);
    });
    let valid = true;
    for (const card of shuffled) {
      const eligible = PLAYERS.filter((player) => player !== knowledge.viewerId && quotas[player] > 0 && !knowledge.hardVoidSuits[player].includes(card.suit));
      if (!eligible.length) { valid = false; break; }
      const player = weightedChoice(eligible, card, knowledge, random);
      hands[player].push(card);
      quotas[player] -= 1;
    }
    if (valid && PLAYERS.every((player) => quotas[player] === 0)) return { ...state, hands };
  }
  return null;
}

function tacticalRolloutCard(state: GameState): Card {
  const knowledge = buildBotKnowledgeV3(state);
  const fourthSeatTactic = state.currentTrick.cards.length === 3
    ? chooseTacticalCardV3(state, knowledge)
    : null;
  return fourthSeatTactic?.card ?? chooseProfileCardToPlay(state, getBotProfile("main"));
}

function rollout(state: GameState): GameState {
  let next = state;
  let guard = 0;
  while (next.phase === "playing" && guard < 40) {
    next = playCard(next, next.currentPlayerId, tacticalRolloutCard(next));
    guard += 1;
  }
  return next;
}

function evaluate(finalState: GameState, team: TeamId): number {
  const opponent = team === 0 ? 1 : 0;
  const trickDiff = finalState.trickPoints[team] - finalState.trickPoints[opponent];
  if (finalState.result?.kind !== "played") return trickDiff * V3_EVALUATION_WEIGHTS.trickPointDifference;
  const roundDiff = finalState.result.roundScore[team] - finalState.result.roundScore[opponent];
  const attacking = finalState.result.contract.teamId === team;
  const made = finalState.result.contractSucceeded === attacking;
  const contract = finalState.result.contract.value * finalState.result.multiplier;
  return roundDiff * V3_EVALUATION_WEIGHTS.roundScoreDifference + trickDiff * V3_EVALUATION_WEIGHTS.trickPointDifference + contract * (made ? V3_EVALUATION_WEIGHTS.contractOutcome : -V3_EVALUATION_WEIGHTS.contractFailure);
}

function immediateAdjustment(state: GameState, card: Card): number {
  if (!state.trump || state.currentTrick.cards.length === 0) return 0;
  const points = cardPoints(card, state.trump);
  const trickPoints = state.currentTrick.cards.reduce((sum, play) => sum + cardPoints(play.card, state.trump as Suit), 0) + points;
  return wouldWin(card, state) ? trickPoints * V3_EVALUATION_WEIGHTS.immediateTrick : -points * V3_EVALUATION_WEIGHTS.protectedCardLoss;
}

function minimax(state: GameState, team: TeamId, cap: { nodes: number; max: number }): number | null {
  cap.nodes += 1;
  if (cap.nodes > cap.max) return null;
  if (state.phase !== "playing") return evaluate(state, team);
  const legal = playableCardsForCurrentPlayer(state);
  const maximizing = playerTeam(state.currentPlayerId) === team;
  let best = maximizing ? Number.NEGATIVE_INFINITY : Number.POSITIVE_INFINITY;
  for (const card of legal) {
    const score = minimax(playCard(state, state.currentPlayerId, card), team, cap);
    if (score === null) return null;
    best = maximizing ? Math.max(best, score) : Math.min(best, score);
  }
  return best;
}

export function chooseMonteCarloV3Decision(state: GameState, options: MonteCarloV3Options = {}): BotDecisionTraceV3 {
  if (state.phase !== "playing" || !state.trump) throw new Error("V3 ne peut jouer qu'après la détermination de l'atout.");
  const knowledge = buildBotKnowledgeV3(state);
  const legal = playableCardsForCurrentPlayer(state);
  if (!legal.length) throw new Error("V3 n'a aucune carte jouable.");
  if (legal.length === 1) return { card: legal[0], source: "forced", reason: "seul coup légal", candidates: legal, scores: [], samples: 0, nodes: 0 };
  const tactical = options.disableTactics ? null : chooseTacticalCardV3(state, knowledge);
  if (tactical) return { card: tactical.card, source: "tactical", reason: tactical.reason, candidates: legal, scores: [], samples: 0, nodes: 0 };

  const candidates = getMonteCarloV3Candidates(state, knowledge);
  const budget = Math.max(candidates.length, options.totalBudget ?? DEFAULT_BUDGET);
  const samplesPerCandidate = Math.max(1, Math.floor(budget / candidates.length));
  const baseSeed = options.seed ?? (hashPublicStateV3(state) ^ 0x51ed270b);
  const team = playerTeam(state.currentPlayerId);
  const endgame = knowledge.ownHand.length <= 3;
  let totalNodes = 0;
  const scores = candidates.map((candidate) => {
    let total = 0;
    let completed = 0;
    for (let sample = 0; sample < samplesPerCandidate; sample += 1) {
      // Common random numbers make candidate comparisons less noisy: every
      // candidate is evaluated against the same public-information deal sample.
      const plausible = createPlausibleStateV3(state, seededRandom(baseSeed + sample * 8191));
      if (!plausible) continue;
      const after = playCard(plausible, plausible.currentPlayerId, candidate);
      let score: number | null;
      if (endgame) {
        const cap = { nodes: 0, max: options.nodeCap ?? ENDGAME_NODE_CAP };
        score = minimax(after, team, cap);
        totalNodes += cap.nodes;
        if (score === null) score = evaluate(rollout(after), team);
      } else {
        score = evaluate(rollout(after), team);
      }
      total += score + immediateAdjustment(state, candidate);
      completed += 1;
    }
    return { card: candidate, score: completed ? total / completed : Number.NEGATIVE_INFINITY };
  }).sort((a, b) => b.score - a.score || cardKey(a.card).localeCompare(cardKey(b.card)));
  return {
    card: scores[0].card,
    source: endgame ? "endgame" : "monte-carlo",
    reason: endgame ? "recherche de fin de manche bornée sur distributions plausibles" : "meilleure espérance sur distributions plausibles",
    candidates,
    scores,
    samples: samplesPerCandidate,
    nodes: totalNodes,
  };
}

export function chooseMonteCarloV3CardToPlay(state: GameState, options: MonteCarloV3Options = {}): Card {
  const trace = chooseMonteCarloV3Decision(state, options);
  if (process.env.NODE_ENV === "development" && process.env.BOT_V3_TRACE === "1") {
    console.debug("[bot-v3]", { ...trace, seed: options.seed ?? hashPublicStateV3(state) });
  }
  return trace.card;
}
