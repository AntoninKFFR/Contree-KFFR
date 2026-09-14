import type { SupabaseClient } from "@supabase/supabase-js";

export function subscribeToRoomRealtime(
  supabase: SupabaseClient,
  roomId: string,
  refresh: () => void | Promise<void>,
): () => void {
  let refreshTimer: ReturnType<typeof setTimeout> | null = null;
  const scheduleRefresh = () => {
    if (refreshTimer !== null) return;
    refreshTimer = setTimeout(() => {
      refreshTimer = null;
      void refresh();
    }, 50);
  };
  const channel = supabase
    .channel(`room-lobby:${roomId}`)
    .on("postgres_changes", {
      event: "*", filter: `id=eq.${roomId}`, schema: "public", table: "rooms",
    }, scheduleRefresh)
    .on("postgres_changes", {
      event: "*", filter: `room_id=eq.${roomId}`, schema: "public", table: "room_players",
    }, scheduleRefresh)
    .subscribe();

  return () => {
    if (refreshTimer !== null) clearTimeout(refreshTimer);
    void supabase.removeChannel(channel);
  };
}
