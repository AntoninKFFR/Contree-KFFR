import "server-only";
import { createInitialGame } from "@/engine/game";
import { BOT_NAME_POOL } from "@/engine/players";
import type { GameState } from "@/engine/types";
import { toPlayerGameView } from "@/engine/views";
import type {
  MultiplayerRoomView, RoomIntent, RoomPlayerRow, RoomRow, RoomWithPlayers,
} from "@/lib/roomTypes";
import { buildMultiplayerArchive } from "@/lib/multiplayerHistory";
import { canClaimRoomHost, nextHostUserId } from "@/lib/multiplayerHost";
import { isTurnDeadlineExpired, turnDeadlineForState } from "@/lib/multiplayerTurnTimer";
import {
  PRESENCE_OFFLINE_TIMEOUT_MS, PresenceMembershipError, projectRoomPlayers,
  recordPresenceHeartbeat,
} from "@/lib/multiplayerPresence";
import { PRODUCT_SCORING_MODE } from "@/lib/productGame";
import { parseServerGameState } from "./gameStateValidation";
import {
  applyAuthorizedAction, applyBotTurns, applyTimedOutTurnIfExpired, enableBotTakeover,
  forfeitRoom, humanSeat, joinLobbySeat, leaveLobbySeat, MultiplayerError, requireHost,
  prepareRematchPlayers, requireLobbySeatChange, requireVersion, resetRoomPlayers, setLobbyReady,
  viewerSeatIndex,
} from "./multiplayerGame";
import { getSupabaseAdmin } from "./supabaseAdmin";

const ROOM_COLUMNS = "id,code,status,host_user_id,active_game_id,scoring_mode,target_score,game_phase,state_version,turn_deadline_at,created_at,updated_at,started_at,finished_at";
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

export async function roomView(
  roomId: string,
  userId: string,
  nowMs = Date.now(),
): Promise<MultiplayerRoomView> {
  const result = await roomAndPlayers(roomId);
  const seatIndex = viewerSeatIndex(result.players, userId);
  const seat = seatIndex === null ? undefined : result.players.find((player) => player.seat_index === seatIndex);
  if (result.room.status !== "lobby" && seatIndex === null) {
    throw new MultiplayerError("Tu ne fais pas partie de cette table.", 403, "not_a_member");
  }
  const game = seat && (result.room.status === "playing" || result.room.status === "finished")
    ? toPlayerGameView(await serverState(roomId), seat.seat_index)
    : null;
  const { host_user_id: _hostUserId, active_game_id: _activeGameId, ...publicRoom } = result.room;
  void _hostUserId;
  void _activeGameId;
  return {
    room: publicRoom,
    players: projectRoomPlayers(result.players, nowMs),
    isHost: result.room.host_user_id === userId,
    canClaimHost: canClaimRoomHost(result.room, result.players, userId, nowMs),
    viewerSeatIndex: seatIndex,
    game,
  };
}

export async function heartbeatRoomPresence(
  roomId: string,
  userId: string,
  now = new Date(),
): Promise<MultiplayerRoomView> {
  const db = getSupabaseAdmin();
  try {
    await recordPresenceHeartbeat(async (write) => {
      const { data, error } = await db
        .from("room_players")
        .update({
          is_connected: write.isConnected,
          bot_takeover: write.botTakeover,
          last_seen_at: write.lastSeenAt,
        })
        .eq("room_id", write.roomId)
        .eq("user_id", write.userId)
        .eq("kind", "human")
        .select("id")
        .maybeSingle();
      if (error) throw error;
      return data !== null;
    }, { roomId, userId, now });
  } catch (error) {
    if (error instanceof PresenceMembershipError) {
      throw new MultiplayerError("Tu ne fais pas partie de cette table.", 403, "not_a_member");
    }
    throw error;
  }
  return roomView(roomId, userId, now.getTime());
}

async function commit(
  room: RoomRow,
  state: GameState | null,
  status: RoomRow["status"],
  players: RoomPlayerRow[] | null = null,
  timerPlayers: RoomPlayerRow[] = players ?? [],
  nowMs = Date.now(),
  hostUserId: string | null | undefined = undefined,
  activeGameId: string | undefined = undefined,
): Promise<void> {
  const resolvedGameId = activeGameId ?? room.active_game_id ?? (state?.phase === "game-over" ? crypto.randomUUID() : null);
  const archive = state?.phase === "game-over" && resolvedGameId
    ? buildMultiplayerArchive({
        gameId: resolvedGameId,
        room,
        state,
        players: timerPlayers,
        finishedAt: new Date(nowMs).toISOString(),
      })
    : null;
  const { data, error } = await getSupabaseAdmin().rpc("commit_room_state", {
    p_room_id: room.id,
    p_expected_version: room.state_version,
    p_state: state,
    p_status: status,
    p_game_phase: state?.phase ?? null,
    p_players: players,
    p_turn_deadline_at: turnDeadlineForState(state, timerPlayers, nowMs),
    p_host_user_id: hostUserId ?? null,
    p_update_host: hostUserId !== undefined,
    p_active_game_id: resolvedGameId,
    p_update_active_game: activeGameId !== undefined || (state?.phase === "game-over" && room.active_game_id === null),
    p_archive_game: archive?.game ?? null,
    p_archive_players: archive?.players ?? null,
  });
  if (error) throw error;
  if (data !== true) throw new MultiplayerError("La partie a changé. Recharge la table puis réessaie.", 409, "version_conflict");
}

async function commitLobbySeatMove(input: {
  room: RoomRow;
  userId: string;
  seatIndex: RoomPlayerRow["seat_index"];
  displayName: string;
  now: string;
}): Promise<void> {
  const { data, error } = await getSupabaseAdmin().rpc("move_room_seat", {
    p_room_id: input.room.id,
    p_actor_user_id: input.userId,
    p_seat_index: input.seatIndex,
    p_display_name: input.displayName,
    p_expected_version: input.room.state_version,
    p_now: input.now,
  });
  if (error) throw error;
  if (data !== true) {
    throw new MultiplayerError(
      "La table ou la place a changé. Recharge puis réessaie.",
      409,
      "version_conflict",
    );
  }
}

async function claimHost(roomId: string, userId: string, nowMs: number): Promise<void> {
  const { data, error } = await getSupabaseAdmin().rpc("claim_room_host", {
    p_room_id: roomId,
    p_claimant_user_id: userId,
    p_offline_before: new Date(nowMs - PRESENCE_OFFLINE_TIMEOUT_MS).toISOString(),
  });
  if (error) throw error;
  if (data !== true) {
    throw new MultiplayerError(
      "Le rôle d'hôte n'est plus récupérable. Recharge la table.",
      409,
      "host_claim_conflict",
    );
  }
}

async function commitBotTakeover(input: {
  room: RoomRow;
  userId: string;
  seatIndex: RoomPlayerRow["seat_index"];
  state: GameState;
  players: RoomPlayerRow[];
  nowMs: number;
}): Promise<void> {
  const gameId = input.room.active_game_id ?? (input.state.phase === "game-over" ? crypto.randomUUID() : null);
  const archive = input.state.phase === "game-over" && gameId
    ? buildMultiplayerArchive({
        gameId, room: input.room, state: input.state, players: input.players,
        finishedAt: new Date(input.nowMs).toISOString(),
      })
    : null;
  const { data, error } = await getSupabaseAdmin().rpc("enable_bot_takeover", {
    p_room_id: input.room.id,
    p_actor_user_id: input.userId,
    p_seat_index: input.seatIndex,
    p_expected_version: input.room.state_version,
    p_offline_before: new Date(input.nowMs - PRESENCE_OFFLINE_TIMEOUT_MS).toISOString(),
    p_state: input.state,
    p_status: input.state.phase === "game-over" ? "finished" : "playing",
    p_game_phase: input.state.phase,
    p_turn_deadline_at: turnDeadlineForState(input.state, input.players, Date.now()),
    p_active_game_id: gameId,
    p_archive_game: archive?.game ?? null,
    p_archive_players: archive?.players ?? null,
  });
  if (error) throw error;
  if (data !== true) {
    throw new MultiplayerError(
      "La table ou la présence du joueur a changé. Recharge puis réessaie.",
      409,
      "takeover_conflict",
    );
  }
}

async function commitTimedOutTurn(input: {
  room: RoomRow;
  state: GameState;
  players: RoomPlayerRow[];
}): Promise<boolean> {
  const nowMs = Date.now();
  const gameId = input.room.active_game_id ?? (input.state.phase === "game-over" ? crypto.randomUUID() : null);
  const archive = input.state.phase === "game-over" && gameId
    ? buildMultiplayerArchive({
        gameId, room: input.room, state: input.state, players: input.players,
        finishedAt: new Date(nowMs).toISOString(),
      })
    : null;
  const { data, error } = await getSupabaseAdmin().rpc("commit_timed_out_turn", {
    p_room_id: input.room.id,
    p_expected_version: input.room.state_version,
    p_state: input.state,
    p_status: input.state.phase === "game-over" ? "finished" : "playing",
    p_game_phase: input.state.phase,
    p_turn_deadline_at: turnDeadlineForState(input.state, input.players, nowMs),
    p_active_game_id: gameId,
    p_archive_game: archive?.game ?? null,
    p_archive_players: archive?.players ?? null,
  });
  if (error) throw error;
  return data === true;
}

async function rematchRoom(room: RoomRow, players: RoomPlayerRow[]): Promise<void> {
  const { data, error } = await getSupabaseAdmin().rpc("rematch_room", {
    p_room_id: room.id,
    p_expected_version: room.state_version,
    p_players: players,
  });
  if (error) throw error;
  if (data !== true) {
    throw new MultiplayerError(
      "La partie terminée n'est pas encore archivée ou la table a changé.",
      409,
      "rematch_conflict",
    );
  }
}

export async function tickRoom(
  roomId: string,
  userId: string,
  nowMs = Date.now(),
): Promise<MultiplayerRoomView> {
  const current = await roomAndPlayers(roomId);
  humanSeat(current.players, userId);
  if (!isTurnDeadlineExpired(current.room, nowMs)) {
    return roomView(roomId, userId, nowMs);
  }
  const state = applyTimedOutTurnIfExpired(
    current.room,
    await serverState(roomId),
    current.players,
    nowMs,
  );
  if (!state) return roomView(roomId, userId, nowMs);
  await commitTimedOutTurn({ room: current.room, state, players: current.players });
  return roomView(roomId, userId, nowMs);
}

export async function createRoom(input: {
  userId: string; displayName: unknown; targetScore: unknown;
}): Promise<MultiplayerRoomView> {
  const displayName = cleanName(input.displayName);
  if (!Number.isInteger(input.targetScore) || Number(input.targetScore) <= 0) {
    throw new MultiplayerError("Score cible invalide.");
  }
  const db = getSupabaseAdmin();
  let room: RoomRow | null = null;
  for (let attempt = 0; attempt < 8 && !room; attempt += 1) {
    const result = await db.from("rooms").insert({
      code: code(), host_user_id: input.userId, scoring_mode: PRODUCT_SCORING_MODE,
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
    bot_takeover: false, last_seen_at: seat === 0 ? now : null,
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
  if (intent.type !== "claim-host") requireVersion(current.room, expectedVersion);
  const nowMs = Date.now();
  const now = new Date(nowMs).toISOString();

  if (intent.type === "claim-host") {
    if (!canClaimRoomHost(current.room, current.players, userId, nowMs)) {
      throw new MultiplayerError(
        "L'hôte actuel est encore en ligne ou tu ne peux pas récupérer ce rôle.",
        409,
        "host_not_claimable",
      );
    }
    await claimHost(roomId, userId, nowMs);
  } else if (intent.type === "forfeit-game") {
    const result = forfeitRoom({
      ...current, state: await serverState(roomId), userId, nowMs,
    });
    await commit(
      current.room,
      result.state,
      result.status,
      result.players,
      result.players,
      nowMs,
      result.nextHostUserId,
    );
  } else if (intent.type === "game-action") {
    const state = applyAuthorizedAction({ ...current, state: await serverState(roomId), userId, expectedVersion, action: intent.action });
    await commit(current.room, state, state.phase === "game-over" ? "finished" : "playing", null, current.players);
  } else if (intent.type === "enable-bot-takeover") {
    requireHost(current.room, userId);
    if (current.room.status !== "playing") {
      throw new MultiplayerError("Le remplacement temporaire n'est disponible que pendant une partie.", 409, "wrong_room_status");
    }
    const players = enableBotTakeover(current.players, intent.seatIndex, nowMs);
    const state = applyBotTurns(await serverState(roomId), players);
    await commitBotTakeover({
      room: current.room, userId, seatIndex: intent.seatIndex, state, players, nowMs,
    });
  } else if (intent.type === "next-round") {
    humanSeat(current.players, userId);
    const state = await serverState(roomId);
    if (state.phase !== "finished") throw new MultiplayerError("La manche n'est pas terminée.", 409, "wrong_phase");
    const { startNextRound } = await import("@/engine/game");
    const nextState = applyBotTurns(startNextRound(state, Math.random), current.players);
    await commit(current.room, nextState, "playing", null, current.players);
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
      is_ready: true, is_connected: true, bot_takeover: false, last_seen_at: now,
    } : p);
    const names = Object.fromEntries(players.map((p) => [p.seat_index, p.display_name ?? `Joueur ${p.seat_index + 1}`])) as GameState["playerNames"];
    const state = applyBotTurns({ ...createInitialGame(Math.random, { scoringMode: current.room.scoring_mode, targetScore: current.room.target_score }), playerNames: names }, players);
    await commit(
      current.room,
      state,
      state.phase === "game-over" ? "finished" : "playing",
      players,
      players,
      nowMs,
      undefined,
      crypto.randomUUID(),
    );
  } else if (intent.type === "rematch") {
    requireHost(current.room, userId);
    if (current.room.status !== "finished") {
      throw new MultiplayerError("La partie doit être terminée avant de rejouer.", 409, "wrong_room_status");
    }
    const state = await serverState(roomId);
    if (state.phase !== "game-over") {
      throw new MultiplayerError("La partie n'est pas terminée.", 409, "wrong_phase");
    }
    await rematchRoom(current.room, prepareRematchPlayers(current.players));
  } else if (intent.type === "reset-room") {
    requireHost(current.room, userId);
    if (current.room.status !== "lobby") {
      throw new MultiplayerError("Utilise Rejouer après une partie terminée.", 409, "wrong_room_status");
    }
    const players = resetRoomPlayers(current.players);
    await commit(current.room, null, "lobby", players);
  } else if (intent.type === "set-ready") {
    if (current.room.status !== "lobby") throw new MultiplayerError("La table n'est pas dans le lobby.", 409);
    const players = setLobbyReady(current.players, userId, intent.ready, now);
    await commit(current.room, null, "lobby", players);
  } else if (intent.type === "leave-seat") {
    if (current.room.status !== "lobby") throw new MultiplayerError("La place ne peut être quittée qu'au lobby.", 409);
    const players = leaveLobbySeat(current.players, userId, now);
    const successor = current.room.host_user_id === userId
      ? nextHostUserId(players, userId, nowMs)
      : undefined;
    await commit(current.room, null, "lobby", players, players, nowMs, successor);
  } else if (intent.type === "join-seat") {
    requireLobbySeatChange(current.room);
    const displayName = cleanName(intent.displayName);
    joinLobbySeat({
      players: current.players, userId, seatIndex: intent.seatIndex,
      displayName, now,
    });
    await commitLobbySeatMove({
      room: current.room,
      userId,
      seatIndex: intent.seatIndex,
      displayName,
      now,
    });
  }
  return roomView(roomId, userId);
}
