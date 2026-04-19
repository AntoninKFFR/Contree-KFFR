import type { SupabaseClient } from "@supabase/supabase-js";
import type { ScoringMode } from "@/engine/types";

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
};

export type SetSeatReadyParams = {
  roomId: string;
  userId: string;
  ready: boolean;
};

const ROOM_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const ROOM_CODE_LENGTH = 6;
const ROOM_CODE_ATTEMPTS = 8;
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

  const emptySeat = players.find((player) => player.kind === "empty");

  if (!emptySeat) {
    throw new RoomDataError("Room is full.");
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
    throw new RoomDataError("Seat is no longer available.");
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
