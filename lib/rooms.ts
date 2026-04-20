import type { SupabaseClient } from "@supabase/supabase-js";
import { chooseBotBid, chooseBotCard } from "@/bots/simpleBot";
import { applyGameAction, type GameAction } from "@/engine/actions";
import { createInitialGame } from "@/engine/game";
import { BOT_NAME_POOL } from "@/engine/players";
import type { SeatAssignments } from "@/engine/seats";
import type { BidValue, Card, GameState, PlayerId, ScoringMode, Suit } from "@/engine/types";

export type RoomStatus = "lobby" | "playing" | "finished" | "cancelled";
export type SeatKind = "human" | "bot" | "empty";
export type GamePhase = "bidding" | "playing" | "finished" | "game-over";

export type RoomRow = {
  id: string;
  code: string;
  status: RoomStatus;
  host_user_id: string | null;
  scoring_mode: ScoringMode;
  target_score: number;
  game_phase: GamePhase | null;
  server_state: unknown | null;
  state_version: number;
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
  last_seen_at: string | null;
  joined_at: string | null;
  left_at: string | null;
  created_at: string;
  updated_at: string;
};

export type RoomWithPlayers = {
  room: RoomRow;
  players: RoomPlayerRow[];
};

export type CreateRoomParams = {
  hostUserId: string;
  hostDisplayName: string;
  scoringMode: ScoringMode;
  targetScore: number;
};

export type JoinRoomParams = {
  code: string;
  userId: string;
  displayName: string;
  seatIndex?: RoomPlayerRow["seat_index"];
};

export type SetSeatReadyParams = {
  roomId: string;
  userId: string;
  ready: boolean;
};

export type StartRoomGameParams = {
  roomId: string;
};

export type RoomPlayerAction =
  | {
      type: "bid";
      value: BidValue;
      trump: Suit;
    }
  | {
      type: "pass";
    }
  | {
      type: "coinche";
    }
  | {
      type: "surcoinche";
    }
  | {
      type: "play-card";
      card: Card;
    };

export type PlayRoomActionParams = {
  roomId: string;
  userId: string;
  action: RoomPlayerAction;
};

export type ResetRoomParams = {
  roomId: string;
};

const ROOM_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const ROOM_CODE_LENGTH = 6;
const ROOM_CODE_ATTEMPTS = 8;
const DEFAULT_BOT_PROFILE_ID = "main_montecarlo_v2";
const MAX_BOT_ACTIONS_PER_TURN = 32;
const SEAT_INDEXES = [0, 1, 2, 3] as const;

class RoomDataError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RoomDataError";
  }
}

function assertNonEmpty(value: string, fieldName: string): string {
  const cleaned = value.trim();

  if (!cleaned) {
    throw new RoomDataError(`${fieldName} is required.`);
  }

  return cleaned;
}

function cleanDisplayName(displayName: string): string {
  const cleaned = assertNonEmpty(displayName, "displayName");

  if (cleaned.length > 40) {
    throw new RoomDataError("displayName must be 40 characters or less.");
  }

  return cleaned;
}

function validateTargetScore(targetScore: number): number {
  if (!Number.isInteger(targetScore) || targetScore <= 0) {
    throw new RoomDataError("targetScore must be a positive integer.");
  }

  return targetScore;
}

function cleanRoomCode(code: string): string {
  return assertNonEmpty(code, "code").toUpperCase();
}

export function generateRoomCode(): string {
  let code = "";
  const cryptoSource = globalThis.crypto;

  for (let index = 0; index < ROOM_CODE_LENGTH; index += 1) {
    if (cryptoSource) {
      const randomValues = new Uint32Array(1);
      cryptoSource.getRandomValues(randomValues);
      code += ROOM_CODE_ALPHABET[randomValues[0] % ROOM_CODE_ALPHABET.length];
    } else {
      code += ROOM_CODE_ALPHABET[Math.floor(Math.random() * ROOM_CODE_ALPHABET.length)];
    }
  }

  return code;
}

function isUniqueViolation(error: { code?: string } | null): boolean {
  return error?.code === "23505";
}

function seatAssignmentsFromPlayers(players: RoomPlayerRow[]): SeatAssignments {
  return players.reduce(
    (seatAssignments, player) => ({
      ...seatAssignments,
      [player.seat_index]: { kind: player.kind },
    }),
    {} as SeatAssignments,
  );
}

function playerNamesFromPlayers(players: RoomPlayerRow[]): GameState["playerNames"] {
  return players.reduce(
    (playerNames, player) => ({
      ...playerNames,
      [player.seat_index]: player.display_name ?? `Joueur ${player.seat_index + 1}`,
    }),
    {} as NonNullable<GameState["playerNames"]>,
  );
}

function botNamesForSeats(players: RoomPlayerRow[], botSeats: RoomPlayerRow[]): Map<string, string> {
  const usedNames = new Set(
    players
      .map((player) => player.display_name?.trim())
      .filter((name): name is string => Boolean(name)),
  );
  const availableNames = BOT_NAME_POOL.filter((name) => !usedNames.has(name));
  const botNames = new Map<string, string>();

  botSeats.forEach((seat, index) => {
    const randomIndex = Math.floor(Math.random() * availableNames.length);
    const [name] = availableNames.splice(randomIndex, 1);
    const fallbackName = `Bot ${index + 1}`;

    botNames.set(seat.id, name ?? fallbackName);
    usedNames.add(name ?? fallbackName);
  });

  return botNames;
}

function requireServerState(room: RoomRow): GameState {
  if (!room.server_state) {
    throw new RoomDataError("Room has no game state.");
  }

  return room.server_state as GameState;
}

function playerForCurrentTurn(state: GameState, players: RoomPlayerRow[]): RoomPlayerRow | null {
  return players.find((player) => player.seat_index === state.currentPlayerId) ?? null;
}

function roomActionToGameAction(action: RoomPlayerAction, playerId: PlayerId): GameAction {
  switch (action.type) {
    case "bid":
      return {
        type: "bid",
        playerId,
        value: action.value,
        trump: action.trump,
      };
    case "pass":
      return {
        type: "pass",
        playerId,
      };
    case "coinche":
      return {
        type: "coinche",
        playerId,
      };
    case "surcoinche":
      return {
        type: "surcoinche",
        playerId,
      };
    case "play-card":
      return {
        type: "play-card",
        playerId,
        card: action.card,
      };
  }
}

async function applyBotTurns(state: GameState, players: RoomPlayerRow[]): Promise<GameState> {
  let nextState = state;
  let actionCount = 0;

  while (nextState.phase === "bidding" || nextState.phase === "playing") {
    const currentPlayer = playerForCurrentTurn(nextState, players);

    if (!currentPlayer || currentPlayer.kind !== "bot") {
      return nextState;
    }

    if (actionCount >= MAX_BOT_ACTIONS_PER_TURN) {
      throw new RoomDataError("Bot turn limit reached.");
    }

    if (nextState.phase === "bidding") {
      const botBid = chooseBotBid(nextState);
      nextState = applyGameAction(
        nextState,
        roomActionToGameAction(
          botBid.action === "bid"
            ? {
                type: "bid",
                value: botBid.value,
                trump: botBid.trump,
              }
            : {
                type: botBid.action,
              },
          nextState.currentPlayerId,
        ),
      );
    } else {
      const card = chooseBotCard(nextState);
      nextState = applyGameAction(nextState, {
        type: "play-card",
        playerId: nextState.currentPlayerId,
        card,
      });
    }

    actionCount += 1;
  }

  return nextState;
}

async function fetchRoomRow(supabase: SupabaseClient, roomId: string): Promise<RoomRow> {
  const { data, error } = await supabase
    .from("rooms")
    .select("*")
    .eq("id", roomId)
    .maybeSingle<RoomRow>();

  if (error) {
    throw error;
  }

  if (!data) {
    throw new RoomDataError("Room not found.");
  }

  return data;
}

async function fetchRoomRowByCode(supabase: SupabaseClient, code: string): Promise<RoomRow> {
  const { data, error } = await supabase
    .from("rooms")
    .select("*")
    .eq("code", cleanRoomCode(code))
    .maybeSingle<RoomRow>();

  if (error) {
    throw error;
  }

  if (!data) {
    throw new RoomDataError("Room not found.");
  }

  return data;
}

async function fetchRoomPlayers(
  supabase: SupabaseClient,
  roomId: string,
): Promise<RoomPlayerRow[]> {
  const { data, error } = await supabase
    .from("room_players")
    .select("*")
    .eq("room_id", roomId)
    .order("seat_index", { ascending: true });

  if (error) {
    throw error;
  }

  return (data ?? []) as RoomPlayerRow[];
}

export async function getRoomWithPlayers(
  supabase: SupabaseClient,
  roomId: string,
): Promise<RoomWithPlayers> {
  const room = await fetchRoomRow(supabase, roomId);
  const players = await fetchRoomPlayers(supabase, room.id);

  return { room, players };
}

async function insertRoomWithUniqueCode(
  supabase: SupabaseClient,
  params: CreateRoomParams,
): Promise<RoomRow> {
  for (let attempt = 0; attempt < ROOM_CODE_ATTEMPTS; attempt += 1) {
    const { data, error } = await supabase
      .from("rooms")
      .insert({
        code: generateRoomCode(),
        host_user_id: params.hostUserId,
        scoring_mode: params.scoringMode,
        status: "lobby",
        target_score: validateTargetScore(params.targetScore),
      })
      .select("*")
      .single<RoomRow>();

    if (!error && data) {
      return data;
    }

    if (!isUniqueViolation(error)) {
      throw error;
    }
  }

  throw new RoomDataError("Unable to generate a unique room code.");
}

export async function createRoom(
  supabase: SupabaseClient,
  params: CreateRoomParams,
): Promise<RoomWithPlayers> {
  const hostDisplayName = cleanDisplayName(params.hostDisplayName);
  const room = await insertRoomWithUniqueCode(supabase, params);

  const now = new Date().toISOString();
  const { error } = await supabase.from("room_players").insert(
    SEAT_INDEXES.map((seatIndex) =>
      seatIndex === 0
        ? {
            room_id: room.id,
            seat_index: seatIndex,
            kind: "human",
            user_id: params.hostUserId,
            display_name: hostDisplayName,
            is_ready: false,
            is_connected: true,
            joined_at: now,
            last_seen_at: now,
          }
        : {
            room_id: room.id,
            seat_index: seatIndex,
            kind: "empty",
            is_ready: false,
            is_connected: false,
          },
    ),
  );

  if (error) {
    await supabase.from("rooms").delete().eq("id", room.id);
    throw error;
  }

  return getRoomWithPlayers(supabase, room.id);
}

export async function joinRoom(
  supabase: SupabaseClient,
  params: JoinRoomParams,
): Promise<RoomWithPlayers> {
  const displayName = cleanDisplayName(params.displayName);
  const room = await fetchRoomRowByCode(supabase, params.code);

  if (room.status !== "lobby") {
    throw new RoomDataError("Room is not joinable.");
  }

  const players = await fetchRoomPlayers(supabase, room.id);

  if (players.some((player) => player.user_id === params.userId)) {
    throw new RoomDataError("User is already in this room.");
  }

  const emptySeat =
    params.seatIndex === undefined
      ? players.find((player) => player.kind === "empty")
      : players.find(
          (player) => player.kind === "empty" && player.seat_index === params.seatIndex,
        );

  if (!emptySeat) {
    throw new RoomDataError(
      params.seatIndex === undefined ? "La table est complète." : "Cette place n'est plus libre.",
    );
  }

  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("room_players")
    .update({
      kind: "human",
      user_id: params.userId,
      display_name: displayName,
      is_ready: false,
      is_connected: true,
      joined_at: now,
      last_seen_at: now,
      left_at: null,
    })
    .eq("id", emptySeat.id)
    .eq("kind", "empty")
    .select("id")
    .maybeSingle<Pick<RoomPlayerRow, "id">>();

  if (error) {
    throw error;
  }

  if (!data) {
    throw new RoomDataError("Cette place n'est plus libre.");
  }

  return getRoomWithPlayers(supabase, room.id);
}

export async function setSeatReady(
  supabase: SupabaseClient,
  params: SetSeatReadyParams,
): Promise<RoomWithPlayers> {
  const room = await fetchRoomRow(supabase, params.roomId);

  if (room.status !== "lobby") {
    throw new RoomDataError("Ready state can only be changed in lobby.");
  }

  const { data: seat, error: seatError } = await supabase
    .from("room_players")
    .select("id")
    .eq("room_id", room.id)
    .eq("user_id", params.userId)
    .eq("kind", "human")
    .maybeSingle<Pick<RoomPlayerRow, "id">>();

  if (seatError) {
    throw seatError;
  }

  if (!seat) {
    throw new RoomDataError("User is not seated in this room.");
  }

  const { error } = await supabase
    .from("room_players")
    .update({
      is_ready: params.ready,
      last_seen_at: new Date().toISOString(),
    })
    .eq("id", seat.id);

  if (error) {
    throw error;
  }

  return getRoomWithPlayers(supabase, room.id);
}

export async function startRoomGame(
  supabase: SupabaseClient,
  params: StartRoomGameParams,
): Promise<RoomWithPlayers> {
  const { room, players } = await getRoomWithPlayers(supabase, params.roomId);

  if (room.status !== "lobby") {
    throw new RoomDataError("Room game can only start from lobby.");
  }

  if (players.some((player) => player.kind === "human" && !player.is_ready)) {
    throw new RoomDataError("All human players must be ready.");
  }

  const emptySeats = players.filter((player) => player.kind === "empty");
  const now = new Date().toISOString();

  if (emptySeats.length > 0) {
    const botNames = botNamesForSeats(players, emptySeats);

    const { error: botsError } = await supabase
      .from("room_players")
      .upsert(
        emptySeats.map((seat) => ({
          id: seat.id,
          room_id: seat.room_id,
          seat_index: seat.seat_index,
          kind: "bot",
          user_id: null,
          bot_profile_id: DEFAULT_BOT_PROFILE_ID,
          display_name: botNames.get(seat.id) ?? "Bot",
          is_ready: true,
          is_connected: true,
          last_seen_at: now,
        })),
      );

    if (botsError) {
      throw botsError;
    }
  }

  const nextPlayers = await fetchRoomPlayers(supabase, room.id);
  const seatAssignments = seatAssignmentsFromPlayers(nextPlayers);
  if (
    SEAT_INDEXES.some(
      (seatIndex) => !seatAssignments[seatIndex] || seatAssignments[seatIndex].kind === "empty",
    )
  ) {
    throw new RoomDataError("Room needs 4 occupied seats to start.");
  }

  const initialState: GameState = {
    ...createInitialGame(Math.random, {
      scoringMode: room.scoring_mode,
      targetScore: room.target_score,
    }),
    playerNames: playerNamesFromPlayers(nextPlayers),
  };
  const stateAfterInitialBotTurns = await applyBotTurns(initialState, nextPlayers);
  const nextStatus: RoomStatus =
    stateAfterInitialBotTurns.phase === "game-over" ? "finished" : "playing";

  const { data, error } = await supabase
    .from("rooms")
    .update({
      finished_at: nextStatus === "finished" ? now : room.finished_at,
      game_phase: stateAfterInitialBotTurns.phase,
      server_state: stateAfterInitialBotTurns,
      started_at: now,
      state_version: room.state_version + 1,
      status: nextStatus,
    })
    .eq("id", room.id)
    .eq("status", "lobby")
    .eq("state_version", room.state_version)
    .select("id")
    .maybeSingle<Pick<RoomRow, "id">>();

  if (error) {
    throw error;
  }

  if (!data) {
    throw new RoomDataError("Room was updated before the game could start.");
  }

  return getRoomWithPlayers(supabase, room.id);
}

export async function playRoomAction(
  supabase: SupabaseClient,
  params: PlayRoomActionParams,
): Promise<RoomWithPlayers> {
  const { room, players } = await getRoomWithPlayers(supabase, params.roomId);

  if (room.status !== "playing") {
    throw new RoomDataError("Room is not playing.");
  }

  const seat = players.find(
    (player) => player.kind === "human" && player.user_id === params.userId,
  );

  if (!seat) {
    throw new RoomDataError("User is not seated in this room.");
  }

  const state = requireServerState(room);

  if (state.currentPlayerId !== seat.seat_index) {
    throw new RoomDataError("It is not this player's turn.");
  }

  const stateAfterHumanAction = applyGameAction(
    state,
    roomActionToGameAction(params.action, seat.seat_index),
  );
  const nextState = await applyBotTurns(stateAfterHumanAction, players);
  const nextStatus: RoomStatus = nextState.phase === "game-over" ? "finished" : "playing";
  const finishedAt = nextStatus === "finished" ? new Date().toISOString() : room.finished_at;

  const { data, error } = await supabase
    .from("rooms")
    .update({
      finished_at: finishedAt,
      game_phase: nextState.phase,
      server_state: nextState,
      state_version: room.state_version + 1,
      status: nextStatus,
    })
    .eq("id", room.id)
    .eq("status", "playing")
    .eq("state_version", room.state_version)
    .select("id")
    .maybeSingle<Pick<RoomRow, "id">>();

  if (error) {
    throw error;
  }

  if (!data) {
    throw new RoomDataError("Room was updated before the action could be played.");
  }

  return getRoomWithPlayers(supabase, room.id);
}

export async function resetRoom(
  supabase: SupabaseClient,
  params: ResetRoomParams,
): Promise<RoomWithPlayers> {
  const { room, players } = await getRoomWithPlayers(supabase, params.roomId);

  const { error: playersError } = await supabase.from("room_players").upsert(
    players.map((player) =>
      player.kind === "human"
        ? {
            id: player.id,
            room_id: player.room_id,
            seat_index: player.seat_index,
            kind: "human",
            user_id: player.user_id,
            bot_profile_id: null,
            display_name: player.display_name,
            is_ready: false,
            is_connected: player.is_connected,
            last_seen_at: player.last_seen_at,
          }
        : {
            id: player.id,
            room_id: player.room_id,
            seat_index: player.seat_index,
            kind: "empty",
            user_id: null,
            bot_profile_id: null,
            display_name: null,
            is_ready: false,
            is_connected: false,
            last_seen_at: null,
          },
    ),
  );

  if (playersError) {
    throw playersError;
  }

  const { data, error } = await supabase
    .from("rooms")
    .update({
      finished_at: null,
      game_phase: null,
      server_state: null,
      started_at: null,
      state_version: room.state_version + 1,
      status: "lobby",
    })
    .eq("id", room.id)
    .eq("state_version", room.state_version)
    .select("id")
    .maybeSingle<Pick<RoomRow, "id">>();

  if (error) {
    throw error;
  }

  if (!data) {
    throw new RoomDataError("Room was updated before it could be reset.");
  }

  return getRoomWithPlayers(supabase, room.id);
}
