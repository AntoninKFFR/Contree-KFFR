import { PERSISTABLE_PUZZLE_AXES, type PersistablePuzzleAxisId } from "@/engine/training/seriesContract";
import { getSupabaseClient } from "@/lib/supabaseClient";

export type AccountTrainingRecord = {
  axisId: PersistablePuzzleAxisId;
  level: number;
  bestScore: number;
  bestDurationMs: number | null;
};

export async function readAccountTrainingRecords(): Promise<{ signedIn: boolean; records: AccountTrainingRecord[]; failed: boolean }> {
  const client = getSupabaseClient();
  if (!client) return { signedIn: false, records: [], failed: false };
  try {
    const { data } = await client.auth.getSession();
    if (!data.session) return { signedIn: false, records: [], failed: false };
    const result = await client.from("training_records").select("axis_id,level,best_score,best_duration_ms");
    if (result.error) return { signedIn: true, records: [], failed: true };
    const records = (result.data ?? []).filter((row) => typeof row.axis_id === "string"
      && Object.prototype.hasOwnProperty.call(PERSISTABLE_PUZZLE_AXES, row.axis_id))
      .map((row) => ({ axisId: row.axis_id as PersistablePuzzleAxisId, level: Number(row.level),
        bestScore: Number(row.best_score), bestDurationMs: row.best_duration_ms === null ? null : Number(row.best_duration_ms) }));
    return { signedIn: true, records, failed: false };
  } catch { return { signedIn: true, records: [], failed: true }; }
}
