// Offline-only perfect-information oracle. Production bots must never import this module.
import { getBotProfile } from "@/bots/profiles";
import { chooseProfileCardToPlay } from "@/bots/strategy/cardStrategy";
import { playableCardsForCurrentPlayer, playCard } from "@/engine/game";
import { playerTeam } from "@/engine/rules";
import type { Card, GameState, TeamId } from "@/engine/types";

export type OracleCardValue = { card: Card; value: number };
export type OracleDecision = {
  bestCard: Card;
  values: OracleCardValue[];
  exact: boolean;
  nodes: number;
};

function cardKey(card: Card): string { return `${card.rank}-${card.suit}`; }

function evaluate(state: GameState, team: TeamId): number {
  const opponent = team === 0 ? 1 : 0;
  if (state.result?.kind === "played") {
    return state.result.roundScore[team] - state.result.roundScore[opponent];
  }
  return state.trickPoints[team] - state.trickPoints[opponent];
}

function exactSearch(
  state: GameState,
  team: TeamId,
  counter: { nodes: number; cap: number },
): number | null {
  counter.nodes += 1;
  if (counter.nodes > counter.cap) return null;
  if (state.phase !== "playing") return evaluate(state, team);
  const maximizing = playerTeam(state.currentPlayerId) === team;
  let best = maximizing ? Number.NEGATIVE_INFINITY : Number.POSITIVE_INFINITY;
  for (const card of playableCardsForCurrentPlayer(state)) {
    const value = exactSearch(playCard(state, state.currentPlayerId, card), team, counter);
    if (value === null) return null;
    best = maximizing ? Math.max(best, value) : Math.min(best, value);
  }
  return best;
}

function perfectInformationRollout(state: GameState): GameState {
  let next = state;
  let guard = 0;
  while (next.phase === "playing" && guard < 40) {
    const card = chooseProfileCardToPlay(next, getBotProfile("main"));
    next = playCard(next, next.currentPlayerId, card);
    guard += 1;
  }
  return next;
}

export function oracleCardValues(
  state: GameState,
  options: { nodeCap?: number; exactThreshold?: number } = {},
): OracleDecision {
  const legal = playableCardsForCurrentPlayer(state);
  if (!legal.length) throw new Error("Oracle: aucune carte légale.");
  const team = playerTeam(state.currentPlayerId);
  const shouldSearchExactly = state.hands[state.currentPlayerId].length <= (options.exactThreshold ?? 3);
  let exact = shouldSearchExactly;
  let nodes = 0;
  const values = legal.map((card) => {
    const after = playCard(state, state.currentPlayerId, card);
    if (shouldSearchExactly) {
      const counter = { nodes: 0, cap: options.nodeCap ?? 100_000 };
      const searched = exactSearch(after, team, counter);
      nodes += counter.nodes;
      if (searched !== null) return { card, value: searched };
      exact = false;
    }
    return { card, value: evaluate(perfectInformationRollout(after), team) };
  }).sort((a, b) => b.value - a.value || cardKey(a.card).localeCompare(cardKey(b.card)));
  return { bestCard: values[0].card, values, exact, nodes };
}

export function decisionRegret(oracle: OracleDecision, decision: Card): number {
  const chosen = oracle.values.find((candidate) => cardKey(candidate.card) === cardKey(decision));
  if (!chosen) throw new Error("La décision évaluée n'est pas légale dans la position oracle.");
  return oracle.values[0].value - chosen.value;
}
