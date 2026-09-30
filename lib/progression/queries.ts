import { weeklyMissionCopy, type WeeklySnapshot } from "@/lib/progression/weeklyMissions";
import { permanentMissionKeys, type PermanentMission } from "@/lib/progression/permanentMissions";
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

/** No account parameter: the RPC derives ownership from the current JWT. */
export async function getMyPermanentMissions(supabase: SupabaseClient): Promise<PermanentMission[]> {
  const { data, error } = await supabase.rpc("get_my_permanent_missions");
  if (error) throw error;
  if (!Array.isArray(data) || data.length !== permanentMissionKeys.length) throw new Error("Invalid permanent missions");
  return data.map((row, index) => {
    if (!row || row.key !== permanentMissionKeys[index] || !Number.isSafeInteger(row.rewardXp) || row.rewardXp <= 0
      || typeof row.completed !== "boolean" || (row.completed
        ? typeof row.completedAt !== "string" || !Number.isFinite(Date.parse(row.completedAt))
        : row.completedAt !== null)) throw new Error("Invalid permanent mission");
    return { key: row.key, rewardXp: row.rewardXp, completed: row.completed, completedAt: row.completedAt };
  });
}

/** The server owns version, selection, week and reset; this read writes nothing. */
export async function getMyWeeklyMissions(supabase: SupabaseClient): Promise<WeeklySnapshot> {
  const { data, error } = await supabase.rpc("get_my_weekly_missions");
  if (error) throw error;
  if (!data || !Number.isSafeInteger(data.catalogVersion) || data.catalogVersion < 1
    || typeof data.weekStart !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(data.weekStart)
    || !Number.isFinite(Date.parse(data.weekStart)) || typeof data.nextResetAt !== "string"
    || !Number.isFinite(Date.parse(data.nextResetAt)) || !Array.isArray(data.missions) || data.missions.length !== 3
    || new Set(data.missions.map((m: {key:unknown}) => m?.key)).size !== 3) throw new Error("Invalid weekly snapshot");
  const missions = data.missions.map((m: Record<string,unknown>) => {
    if (!m || typeof m.key !== "string" || !Object.hasOwn(weeklyMissionCopy,m.key)
      || !Number.isSafeInteger(m.target) || Number(m.target) < 1 || !Number.isSafeInteger(m.progress)
      || Number(m.progress) < 0 || Number(m.progress) > Number(m.target) || !Number.isSafeInteger(m.rewardXp) || Number(m.rewardXp) < 1
      || typeof m.completed !== "boolean" || m.completed !== (m.progress === m.target)
      || (m.completed ? typeof m.completedAt !== "string" || !Number.isFinite(Date.parse(m.completedAt)) : m.completedAt !== null)) throw new Error("Invalid weekly mission");
    return {key:m.key,target:m.target,progress:m.progress,rewardXp:m.rewardXp,completed:m.completed,completedAt:m.completedAt};
  });
  return {catalogVersion:data.catalogVersion,weekStart:data.weekStart,nextResetAt:data.nextResetAt,missions} as WeeklySnapshot;
}
