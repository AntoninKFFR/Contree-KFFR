import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createInitialGame, endGameByForfeit } from "@/engine/game";
import type { GameState } from "@/engine/types";
import {
  buildMultiplayerArchive,
  calculateMultiplayerStats,
  didViewerWin,
  multiplayerEndLabel,
  opponentNames,
  partnerNames,
  type MultiplayerHistoryGame,
} from "@/lib/multiplayerHistory";
import type { RoomPlayerRow, RoomRow } from "@/lib/roomTypes";
import { prepareRematchPlayers } from "@/lib/server/multiplayerGame";
import { calculateStats } from "@/lib/stats";

const ROOM: RoomRow = {
  id: "room-1",
  code: "ABC123",
  status: "playing",
  host_user_id: "user-0",
  active_game_id: "game-1",
  scoring_mode: "made-points",
  target_score: 1000,
  game_phase: "playing",
  state_version: 8,
  turn_deadline_at: "2026-09-09T14:00:45.000Z",
  created_at: "2026-09-09T12:00:00.000Z",
  updated_at: "2026-09-09T14:00:00.000Z",
  started_at: "2026-09-09T13:00:00.000Z",
  finished_at: null,
};

function player(seat: 0 | 1 | 2 | 3, kind: "human" | "bot"): RoomPlayerRow {
  return {
    id: `seat-${seat}`,
    room_id: ROOM.id,
    seat_index: seat,
    kind,
    user_id: kind === "human" ? `user-${seat}` : null,
    bot_profile_id: kind === "bot" ? "main_montecarlo_v2" : null,
    display_name: kind === "human" ? `Humain ${seat}` : `Bot ${seat}`,
    is_ready: true,
    is_connected: true,
    bot_takeover: kind === "human" && seat === 2,
    last_seen_at: "2026-09-09T14:00:00.000Z",
    joined_at: "2026-09-09T12:30:00.000Z",
    left_at: null,
    created_at: "2026-09-09T12:00:00.000Z",
    updated_at: "2026-09-09T14:00:00.000Z",
  };
}

function players(humanSeats: Array<0 | 1 | 2 | 3>): RoomPlayerRow[] {
  return ([0, 1, 2, 3] as const).map((seat) => player(seat, humanSeats.includes(seat) ? "human" : "bot"));
}

function completedState(endReason: "score" | "forfeit" = "score"): GameState {
  const base = {
    ...createInitialGame(() => 0.1),
    totalScore: { 0: 620, 1: 410 } as GameState["totalScore"],
    roundHistory: createInitialGame(() => 0.1).roundHistory,
  };
  return endReason === "forfeit"
    ? endGameByForfeit(base, 1)
    : { ...base, phase: "game-over", winnerTeam: 0, endReason: "score", forfeitingTeam: null };
}

function archive(humanSeats: Array<0 | 1 | 2 | 3>, endReason: "score" | "forfeit" = "score") {
  const result = buildMultiplayerArchive({
    gameId: "game-1",
    room: ROOM,
    state: completedState(endReason),
    players: players(humanSeats),
    finishedAt: "2026-09-09T14:00:00.000Z",
  });
  if (!result) throw new Error("Expected an archive");
  return result;
}

function historyForSeat(seat: 0 | 1 | 2 | 3, endReason: "score" | "forfeit" = "score"): MultiplayerHistoryGame {
  const stored = archive([0, 1, 2, 3], endReason);
  const { room_id: _roomId, ...game } = stored.game;
  void _roomId;
  return {
    ...game,
    viewer_seat_index: seat,
    players: stored.players.map(({ game_id: _gameId, user_id: _userId, ...snapshot }) => {
      void _gameId;
      void _userId;
      return snapshot;
    }),
  };
}

describe("multiplayer game archives", () => {
  it("builds a score victory summary", () => {
    expect(archive([0, 1, 2, 3]).game).toMatchObject({
      id: "game-1",
      winner_team: 0,
      end_reason: "score",
      forfeiting_team: null,
      team_0_score: 620,
      team_1_score: 410,
      round_count: 1,
    });
  });

  it("archives the immutable ruleset snapshot", () => {
    expect(archive([0]).game).toMatchObject({ ruleset_id: "contree-kffr", ruleset_version: 1 });
    expect(archive([0]).game.ruleset_snapshot?.game.targetScore).toBe(1000);
  });

  it("keeps legacy archives readable without a ruleset snapshot", () => {
    const game = historyForSeat(0);
    delete game.ruleset_id;
    delete game.ruleset_version;
    delete game.ruleset_snapshot;
    expect(game.target_score).toBe(1000);
  });

  it("builds a forfeit victory summary", () => {
    expect(archive([0, 1], "forfeit").game).toMatchObject({
      winner_team: 0,
      end_reason: "forfeit",
      forfeiting_team: 1,
    });
  });

  it.each([
    [[0], 1],
    [[0, 1], 2],
    [[0, 1, 2], 3],
    [[0, 1, 2, 3], 4],
  ] as const)("persists every occupied seat with %s human seat(s)", (humanSeats, humanCount) => {
    const result = archive([...humanSeats]);
    expect(result.players).toHaveLength(4);
    expect(result.players.filter((entry) => entry.kind === "human")).toHaveLength(humanCount);
  });

  it("uses a stable primary key and idempotent inserts in the migration", () => {
    const sql = readFileSync("supabase/migrations/20260909030000_multiplayer_history_rematches.sql", "utf8");
    expect(sql).toContain("id uuid primary key");
    expect(sql).toContain("on conflict (id) do nothing");
    const stored = new Map<string, ReturnType<typeof archive>>();
    stored.set(archive([0]).game.id, archive([0]));
    stored.set(archive([0]).game.id, archive([0]));
    expect(stored.size).toBe(1);
  });

  it("never puts GameState, hands or cards in the public history payload", () => {
    const publicGame = historyForSeat(0);
    const serialized = JSON.stringify(publicGame);
    expect(serialized).not.toContain('"hands"');
    expect(serialized).not.toContain('"state"');
    expect(serialized).not.toContain('"card"');
    expect(serialized).not.toContain("user-1");
  });

  it("keeps the display-name snapshot independent from later profile changes", () => {
    const currentPlayers = players([0, 1]);
    const result = buildMultiplayerArchive({
      gameId: "game-1", room: ROOM, state: completedState(), players: currentPlayers,
      finishedAt: "2026-09-09T14:00:00.000Z",
    });
    currentPlayers[0].display_name = "Nouveau pseudo";
    expect(result?.players[0].display_name).toBe("Humain 0");
  });

  it("restricts reads to auth.uid participants and omits user ids from the history RPC", () => {
    const sql = readFileSync("supabase/migrations/20260909030000_multiplayer_history_rematches.sql", "utf8");
    expect(sql).toContain("user_id = auth.uid()");
    const rpc = sql.slice(sql.indexOf("get_my_multiplayer_history"));
    expect(rpc.slice(0, rpc.indexOf("revoke all on function"))).not.toContain("'user_id'");
  });
});

describe("multiplayer history and statistics", () => {
  it("reports opposite winner and loser results", () => {
    expect(didViewerWin(historyForSeat(0))).toBe(true);
    expect(didViewerWin(historyForSeat(1))).toBe(false);
  });

  it("identifies the partner and opponents from immutable seat snapshots", () => {
    const game = historyForSeat(0);
    expect(partnerNames(game)).toEqual(["Humain 2"]);
    expect(opponentNames(game)).toEqual(["Humain 1", "Humain 3"]);
  });

  it("calculates multi totals, winrate, score wins, forfeits and average team score", () => {
    const games = [historyForSeat(0), historyForSeat(0, "forfeit"), historyForSeat(1, "forfeit")];
    expect(calculateMultiplayerStats(games)).toMatchObject({
      total: 3,
      wins: 2,
      losses: 1,
      winrate: 67,
      scoreWins: 1,
      forfeitWins: 1,
      forfeitLosses: 1,
      averageTeamScore: 550,
    });
  });

  it("keeps solo statistics unchanged", () => {
    expect(calculateStats([
      { id: "1", won: true, player_score: 100, bot_score: 50, created_at: "", scoring_mode: "made-points", target_score: 1000, bot_summary: "" },
      { id: "2", won: false, player_score: 80, bot_score: 120, created_at: "", scoring_mode: "made-points", target_score: 1000, bot_summary: "" },
    ])).toMatchObject({ total: 2, wins: 1, losses: 1, winrate: 50 });
  });

  it("labels a forfeit explicitly", () => {
    expect(multiplayerEndLabel(historyForSeat(0, "forfeit"))).toBe("abandon");
  });
});

describe("multiplayer rematches", () => {
  it("preserves human seats and bot seats", () => {
    const before = players([0, 2]);
    const after = prepareRematchPlayers(before);
    expect(after.map(({ seat_index, kind, user_id, bot_profile_id }) => ({ seat_index, kind, user_id, bot_profile_id })))
      .toEqual(before.map(({ seat_index, kind, user_id, bot_profile_id }) => ({ seat_index, kind, user_id, bot_profile_id })));
  });

  it("resets human readiness and every bot takeover", () => {
    const after = prepareRematchPlayers(players([0, 2]));
    expect(after.filter((entry) => entry.kind === "human").every((entry) => !entry.is_ready)).toBe(true);
    expect(after.every((entry) => !entry.bot_takeover)).toBe(true);
  });

  it("keeps bots ready for the next launch", () => {
    expect(prepareRematchPlayers(players([0, 2])).filter((entry) => entry.kind === "bot").every((entry) => entry.is_ready)).toBe(true);
  });

  it("requires an archived active game and clears deadline/state in the atomic rematch RPC", () => {
    const sql = readFileSync("supabase/migrations/20260909030000_multiplayer_history_rematches.sql", "utf8");
    const rematch = sql.slice(sql.indexOf("create or replace function public.rematch_room"));
    expect(rematch).toContain("exists (select 1 from public.multiplayer_games where id = room.active_game_id)");
    expect(rematch).toContain("turn_deadline_at = null");
    expect(rematch).toContain("delete from public.room_game_states");
  });

  it("creates independent ids for consecutive games without changing the old archive", () => {
    const first = archive([0, 1]);
    const second = buildMultiplayerArchive({
      gameId: "game-2",
      room: { ...ROOM, active_game_id: "game-2" },
      state: completedState(),
      players: players([0, 1]),
      finishedAt: "2026-09-09T15:00:00.000Z",
    });
    expect(second?.game.id).not.toBe(first.game.id);
    expect(first.game.id).toBe("game-1");
  });
});
