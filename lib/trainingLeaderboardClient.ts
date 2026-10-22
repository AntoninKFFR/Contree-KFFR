import type { PersistablePuzzleAxisId } from "@/engine/training/seriesContract";
import { getSupabaseClient } from "@/lib/supabaseClient";

import { parseTrainingLeaderboardRows, type TrainingLeaderboardResult } from "@/lib/training/leaderboard";
export * from "@/lib/training/leaderboard";

export async function readFriendsTrainingLeaderboard(
  axisId: PersistablePuzzleAxisId, level: number,
): Promise<TrainingLeaderboardResult> {
  const client = getSupabaseClient();
  if (!client) return { status: "signed-out", entries: [] };
  try {
    const { data: auth } = await client.auth.getSession();
    if (!auth.session) return { status: "signed-out", entries: [] };
    const { data, error } = await client.rpc("get_friends_training_leaderboard", {
      p_axis_id: axisId, p_level: level,
    });
    if (error) return { status: "failed", entries: [] };
    return { status: "ready", entries: parseTrainingLeaderboardRows(data) };
  } catch { return { status: "failed", entries: [] }; }
}
