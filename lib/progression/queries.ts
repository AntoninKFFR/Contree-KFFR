import type { SupabaseClient } from "@supabase/supabase-js";
import { getProgression, type ProgressionSummary } from "@/lib/progression/formulaV1";

// The read RPC takes no user ID and returns the virtual 0-XP state when absent.
// All future UI consumers share this query and the single canonical formula.
export async function getMyProgression(supabase: SupabaseClient): Promise<ProgressionSummary> {
  const { data, error } = await supabase.rpc("get_my_progression");
  if (error) throw error;
  if (!data || typeof data !== "object" || Array.isArray(data)
    || typeof data.total_xp !== "number") {
    throw new Error("Invalid progression summary");
  }
  return getProgression(data.total_xp);
}

export type RecentXpEvent = { amount: number; sourceType: string; createdAt: string };

/** Existing owner SELECT RLS; no source identity is exposed to presentation. */
export async function getMyRecentXpEvents(supabase: SupabaseClient): Promise<RecentXpEvent[]> {
  const { data, error } = await supabase.from("progression_xp_events")
    .select("amount,source_type,created_at").order("created_at", { ascending: false })
    .order("id", { ascending: false }).limit(5);
  if (error) throw error;
  return (data ?? []).map((row) => {
    if (!Number.isSafeInteger(row.amount) || row.amount <= 0 || typeof row.source_type !== "string"
      || typeof row.created_at !== "string" || !Number.isFinite(Date.parse(row.created_at))) {
      throw new Error("Invalid progression event");
    }
    return { amount: row.amount, sourceType: row.source_type, createdAt: row.created_at };
  });
}
