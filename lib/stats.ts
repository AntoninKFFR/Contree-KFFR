import type { SupabaseClient } from "@supabase/supabase-js";

export type GameRow = {
  id: string;
  bot_score: number | null;
  bot_summary: string | null;
  created_at: string | null;
  player_score: number | null;
  scoring_mode: string | null;
  target_score: number | null;
  won: boolean | null;
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
    .select("id, created_at, won, scoring_mode, player_score, bot_score, target_score, bot_summary")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
}

export function calculateStats(games: GameRow[]): UserStats {
  const total = games.length;
  const wins = games.filter((game) => game.won).length;
  const losses = total - wins;

  return {
    averageBotScore: average(games.map((game) => game.bot_score)),
    averagePlayerScore: average(games.map((game) => game.player_score)),
    bestStreak: bestStreak(games),
    currentStreak: currentStreak(games),
    losses,
    madePointsWinrate: winrateForMode(games, "made-points"),
    announcedPointsWinrate: winrateForMode(games, "announced-points"),
    total,
    winrate: percent(wins, total),
    wins,
  };
}

export function formatDate(value: string | null) {
  if (!value) return "Date inconnue";

  return new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}

export function scoringModeLabel(value: string | null) {
  if (value === "made-points") return "Points faits";
  if (value === "announced-points") return "Points annonces";
  return value ?? "Mode inconnu";
}

function average(values: Array<number | null>) {
  const validValues = values.filter((value): value is number => typeof value === "number");

  if (validValues.length === 0) return 0;

  const total = validValues.reduce((sum, value) => sum + value, 0);
  return Math.round(total / validValues.length);
}

function bestStreak(games: GameRow[]) {
  let best = 0;
  let current = 0;

  for (const game of chronologicalGames(games)) {
    if (game.won) {
      current += 1;
      best = Math.max(best, current);
    } else {
      current = 0;
    }
  }

  return best;
}

function currentStreak(games: GameRow[]) {
  let streak = 0;

  for (const game of games) {
    if (!game.won) {
      break;
    }

    streak += 1;
  }

  return streak;
}

function chronologicalGames(games: GameRow[]) {
  return [...games].reverse();
}

function percent(count: number, total: number) {
  return total > 0 ? Math.round((count / total) * 100) : 0;
}

function winrateForMode(games: GameRow[], mode: string) {
  const modeGames = games.filter((game) => game.scoring_mode === mode);
  const wins = modeGames.filter((game) => game.won).length;

  return percent(wins, modeGames.length);
}
