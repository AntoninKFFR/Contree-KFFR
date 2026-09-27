import type { SupabaseClient } from "@supabase/supabase-js";

export function subscribeToTrainingDuoRealtime(supabase: SupabaseClient, sessionId: string, refresh: () => void | Promise<void>) {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const invalidate = () => {
    if (timer !== null) return;
    timer = setTimeout(() => { timer = null; void refresh(); }, 50);
  };
  const channel = supabase.channel(`training-duo:${sessionId}`)
    .on("postgres_changes", { event: "*", schema: "public", table: "training_duo_sessions", filter: `id=eq.${sessionId}` }, invalidate)
    .on("postgres_changes", { event: "*", schema: "public", table: "training_duo_participants", filter: `session_id=eq.${sessionId}` }, invalidate)
    .subscribe();
  return () => {
    if (timer !== null) clearTimeout(timer);
    void supabase.removeChannel(channel);
  };
}
