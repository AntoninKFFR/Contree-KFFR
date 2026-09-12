import "server-only";
import type { RoomIntent } from "@/lib/roomTypes";
import { MultiplayerError } from "./multiplayerGame";

const SUITS = new Set(["clubs", "diamonds", "hearts", "spades"]);
const RANKS = new Set(["7", "8", "9", "J", "Q", "K", "10", "A"]);
const BIDS = new Set([80, 90, 100, 110, 120, 130, 140, 150, 160]);

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function validContractMode(value: unknown): boolean {
  if (!record(value)) return false;
  if (value.kind === "no-trump" || value.kind === "all-trump") return true;
  return value.kind === "suit" && SUITS.has(String(value.suit));
}

export function parseRoomIntent(value: unknown): RoomIntent {
  if (!record(value) || typeof value.type !== "string") throw new MultiplayerError("Intention invalide.");
  if (value.type === "join-seat" && Number.isInteger(value.seatIndex) && typeof value.displayName === "string") return value as RoomIntent;
  if (value.type === "enable-bot-takeover" && Number.isInteger(value.seatIndex) && Number(value.seatIndex) >= 0 && Number(value.seatIndex) <= 3) return value as RoomIntent;
  if (value.type === "forfeit-game" || value.type === "claim-host") return { type: value.type };
  if (value.type === "leave-seat" || value.type === "start-game" || value.type === "next-round" || value.type === "reset-room" || value.type === "rematch") return { type: value.type };
  if (value.type === "set-ready" && typeof value.ready === "boolean") return value as RoomIntent;
  if (value.type === "game-action" && record(value.action)) {
    const action = value.action;
    if (action.type === "pass" || action.type === "coinche" || action.type === "surcoinche") return value as RoomIntent;
    const hasMode = SUITS.has(String(action.trump)) || validContractMode(action.contractMode);
    if (action.type === "capot" && hasMode) return value as RoomIntent;
    if (action.type === "bid" && BIDS.has(Number(action.value)) && hasMode) return value as RoomIntent;
    if (action.type === "play-card" && record(action.card) && SUITS.has(String(action.card.suit)) && RANKS.has(String(action.card.rank))) return value as RoomIntent;
  }
  throw new MultiplayerError("Intention de jeu invalide.");
}
