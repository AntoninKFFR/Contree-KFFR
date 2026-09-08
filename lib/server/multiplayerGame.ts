import { chooseBotBid, chooseBotCard } from "@/bots/simpleBot";
import { applyGameAction, type GameAction } from "@/engine/actions";
import type { GameState, PlayerId } from "@/engine/types";
import type { RoomPlayerAction, RoomPlayerRow, RoomRow } from "@/lib/roomTypes";

export class MultiplayerError extends Error {
  constructor(message: string, readonly status = 400, readonly code = "invalid_action") {
    super(message);
    this.name = "MultiplayerError";
  }
}

export function requireVersion(room: RoomRow, expectedVersion: number): void {
  if (!Number.isInteger(expectedVersion) || expectedVersion !== room.state_version) {
    throw new MultiplayerError("La partie a changé. Recharge la table puis réessaie.", 409, "version_conflict");
  }
}

export function humanSeat(players: RoomPlayerRow[], userId: string): RoomPlayerRow {
  const seat = players.find((player) => player.kind === "human" && player.user_id === userId);
  if (!seat) throw new MultiplayerError("Tu ne fais pas partie de cette table.", 403, "not_a_member");
  return seat;
}

export function viewerSeatIndex(players: RoomPlayerRow[], userId: string): RoomPlayerRow["seat_index"] | null {
  return players.find((player) => player.kind === "human" && player.user_id === userId)?.seat_index ?? null;
}

export function joinLobbySeat(input: {
  players: RoomPlayerRow[];
  userId: string;
  seatIndex: RoomPlayerRow["seat_index"];
  displayName: string;
  now: string;
}): RoomPlayerRow[] {
  const occupied = input.players.find((player) => player.seat_index === input.seatIndex);
  if (!occupied || occupied.kind !== "empty") {
    throw new MultiplayerError("Cette place n'est plus libre.", 409);
  }
  return input.players.map((player) => {
    if (player.id === occupied.id) return {
      ...player, kind: "human" as const, user_id: input.userId, bot_profile_id: null,
      display_name: input.displayName, is_ready: false, is_connected: true,
      joined_at: input.now, left_at: null, last_seen_at: input.now,
    };
    if (player.user_id === input.userId) return {
      ...player, kind: "empty" as const, user_id: null, bot_profile_id: null,
      display_name: null, is_ready: false, is_connected: false, last_seen_at: null,
      joined_at: null, left_at: input.now,
    };
    return player;
  });
}

export function setLobbyReady(players: RoomPlayerRow[], userId: string, ready: boolean, now: string): RoomPlayerRow[] {
  const seat = humanSeat(players, userId);
  return players.map((player) => player.id === seat.id
    ? { ...player, is_ready: ready, last_seen_at: now }
    : player);
}

export function requireHost(room: RoomRow, userId: string): void {
  if (room.host_user_id !== userId) {
    throw new MultiplayerError("Seul l'hôte peut effectuer cette opération.", 403, "host_required");
  }
}

function gameAction(action: RoomPlayerAction, playerId: PlayerId): GameAction {
  switch (action.type) {
    case "bid": return { type: "bid", playerId, value: action.value, trump: action.trump };
    case "pass": return { type: "pass", playerId };
    case "coinche": return { type: "coinche", playerId };
    case "surcoinche": return { type: "surcoinche", playerId };
    case "play-card": return { type: "play-card", playerId, card: action.card };
  }
}

function currentSeat(state: GameState, players: RoomPlayerRow[]) {
  return players.find((player) => player.seat_index === state.currentPlayerId);
}

export function applyBotTurns(state: GameState, players: RoomPlayerRow[]): GameState {
  let next = state;
  for (let count = 0; count < 32 && (next.phase === "bidding" || next.phase === "playing"); count += 1) {
    const seat = currentSeat(next, players);
    if (!seat || seat.kind !== "bot") return next;
    if (next.phase === "bidding") {
      const bid = chooseBotBid(next);
      const action: RoomPlayerAction = bid.action === "bid"
        ? { type: "bid", value: bid.value, trump: bid.trump }
        : { type: bid.action };
      next = applyGameAction(next, gameAction(action, next.currentPlayerId));
    } else {
      next = applyGameAction(next, {
        type: "play-card",
        playerId: next.currentPlayerId,
        card: chooseBotCard(next),
      });
    }
  }
  if ((next.phase === "bidding" || next.phase === "playing") && currentSeat(next, players)?.kind === "bot") {
    throw new MultiplayerError("La limite de tours automatiques des bots a été atteinte.", 500, "bot_limit");
  }
  return next;
}

export function applyAuthorizedAction(input: {
  room: RoomRow;
  players: RoomPlayerRow[];
  state: GameState;
  userId: string;
  expectedVersion: number;
  action: RoomPlayerAction;
}): GameState {
  requireVersion(input.room, input.expectedVersion);
  if (input.room.status !== "playing") {
    throw new MultiplayerError("La partie n'est pas en cours.", 409, "wrong_room_status");
  }
  const seat = humanSeat(input.players, input.userId);
  if (input.state.phase !== "bidding" && input.state.phase !== "playing") {
    throw new MultiplayerError("Cette action ne correspond pas à la phase courante.", 409, "wrong_phase");
  }
  if (input.state.currentPlayerId !== seat.seat_index) {
    throw new MultiplayerError("Ce n'est pas ton tour.", 403, "out_of_turn");
  }
  try {
    return applyBotTurns(
      applyGameAction(input.state, gameAction(input.action, seat.seat_index)),
      input.players,
    );
  } catch (error) {
    if (error instanceof MultiplayerError) throw error;
    throw new MultiplayerError(error instanceof Error ? error.message : "Action de jeu illégale.");
  }
}
