import "server-only";
import type { Card, GameState, PlayerId, Rank, Suit } from "@/engine/types";

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
  for (const seat of [0, 1, 2, 3] as const) {
    const hand = value.hands[seat];
    if (!Array.isArray(hand) || !hand.every(card)) {
      throw new Error(`Stored hand ${seat} is invalid.`);
    }
  }
  if (!Array.isArray(value.bids) || !Array.isArray(value.completedTricks) || !object(value.currentTrick)) {
    throw new Error("Stored game history is invalid.");
  }
  return value as GameState;
}
