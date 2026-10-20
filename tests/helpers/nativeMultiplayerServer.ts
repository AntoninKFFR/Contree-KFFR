// Test-only in-memory HTTP boundary. Uses the unchanged authoritative engine and
// multiplayer authorization helpers. No Supabase, credentials or network calls.
import { createInitialGame, startNextRound } from "../../engine/game";
import { createSeededRandom } from "../../engine/random";
import { buildCustomRuleset, type CustomRulesetInput } from "../../engine/rulesets/custom";
import { toPlayerGameView } from "../../engine/views";
import type { GameState } from "../../engine/types";
import type { MultiplayerRoomView, RoomIntent, RoomPlayerRow, RoomRow } from "../../lib/roomTypes";
import { projectRoomPlayers } from "../../lib/multiplayerPresence";
import { DEFAULT_MULTIPLAYER_TABLE_PREFERENCES } from "../../lib/multiplayerTablePreferences";
import { applyAuthorizedAction, applySingleBotTurn, joinLobbySeat, leaveLobbySeat, setLobbyReady, requireVersion, requireHost, MultiplayerError, prepareRoomRulesUpdate, forfeitRoom, prepareRematchPlayers, hostTransferTargetUserId, enableBotTakeover, viewerSeatIndex } from "../../lib/server/multiplayerGame";
import { botReadyAt, turnDeadlineForState, isTurnDeadlineExpired } from "../../lib/multiplayerTurnTimer";
import { applyTimedOutTurn } from "../../lib/server/multiplayerGame";
import { canClaimRoomHost, nextHostUserId } from "../../lib/multiplayerHost";

export const TEST_ROOM_ID = "15100000-0000-4000-8000-000000000001";
export const TEST_GAME_ID = "15100000-0000-4000-8000-000000000002";
export function memoryMultiplayerServer(seed = 71, initialNow = Date.parse("2026-10-21T12:00:00Z")) {
  const random = createSeededRandom(seed);
  let now = initialNow;
  let room: RoomRow, players: RoomPlayerRow[], game: GameState | null = null;
  const calls: { user: string; path: string; body: unknown }[] = [];
  const date = () => new Date(now).toISOString();
  function create(user: string, rules: CustomRulesetInput = { presetId: "contree-kffr" }) {
    const ruleset = buildCustomRuleset(rules);
    room = { id: TEST_ROOM_ID, code: "KFFR151", status: "lobby", host_user_id: user, active_game_id: null, scoring_mode: "ffb", target_score: ruleset.game.targetScore,
      ruleset_id: ruleset.id, ruleset_version: ruleset.version, ruleset_snapshot: ruleset, presentation_settings: { ...DEFAULT_MULTIPLAYER_TABLE_PREFERENCES },
      game_phase: null, state_version: 0, turn_deadline_at: null, created_at: date(), updated_at: date(), started_at: null, finished_at: null };
    players = ([0, 1, 2, 3] as const).map((seat_index) => ({ id: `seat-${seat_index}`, room_id: room.id, seat_index, kind: seat_index === 0 ? "human" : "empty",
      user_id: seat_index === 0 ? user : null, bot_profile_id: null, display_name: seat_index === 0 ? "Alice" : null, is_ready: false, is_connected: seat_index === 0,
      bot_takeover: false, last_seen_at: seat_index === 0 ? date() : null, joined_at: seat_index === 0 ? date() : null, left_at: null, created_at: date(), updated_at: date() }));
  }
  create("web");
  function view(user: string): MultiplayerRoomView {
    const seat = viewerSeatIndex(players, user);
    if (seat === null && room.status !== "lobby") throw new MultiplayerError("Tu ne fais pas partie de cette table.", 403, "not_a_member");
    const { host_user_id, active_game_id, ...publicRoom } = room;
    return structuredClone({ room: publicRoom, gameId: seat === null ? null : active_game_id, viewerSeatIndex: seat,
      game: game && seat !== null ? toPlayerGameView(game, seat) : null, isHost: host_user_id === user,
      canClaimHost: canClaimRoomHost(room, players, user, now), players: projectRoomPlayers(players, now, host_user_id) });
  }
  function commit() { room = { ...room, state_version: room.state_version + 1, updated_at: date(), game_phase: game?.phase ?? null,
    status: game?.phase === "game-over" ? "finished" : room.status, turn_deadline_at: turnDeadlineForState(game, players, now) }; }
  function intent(user: string, version: number, intent: RoomIntent) {
    requireVersion(room, version);
    switch (intent.type) {
      case "join-seat":
        if (room.status !== "lobby") throw new MultiplayerError("Table indisponible.", 409);
        players = joinLobbySeat({ players, userId: user, seatIndex: intent.seatIndex, displayName: user === "ios" ? "Béatrice" : user, now: date() }); break;
      case "leave-seat": players = leaveLobbySeat(players, user, date()); if (room.host_user_id === user) room.host_user_id = nextHostUserId(players, user, now); break;
      case "set-ready": players = setLobbyReady(players, user, intent.ready, date()); break;
      case "start-game": {
        requireHost(room, user);
        if (room.status !== "lobby" || players.some((p) => p.kind === "human" && !p.is_ready)) throw new MultiplayerError("Tous les humains doivent être prêts.");
        players = players.map((p) => p.kind !== "empty" ? p : { ...p, kind: "bot", display_name: `Bot ${p.seat_index}`, bot_profile_id: "simple", is_ready: true, is_connected: true });
        game = createInitialGame(random, { ruleset: room.ruleset_snapshot! });
        game.playerNames = Object.fromEntries(players.map((p) => [p.seat_index, p.display_name!])) as GameState["playerNames"];
        room.status = "playing"; room.started_at = date(); room.active_game_id = TEST_GAME_ID; break;
      }
      case "game-action": game = applyAuthorizedAction({ room, players, state: game!, userId: user, expectedVersion: version, action: intent.action }); break;
      case "next-round": if (!players.some((p) => p.user_id === user) || game?.phase !== "finished") throw new MultiplayerError("Manche non terminée."); game = startNextRound(game, random); break;
      case "forfeit-game": { const next = forfeitRoom({ room, players, state: game!, userId: user, nowMs: now }); game = next.state; players = next.players; room.status = next.status; if (next.nextHostUserId !== undefined) room.host_user_id = next.nextHostUserId; break; }
      case "transfer-host": room.host_user_id = hostTransferTargetUserId({ room, players, actorUserId: user, targetSeatIndex: intent.targetSeatIndex, nowMs: now }); break;
      case "enable-bot-takeover": requireHost(room, user); players = enableBotTakeover(players, intent.seatIndex, now); break;
      case "claim-host": if (!canClaimRoomHost(room, players, user, now)) throw new MultiplayerError("Hôte présent.", 409); room.host_user_id = user; break;
      case "rematch": requireHost(room, user); if (room.status !== "finished") throw new MultiplayerError("Partie non terminée."); players = prepareRematchPlayers(players); game = null; room.status = "lobby"; room.active_game_id = null; break;
      case "update-room-rules": { const next = prepareRoomRulesUpdate({ room, players, userId: user, rules: intent.rules }); room.ruleset_snapshot = next.ruleset; room.target_score = next.ruleset.game.targetScore; players = next.players; break; }
      case "update-room-presentation": requireHost(room, user); room.presentation_settings = intent.settings; break;
      default: throw new MultiplayerError("Intention non couverte par ce fixture.");
    }
    commit(); return view(user);
  }
  const fetcher: typeof fetch = async (url, init) => {
    const path = new URL(String(url)).pathname, user = new Headers(init?.headers).get("authorization")?.replace("Bearer ", "") ?? "";
    const body = init?.body ? JSON.parse(String(init.body)) : null;
    calls.push({ user, path, body });
    try {
      if (!user) throw new MultiplayerError("Session requise.", 401);
      if (path === "/api/multiplayer/rooms") {
        if (body.type === "create") create(user, body.rules);
        else if (body.code !== room.code) throw new MultiplayerError("Code introuvable.", 404);
      } else if (path.endsWith("/presence")) {
        const seat = players.find((p) => p.user_id === user); if (!seat) throw new MultiplayerError("Place requise.", 403);
        seat.last_seen_at = date(); seat.is_connected = true; seat.bot_takeover = false;
      } else if (path.endsWith("/tick")) {
        if (!players.some((p) => p.user_id === user)) throw new MultiplayerError("Place requise.", 403);
        if (game && room.status === "playing") {
          const ready = botReadyAt(room, game, players);
          if (ready !== null && now >= ready) { game = applySingleBotTurn(game, players); commit(); }
          else if (ready === null && isTurnDeadlineExpired(room, now)) { game = applyTimedOutTurn(game, players); commit(); }
        }
      } else if (init?.method === "POST") intent(user, body.expectedVersion, body.intent);
      return new Response(JSON.stringify({ data: view(user) }), { headers: { "content-type": "application/json" } });
    } catch (error) { return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Refus", code: error instanceof MultiplayerError ? error.code : "invalid_action" }), { status: error instanceof MultiplayerError ? error.status : 400 }); }
  };
  return { fetcher, view, intent, calls, advance: (ms: number) => { now += ms; }, get now() { return now; }, get game() { return game; }, get players() { return players; }, get room() { return room; } };
}
