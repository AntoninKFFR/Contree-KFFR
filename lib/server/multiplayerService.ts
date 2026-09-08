import "server-only";
import { createInitialGame } from "@/engine/game";
import { BOT_NAME_POOL } from "@/engine/players";
import type { GameState } from "@/engine/types";
import { toPlayerGameView } from "@/engine/views";
import type {
  MultiplayerRoomView, RoomIntent, RoomPlayerRow, RoomRow, RoomWithPlayers,
} from "@/lib/roomTypes";
import { parseServerGameState } from "./gameStateValidation";
import {
  applyAuthorizedAction, applyBotTurns, humanSeat, joinLobbySeat, MultiplayerError, requireHost,
  requireVersion, setLobbyReady, viewerSeatIndex,
} from "./multiplayerGame";
import { getSupabaseAdmin } from "./supabaseAdmin";

const ROOM_COLUMNS = "id,code,status,host_user_id,scoring_mode,target_score,game_phase,state_version,created_at,updated_at,started_at,finished_at";
const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function cleanName(value: unknown): string {
  if (typeof value !== "string" || !value.trim() || value.trim().length > 40) {
    throw new MultiplayerError("Le nom doit contenir entre 1 et 40 caractères.");
  }
  return value.trim();
}

function code(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  return Array.from(bytes, (byte) => CODE_CHARS[byte % CODE_CHARS.length]).join("");
}

async function roomAndPlayers(roomId: string): Promise<RoomWithPlayers> {
  const db = getSupabaseAdmin();
  const [roomResult, playersResult] = await Promise.all([
    db.from("rooms").select(ROOM_COLUMNS).eq("id", roomId).maybeSingle(),
    db.from("room_players").select("*").eq("room_id", roomId).order("seat_index"),
  ]);
  if (roomResult.error) throw roomResult.error;
  if (playersResult.error) throw playersResult.error;
  if (!roomResult.data) throw new MultiplayerError("Table introuvable.", 404, "not_found");
  return { room: roomResult.data as RoomRow, players: (playersResult.data ?? []) as RoomPlayerRow[] };
}

async function serverState(roomId: string): Promise<GameState> {
  const { data, error } = await getSupabaseAdmin()
    .from("room_game_states").select("state").eq("room_id", roomId).maybeSingle();
  if (error) throw error;
  if (!data) throw new MultiplayerError("Cette table n'a pas d'état de jeu.", 409, "missing_state");
  return parseServerGameState(data.state);
}

export async function roomView(roomId: string, userId: string): Promise<MultiplayerRoomView> {
  const result = await roomAndPlayers(roomId);
  const seatIndex = viewerSeatIndex(result.players, userId);
  const seat = seatIndex === null ? undefined : result.players.find((player) => player.seat_index === seatIndex);
  if (result.room.status !== "lobby" && seatIndex === null) {
    throw new MultiplayerError("Tu ne fais pas partie de cette table.", 403, "not_a_member");
  }
  const game = seat && (result.room.status === "playing" || result.room.status === "finished")
    ? toPlayerGameView(await serverState(roomId), seat.seat_index)
    : null;
  const { host_user_id: _hostUserId, ...publicRoom } = result.room;
  void _hostUserId;
  return {
    room: publicRoom,
    players: result.players.map(({ seat_index, kind, display_name, is_ready, is_connected }) => ({
      seat_index, kind, display_name, is_ready, is_connected,
    })),
    isHost: result.room.host_user_id === userId,
    viewerSeatIndex: seatIndex,
    game,
  };
}

async function commit(
  room: RoomRow,
  state: GameState | null,
  status: RoomRow["status"],
  players: RoomPlayerRow[] | null = null,
): Promise<void> {
  const { data, error } = await getSupabaseAdmin().rpc("commit_room_state", {
    p_room_id: room.id,
    p_expected_version: room.state_version,
    p_state: state,
    p_status: status,
    p_game_phase: state?.phase ?? null,
    p_players: players,
  });
  if (error) throw error;
  if (data !== true) throw new MultiplayerError("La partie a changé. Recharge la table puis réessaie.", 409, "version_conflict");
}

export async function createRoom(input: {
  userId: string; displayName: unknown; scoringMode: unknown; targetScore: unknown;
}): Promise<MultiplayerRoomView> {
  const displayName = cleanName(input.displayName);
  if (input.scoringMode !== "made-points" && input.scoringMode !== "announced-points") {
    throw new MultiplayerError("Mode de score invalide.");
  }
  if (!Number.isInteger(input.targetScore) || Number(input.targetScore) <= 0) {
    throw new MultiplayerError("Score cible invalide.");
  }
  const db = getSupabaseAdmin();
  let room: RoomRow | null = null;
  for (let attempt = 0; attempt < 8 && !room; attempt += 1) {
    const result = await db.from("rooms").insert({
      code: code(), host_user_id: input.userId, scoring_mode: input.scoringMode,
      target_score: input.targetScore, status: "lobby",
    }).select(ROOM_COLUMNS).single();
    if (!result.error) room = result.data as RoomRow;
    else if (result.error.code !== "23505") throw result.error;
  }
  if (!room) throw new MultiplayerError("Impossible de générer un code de table.", 500);
  const now = new Date().toISOString();
  const { error } = await db.from("room_players").insert([0, 1, 2, 3].map((seat) => ({
    room_id: room!.id, seat_index: seat, kind: seat === 0 ? "human" : "empty",
    user_id: seat === 0 ? input.userId : null, display_name: seat === 0 ? displayName : null,
    is_ready: false, is_connected: seat === 0, joined_at: seat === 0 ? now : null,
    last_seen_at: seat === 0 ? now : null,
  })));
  if (error) {
    await db.from("rooms").delete().eq("id", room.id);
    throw error;
  }
  return roomView(room.id, input.userId);
}

export async function findRoomByCode(rawCode: unknown, userId: string): Promise<MultiplayerRoomView> {
  if (typeof rawCode !== "string" || !rawCode.trim()) throw new MultiplayerError("Code requis.");
  const { data, error } = await getSupabaseAdmin().from("rooms").select("id").eq("code", rawCode.trim().toUpperCase()).maybeSingle();
  if (error) throw error;
  if (!data) throw new MultiplayerError("Table introuvable.", 404, "not_found");
  return roomView(data.id, userId);
}

export async function executeIntent(roomId: string, userId: string, expectedVersion: number, intent: RoomIntent) {
  const current = await roomAndPlayers(roomId);
  requireVersion(current.room, expectedVersion);
  const now = new Date().toISOString();

  if (intent.type === "game-action") {
    const state = applyAuthorizedAction({ ...current, state: await serverState(roomId), userId, expectedVersion, action: intent.action });
    await commit(current.room, state, state.phase === "game-over" ? "finished" : "playing");
  } else if (intent.type === "next-round") {
    humanSeat(current.players, userId);
    const state = await serverState(roomId);
    if (state.phase !== "finished") throw new MultiplayerError("La manche n'est pas terminée.", 409, "wrong_phase");
    const { startNextRound } = await import("@/engine/game");
    await commit(current.room, applyBotTurns(startNextRound(state, Math.random), current.players), "playing");
  } else if (intent.type === "start-game") {
    requireHost(current.room, userId);
    if (current.room.status !== "lobby") throw new MultiplayerError("La table n'est pas dans le lobby.", 409);
    if (current.players.some((p) => p.kind === "human" && !p.is_ready)) throw new MultiplayerError("Tous les joueurs humains doivent être prêts.");
    const availableNames = BOT_NAME_POOL.filter(
      (name) => !current.players.some((player) => player.display_name === name),
    );
    const players = current.players.map((p, index) => p.kind === "empty" ? {
      ...p, kind: "bot" as const, bot_profile_id: "main_montecarlo_v2",
      display_name: availableNames.shift() ?? `Bot ${index + 1}`,
      is_ready: true, is_connected: true, last_seen_at: now,
    } : p);
    const names = Object.fromEntries(players.map((p) => [p.seat_index, p.display_name ?? `Joueur ${p.seat_index + 1}`])) as GameState["playerNames"];
    const state = applyBotTurns({ ...createInitialGame(Math.random, { scoringMode: current.room.scoring_mode, targetScore: current.room.target_score }), playerNames: names }, players);
    await commit(
      current.room,
      state,
      state.phase === "game-over" ? "finished" : "playing",
      players,
    );
  } else if (intent.type === "reset-room") {
    requireHost(current.room, userId);
    const players = current.players.map((p) => p.kind === "human" ? { ...p, is_ready: false } : {
      ...p, kind: "empty" as const, user_id: null, bot_profile_id: null, display_name: null,
      is_ready: false, is_connected: false, last_seen_at: null,
    });
    await commit(current.room, null, "lobby", players);
  } else if (intent.type === "set-ready") {
    if (current.room.status !== "lobby") throw new MultiplayerError("La table n'est pas dans le lobby.", 409);
    const players = setLobbyReady(current.players, userId, intent.ready, now);
    await commit(current.room, null, "lobby", players);
  } else if (intent.type === "leave-seat") {
    const seat = humanSeat(current.players, userId);
    if (current.room.status !== "lobby") throw new MultiplayerError("La place ne peut être quittée qu'au lobby.", 409);
    const players = current.players.map((player) => player.id === seat.id ? {
      ...player, kind: "empty" as const, user_id: null, bot_profile_id: null,
      display_name: null, is_ready: false, is_connected: false, joined_at: null,
      last_seen_at: null, left_at: now,
    } : player);
    await commit(current.room, null, "lobby", players);
  } else if (intent.type === "join-seat") {
    if (current.room.status !== "lobby") throw new MultiplayerError("La table n'accepte plus de joueurs.", 409);
    const players = joinLobbySeat({
      players: current.players, userId, seatIndex: intent.seatIndex,
      displayName: cleanName(intent.displayName), now,
    });
    await commit(current.room, null, "lobby", players);
  }
  return roomView(roomId, userId);
}
