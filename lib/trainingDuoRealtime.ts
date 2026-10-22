import type { SupabaseClient } from "@supabase/supabase-js";

export function subscribeToTrainingDuoRealtime(supabase: SupabaseClient, sessionId: string, refresh: () => void | Promise<void>, onStatus?: (status: string, error?: Error) => void) {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let active = true;
  const invalidate = () => {
    if (!active || timer !== null) return;
    timer = setTimeout(() => { timer = null; void refresh(); }, 50);
  };
  const ready = new Set<string>();
  // Independent bindings match the existing real-DB security tests. In
  // particular, participant presence must not depend on a session-row change.
  const channels = [
    { table: "training_duo_sessions", filter: `id=eq.${sessionId}` },
    { table: "training_duo_participants", filter: `session_id=eq.${sessionId}` },
  ].map(({ table, filter }) => supabase.channel(`training-duo:${sessionId}:${table}`)
    .on("postgres_changes", { event: "*", schema: "public", table, filter }, invalidate)
    .subscribe((status, error) => {
      if (!active) return;
      if (status === "SUBSCRIBED") { ready.add(table); if (ready.size === 2) onStatus?.(status); }
      else { ready.delete(table); onStatus?.(status, error); }
    }));
  return () => {
    if (timer !== null) clearTimeout(timer);
    active = false;
    channels.forEach((channel) => { void supabase.removeChannel(channel); });
  };
}
