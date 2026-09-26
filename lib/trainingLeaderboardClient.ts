import type { PersistablePuzzleAxisId } from "@/engine/training/seriesContract";
import { getSupabaseClient } from "@/lib/supabaseClient";

export type TrainingLeaderboardEntry = {
  username: string;
  bestScore: number;
  bestDurationMs: number | null;
};

export type TrainingLeaderboardResult =
  | { status: "ready"; entries: TrainingLeaderboardEntry[] }
  | { status: "signed-out" | "failed"; entries: [] };

export function parseTrainingLeaderboardRows(value: unknown): TrainingLeaderboardEntry[] {
  if (!Array.isArray(value) || value.length > 50) throw new Error("invalid_training_leaderboard_response");
  return value.map((raw) => {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      throw new Error("invalid_training_leaderboard_response");
    }
    const row = raw as Record<string, unknown>;
    const username = row.username;
    const score = row.best_score;
    const duration = row.best_duration_ms;
    if (typeof username !== "string" || username.trim() !== username
      || username.length === 0 || Array.from(username).length > 40
      || typeof score !== "number" || !Number.isFinite(score) || score < 0 || score > 10
      || (duration !== null && (!Number.isInteger(duration) || Number(duration) < 0))) {
      throw new Error("invalid_training_leaderboard_response");
    }
    return { username, bestScore: score, bestDurationMs: duration as number | null };
  });
}

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
