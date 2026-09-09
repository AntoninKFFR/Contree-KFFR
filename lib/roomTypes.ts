import type { BidValue, Card, ScoringMode, Suit } from "@/engine/types";
import type { PlayerGameView } from "@/engine/views";

export type RoomStatus = "lobby" | "playing" | "finished" | "cancelled";
export type SeatKind = "human" | "bot" | "empty";
export type GamePhase = "bidding" | "playing" | "finished" | "game-over";

export type RoomRow = {
  id: string;
  code: string;
  status: RoomStatus;
  host_user_id: string | null;
  active_game_id: string | null;
  scoring_mode: ScoringMode;
  target_score: number;
  game_phase: GamePhase | null;
  state_version: number;
  turn_deadline_at: string | null;
  created_at: string;
  updated_at: string;
  started_at: string | null;
  finished_at: string | null;
};

export type RoomPlayerRow = {
  id: string;
  room_id: string;
  seat_index: 0 | 1 | 2 | 3;
  kind: SeatKind;
  user_id: string | null;
  bot_profile_id: string | null;
  display_name: string | null;
  is_ready: boolean;
  is_connected: boolean;
  bot_takeover: boolean;
  last_seen_at: string | null;
  joined_at: string | null;
  left_at: string | null;
  created_at: string;
  updated_at: string;
};

export type RoomWithPlayers = { room: RoomRow; players: RoomPlayerRow[] };

export type RoomPlayerView = Pick<
  RoomPlayerRow,
  "seat_index" | "kind" | "display_name" | "is_ready" | "is_connected" | "bot_takeover"
>;

export type MultiplayerRoomView = {
  room: Omit<RoomRow, "host_user_id" | "active_game_id">;
  players: RoomPlayerView[];
  isHost: boolean;
  canClaimHost: boolean;
  viewerSeatIndex: RoomPlayerRow["seat_index"] | null;
  game: PlayerGameView | null;
};

export type RoomPlayerAction =
  | { type: "bid"; value: BidValue; trump: Suit }
  | { type: "pass" }
  | { type: "coinche" }
  | { type: "surcoinche" }
  | { type: "play-card"; card: Card };

export type RoomIntent =
  | { type: "join-seat"; seatIndex: RoomPlayerRow["seat_index"]; displayName: string }
  | { type: "leave-seat" }
  | { type: "set-ready"; ready: boolean }
  | { type: "start-game" }
  | { type: "rematch" }
  | { type: "forfeit-game" }
  | { type: "claim-host" }
  | { type: "enable-bot-takeover"; seatIndex: RoomPlayerRow["seat_index"] }
  | { type: "game-action"; action: RoomPlayerAction }
  | { type: "next-round" }
  | { type: "reset-room" };
