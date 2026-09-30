import "server-only";
import { chooseBotBid, chooseBotCard } from "@/bots/simpleBot";
import { applyGameAction, type GameAction } from "@/engine/actions";
import type { GameState, Card, ContractMode, BidValue } from "@/engine/types";
import type { SoloIntent } from "@/lib/solo/sessionTypes";

export class SoloError extends Error {
  constructor(readonly code: string, readonly status = 400) { super(code); }
}
export function object(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
export function exactKeys(value: Record<string, unknown>, allowed: string[]) {
  if (Object.keys(value).some((key) => !allowed.includes(key))) throw new SoloError("invalid_solo_body");
}
const suits = ["clubs", "diamonds", "hearts", "spades"];
function mode(value: unknown): ContractMode {
  if (!object(value)) throw new SoloError("invalid_solo_action");
  exactKeys(value, value.kind === "suit" ? ["kind", "suit"] : ["kind"]);
  if (value.kind === "no-trump" || value.kind === "all-trump") return { kind: value.kind };
  if (value.kind === "suit" && suits.includes(String(value.suit))) return { kind: "suit", suit: value.suit as Card["suit"] };
  throw new SoloError("invalid_solo_action");
}
export function parseSoloIntent(value: unknown): SoloIntent {
  if (!object(value) || typeof value.type !== "string") throw new SoloError("invalid_solo_action");
  if (value.type === "advance-bot" || value.type === "start-next-round") {
    exactKeys(value, ["type"]);
    return { type: value.type };
  }
  if (value.playerId !== 0) throw new SoloError("invalid_solo_player");
  if (["pass", "coinche", "surcoinche"].includes(value.type)) {
    exactKeys(value, ["type", "playerId"]);
    return { type: value.type as "pass" | "coinche" | "surcoinche", playerId: 0 };
  }
  if (value.type === "play-card" && object(value.card)) {
    exactKeys(value, ["type", "playerId", "card"]);
    exactKeys(value.card, ["suit", "rank"]);
    if (!suits.includes(String(value.card.suit)) || !["7", "8", "9", "J", "Q", "K", "10", "A"].includes(String(value.card.rank))) {
      throw new SoloError("invalid_solo_action");
    }
    return { type: "play-card", playerId: 0, card: { suit: value.card.suit, rank: value.card.rank } as Card };
  }
  if (["bid", "capot", "generale"].includes(value.type)) {
    exactKeys(value, ["type", "playerId", "value", "trump", "contractMode"]);
    const contractMode = value.contractMode === undefined ? mode({ kind: "suit", suit: value.trump }) : mode(value.contractMode);
    if (value.type === "bid") {
      if (!Number.isSafeInteger(value.value)) throw new SoloError("invalid_solo_action");
      return { type: "bid", playerId: 0, value: value.value as BidValue, contractMode };
    }
    return { type: value.type as "capot" | "generale", playerId: 0, contractMode };
  }
  throw new SoloError("invalid_solo_action");
}

// Only stored server state reaches this function. The browser supplies one intent,
// never a score, winner, seed, bot decision, rules replacement or terminal state.
export function advanceSoloState(state: GameState, intent: SoloIntent): GameState {
  if (state.phase === "game-over") return state;
  try {
    if (intent.type === "start-next-round") {
      if (state.phase !== "finished") throw new SoloError("wrong_solo_phase");
      return applyGameAction(state, intent);
    }
    if (state.phase !== "bidding" && state.phase !== "playing") throw new SoloError("wrong_solo_phase");
    if (intent.type === "advance-bot") {
      if (state.currentPlayerId === 0) throw new SoloError("human_solo_turn");
      if (state.phase === "playing") return applyGameAction(state, {
        type: "play-card", playerId: state.currentPlayerId, card: chooseBotCard(state),
      });
      const bid = chooseBotBid(state);
      return applyGameAction(state, { ...bid, type: bid.action, playerId: state.currentPlayerId } as GameAction);
    }
    if (intent.playerId !== 0 || state.currentPlayerId !== 0) throw new SoloError("not_solo_turn");
    return applyGameAction(state, intent);
  } catch (error) {
    if (error instanceof SoloError) throw error;
    throw new SoloError("illegal_solo_action");
  }
}
