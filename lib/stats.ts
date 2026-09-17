import type { SupabaseClient } from "@supabase/supabase-js";
import type { GameRulesetSnapshot } from "@/engine/rulesets/types";
import type { GameState } from "@/engine/types";
import { calculateDetailedPlayerStats, soloGamesForDetailedStats } from "@/lib/detailedPlayerStats";
export { scoringModeLabel } from "@/lib/productGame";

export type GameRow = {
  id: string;
  bot_score: number | null;
  bot_summary: string | null;
  created_at: string | null;
  player_score: number | null;
  scoring_mode: string | null;
  target_score: number | null;
  won: boolean | null;
  ruleset_id?: string | null;
  ruleset_version?: number | null;
  ruleset_snapshot?: GameRulesetSnapshot | null;
  round_history?: GameState["roundHistory"];
  player_names?: GameState["playerNames"];
};

export type UserStats = {
  averageBotScore: number;
  averagePlayerScore: number;
  bestStreak: number;
  currentStreak: number;
  losses: number;
  madePointsWinrate: number;
  announcedPointsWinrate: number;
  total: number;
  winrate: number;
  wins: number;
};

export async function getUserGames(supabase: SupabaseClient, userId: string) {
  return supabase
    .from("games")
    .select("id, created_at, won, scoring_mode, player_score, bot_score, target_score, bot_summary, ruleset_id, ruleset_version, ruleset_snapshot, round_history, player_names")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
}

export function calculateStats(games: GameRow[]): UserStats {
  const shared = calculateDetailedPlayerStats(soloGamesForDetailedStats(games));

  return {
    averageBotScore: average(games.map((game) => game.bot_score)),
    averagePlayerScore: average(games.map((game) => game.player_score)),
    bestStreak: shared.bestStreak,
    currentStreak: shared.currentStreak,
    losses: shared.losses,
    madePointsWinrate: winrateForMode(games, "made-points"),
    announcedPointsWinrate: winrateForMode(games, "announced-points"),
    total: shared.total,
    winrate: shared.winrate ?? 0,
    wins: shared.wins,
  };
}

export function formatDate(value: string | null) {
  if (!value) return "Date inconnue";

  return new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}

function average(values: Array<number | null>) {
  const validValues = values.filter((value): value is number => typeof value === "number");

  if (validValues.length === 0) return 0;

  const total = validValues.reduce((sum, value) => sum + value, 0);
  return Math.round(total / validValues.length);
}

function percent(count: number, total: number) {
  return total > 0 ? Math.round((count / total) * 100) : 0;
}

function winrateForMode(games: GameRow[], mode: string) {
  const modeGames = games.filter((game) => game.scoring_mode === mode);
  const wins = modeGames.filter((game) => game.won).length;

  return percent(wins, modeGames.length);
}
