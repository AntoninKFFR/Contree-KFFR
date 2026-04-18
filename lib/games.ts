import type { SupabaseClient } from "@supabase/supabase-js";
import type { GameState } from "@/engine/types";

type SavedGamePayload = {
  bot_score: number;
  bot_summary: string;
  player_score: number;
  scoring_mode: GameState["settings"]["scoringMode"];
  target_score: number;
  user_id: string;
  won: boolean;
};

function botSummary(state: GameState) {
  return [1, 2, 3]
    .map((playerId) => state.playerNames?.[playerId as 1 | 2 | 3])
    .filter(Boolean)
    .join(", ");
}

export function buildSavedGamePayload(
  state: GameState,
  userId: string,
): SavedGamePayload | null {
  if (state.phase !== "game-over" || state.winnerTeam === null) {
    return null;
  }

  return {
    user_id: userId,
    won: state.winnerTeam === 0,
    scoring_mode: state.settings.scoringMode,
    player_score: state.totalScore[0],
    bot_score: state.totalScore[1],
    target_score: state.settings.targetScore,
    bot_summary: botSummary(state),
  };
}

export async function saveCompletedGame(
  supabase: SupabaseClient,
  state: GameState,
  userId: string,
) {
  const payload = buildSavedGamePayload(state, userId);

  if (!payload) {
    return { error: null };
  }

  return supabase.from("games").insert(payload);
}
