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
