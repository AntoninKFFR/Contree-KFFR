import "server-only";
import type { Card, GameState, PlayerId, Rank, Suit } from "@/engine/types";
import { normalizeGameSettings } from "@/engine/rulesets/resolve";
import { resolveContractMode } from "@/engine/contractMode";
import { inactivePlayerIdForContract } from "@/engine/activePlayers";
import { canBidGeneraleMode } from "@/engine/bidding";

const SUITS = new Set<Suit>(["clubs", "diamonds", "hearts", "spades"]);
const RANKS = new Set<Rank>(["7", "8", "9", "J", "Q", "K", "10", "A"]);
const PHASES = new Set(["bidding", "playing", "finished", "game-over"]);

function object(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function card(value: unknown): value is Card {
  return object(value) && SUITS.has(value.suit as Suit) && RANKS.has(value.rank as Rank);
}

function playerId(value: unknown): value is PlayerId {
  return value === 0 || value === 1 || value === 2 || value === 3;
}

export function parseServerGameState(value: unknown): GameState {
  if (!object(value) || !PHASES.has(String(value.phase)) || !playerId(value.currentPlayerId)) {
    throw new Error("Stored game state is invalid.");
  }
  if (!object(value.hands)) throw new Error("Stored game hands are invalid.");
  if (value.endReason !== undefined && value.endReason !== null && value.endReason !== "score" && value.endReason !== "forfeit") {
    throw new Error("Stored game end reason is invalid.");
  }
  if (
    value.forfeitingTeam !== undefined &&
    value.forfeitingTeam !== null &&
    value.forfeitingTeam !== 0 &&
    value.forfeitingTeam !== 1
  ) {
    throw new Error("Stored forfeiting team is invalid.");
  }
  if (
    value.endReason === "forfeit" &&
    (
      value.phase !== "game-over" ||
      value.forfeitingTeam === null ||
      value.forfeitingTeam === undefined ||
      (value.forfeitingTeam === 0 && value.winnerTeam !== 1) ||
      (value.forfeitingTeam === 1 && value.winnerTeam !== 0)
    )
  ) {
    throw new Error("Stored forfeit state is inconsistent.");
  }
  for (const seat of [0, 1, 2, 3] as const) {
    const hand = value.hands[seat];
    if (!Array.isArray(hand) || !hand.every(card)) {
      throw new Error(`Stored hand ${seat} is invalid.`);
    }
  }
  if (!Array.isArray(value.bids) || !Array.isArray(value.completedTricks) || !object(value.currentTrick)) {
    throw new Error("Stored game history is invalid.");
  }
  if (!object(value.settings)) throw new Error("Stored game settings are invalid.");
  const state = value as GameState;
  const contractMode = resolveContractMode(state);
  const normalized: GameState = {
    ...state,
    ...(contractMode ? { contractMode } : {}),
    contract: state.contract && resolveContractMode(state.contract)
      ? { ...state.contract, contractMode: resolveContractMode(state.contract)! }
      : state.contract,
    settings: normalizeGameSettings(value.settings),
  };
  const inactive = inactivePlayerIdForContract(normalized.contract);
  if (normalized.contract?.kind === "generale") {
    const rules = normalized.settings.ruleset!;
    const mode = resolveContractMode(normalized.contract);
    if (!playerId(normalized.contract.playerId) || !rules.bidding.allowGenerale || !mode || !canBidGeneraleMode(mode, rules.bidding)) {
      throw new Error("Stored Generale is not allowed by its ruleset.");
    }
    if (normalized.contract.value !== rules.scoring.generaleBasePoints || normalized.bids.some((bid) => bid.action === "generale" && bid.value !== rules.scoring.generaleBasePoints)) {
      throw new Error("Stored Generale value does not match its ruleset.");
    }
    if (inactive === null || normalized.hands[inactive].length !== 8) {
      throw new Error("Stored Generale inactive hand is invalid.");
    }
    const tricks = [...normalized.completedTricks, normalized.currentTrick];
    if (tricks.some((trick) => trick.leaderId === inactive || trick.cards.some((played) => played.playerId === inactive))) {
      throw new Error("Stored Generale contains a card from the inactive partner.");
    }
    if (normalized.completedTricks.some((trick) => trick.winnerId === inactive) || normalized.completedTricks.length > 8) {
      throw new Error("Stored Generale winner history is invalid.");
    }
    if (normalized.completedTricks.some((trick) => trick.cards.length !== 3) || normalized.currentTrick.cards.length > 3) {
      throw new Error("Stored Generale trick size is invalid.");
    }
    if (normalized.phase === "playing" && normalized.currentPlayerId === inactive) {
      throw new Error("Stored Generale waits on the inactive partner.");
    }
  }
  return normalized;
}
