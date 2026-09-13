import type { SupabaseClient } from "@supabase/supabase-js";
import type { GameEndReason, GameState, TeamId } from "@/engine/types";
import type { RoomPlayerRow, RoomRow } from "@/lib/roomTypes";
import type { GameRulesetSnapshot } from "@/engine/rulesets/types";

export type MultiplayerArchiveGame = {
  id: string;
  room_id: string;
  started_at: string;
  finished_at: string;
  scoring_mode: GameState["settings"]["scoringMode"];
  target_score: number;
  team_0_score: number;
  team_1_score: number;
  winner_team: TeamId;
  end_reason: GameEndReason;
  forfeiting_team: TeamId | null;
  round_count: number;
  ruleset_id?: string | null;
  ruleset_version?: number | null;
  ruleset_snapshot?: GameRulesetSnapshot | null;
  round_history?: GameState["roundHistory"];
  player_names?: GameState["playerNames"];
};

export type MultiplayerArchivePlayer = {
  game_id: string;
  seat_index: RoomPlayerRow["seat_index"];
  kind: "human" | "bot";
  user_id: string | null;
  display_name: string;
  bot_profile_id: string | null;
  team_id: TeamId;
};

export type MultiplayerArchive = {
  game: MultiplayerArchiveGame;
  players: MultiplayerArchivePlayer[];
};

export type MultiplayerHistoryPlayer = Omit<MultiplayerArchivePlayer, "game_id" | "user_id">;

export type MultiplayerHistoryGame = Omit<MultiplayerArchiveGame, "room_id"> & {
  viewer_seat_index: RoomPlayerRow["seat_index"];
  players: MultiplayerHistoryPlayer[];
};

export type MultiplayerStats = {
  total: number;
  wins: number;
  losses: number;
  winrate: number;
  scoreWins: number;
  forfeitWins: number;
  forfeitLosses: number;
  averageTeamScore: number;
  frequentPartners: string[];
  frequentOpponents: string[];
};

export function buildMultiplayerArchive(input: {
  gameId: string;
  room: RoomRow;
  state: GameState;
  players: RoomPlayerRow[];
  finishedAt: string;
}): MultiplayerArchive | null {
  if (input.state.phase !== "game-over" || input.state.winnerTeam === null) return null;
  const endReason = input.state.endReason ?? "score";
  return {
    game: {
      id: input.gameId,
      room_id: input.room.id,
      started_at: input.room.started_at ?? input.room.created_at,
      finished_at: input.finishedAt,
      scoring_mode: input.room.scoring_mode,
      target_score: input.room.target_score,
      team_0_score: input.state.totalScore[0],
      team_1_score: input.state.totalScore[1],
      winner_team: input.state.winnerTeam,
      end_reason: endReason,
      forfeiting_team: endReason === "forfeit" ? input.state.forfeitingTeam ?? null : null,
      round_count: input.state.roundNumber,
      ruleset_id: input.state.settings.ruleset?.id ?? input.room.ruleset_id ?? null,
      ruleset_version: input.state.settings.ruleset?.version ?? input.room.ruleset_version ?? null,
      ruleset_snapshot: input.state.settings.ruleset ?? input.room.ruleset_snapshot ?? null,
      round_history: input.state.roundHistory,
      player_names: input.state.playerNames,
    },
    players: input.players
      .filter((player): player is RoomPlayerRow & { kind: "human" | "bot" } => player.kind !== "empty")
      .map((player) => ({
        game_id: input.gameId,
        seat_index: player.seat_index,
        kind: player.kind,
        user_id: player.kind === "human" ? player.user_id : null,
        display_name: player.display_name ?? `Joueur ${player.seat_index + 1}`,
        bot_profile_id: player.kind === "bot" ? player.bot_profile_id : null,
        team_id: player.seat_index % 2 as TeamId,
      })),
  };
}

export async function getUserMultiplayerGames(supabase: SupabaseClient) {
  const result = await supabase.rpc("get_my_multiplayer_history");
  return {
    ...result,
    data: (Array.isArray(result.data) ? result.data : []) as MultiplayerHistoryGame[],
  };
}

export function viewerTeam(game: MultiplayerHistoryGame): TeamId {
  return game.viewer_seat_index % 2 as TeamId;
}

export function didViewerWin(game: MultiplayerHistoryGame): boolean {
  return viewerTeam(game) === game.winner_team;
}

export function viewerTeamScore(game: MultiplayerHistoryGame): number {
  return viewerTeam(game) === 0 ? game.team_0_score : game.team_1_score;
}

export function opposingTeamScore(game: MultiplayerHistoryGame): number {
  return viewerTeam(game) === 0 ? game.team_1_score : game.team_0_score;
}

export function partnerNames(game: MultiplayerHistoryGame): string[] {
  const team = viewerTeam(game);
  return game.players
    .filter((player) => player.team_id === team && player.seat_index !== game.viewer_seat_index)
    .map((player) => player.display_name);
}

export function opponentNames(game: MultiplayerHistoryGame): string[] {
  const team = viewerTeam(game);
  return game.players.filter((player) => player.team_id !== team).map((player) => player.display_name);
}

export function multiplayerEndLabel(game: MultiplayerHistoryGame): string {
  return game.end_reason === "forfeit" ? "abandon" : "score";
}

export function calculateMultiplayerStats(games: MultiplayerHistoryGame[]): MultiplayerStats {
  const wins = games.filter(didViewerWin).length;
  return {
    total: games.length,
    wins,
    losses: games.length - wins,
    winrate: percent(wins, games.length),
    scoreWins: games.filter((game) => didViewerWin(game) && game.end_reason === "score").length,
    forfeitWins: games.filter((game) => didViewerWin(game) && game.end_reason === "forfeit").length,
    forfeitLosses: games.filter((game) => !didViewerWin(game) && game.forfeiting_team === viewerTeam(game)).length,
    averageTeamScore: average(games.map(viewerTeamScore)),
    frequentPartners: mostFrequent(games.flatMap(partnerNames)),
    frequentOpponents: mostFrequent(games.flatMap(opponentNames)),
  };
}

function average(values: number[]): number {
  if (values.length === 0) return 0;
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function percent(count: number, total: number): number {
  return total > 0 ? Math.round((count / total) * 100) : 0;
}

function mostFrequent(names: string[]): string[] {
  const counts = new Map<string, number>();
  for (const name of names) counts.set(name, (counts.get(name) ?? 0) + 1);
  const maximum = Math.max(0, ...counts.values());
  return [...counts.entries()]
    .filter(([, count]) => count === maximum)
    .map(([name]) => name)
    .sort((first, second) => first.localeCompare(second, "fr"));
}
