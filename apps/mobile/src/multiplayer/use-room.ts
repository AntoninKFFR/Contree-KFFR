import { useCallback, useLayoutEffect, useRef, useState } from "react";
import { AppState } from "react-native";
import { useFocusEffect } from "expo-router";
import { useAccount } from "@/auth/AccountProvider";
import { supabase } from "@/lib/supabase";
import { soloEnvironment } from "@/solo/environment";
import { createRoomApi } from "./api";
import { createRoomController, initialRoomState, type RoomState } from "./controller";
import { startRoomLifecycle } from "./lifecycle";

export function useRoom(id: string | null) {
  const account = useAccount(), ref = useRef(account);
  useLayoutEffect(() => { ref.current = account; }, [account]);
  const owner = account.session?.user.id, token = account.session?.access_token;
  const [binding, setBinding] = useState<{ id: string; owner: string; token: string; controller: ReturnType<typeof createRoomController>; state: RoomState } | null>(null);
  useFocusEffect(useCallback(() => {
    if (!id || !owner || !token) return;
    let live = true, stop: (() => void) | null = null, unsubscribe: (() => void) | null = null;
    const controller = createRoomController({ id, owner, identity: () => ref.current.session, api: createRoomApi(soloEnvironment.fetcher),
      unauthorized: () => ref.current.reload(), onChange: (state) => { if (live) setBinding({ id, owner, token, controller, state }); } });
    function suspend() { stop?.(); stop = null; unsubscribe?.(); unsubscribe = null; controller.suspend(); }
    function resume() {
      if (!live || stop) return;
      void controller.resume(); stop = startRoomLifecycle(controller);
      if (supabase) {
        let debounce: ReturnType<typeof setTimeout> | null = null;
        const refresh = () => { if (debounce !== null) return; debounce = setTimeout(() => { debounce = null; void controller.load(); }, 50); };
        const channel = supabase.channel(`native-room:${id}`)
          .on("postgres_changes", { event: "*", schema: "public", table: "rooms", filter: `id=eq.${id}` }, refresh)
          .on("postgres_changes", { event: "*", schema: "public", table: "room_players", filter: `room_id=eq.${id}` }, refresh)
          .subscribe((status) => { if (status === "SUBSCRIBED") { controller.invalidate(); refresh(); } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") controller.invalidate(); });
        unsubscribe = () => { if (debounce !== null) clearTimeout(debounce); void supabase?.removeChannel(channel); };
      }
    }
    if (AppState.currentState === "active") resume();
    const listener = AppState.addEventListener("change", (status) => { if (status === "active") resume(); else suspend(); });
    return () => { live = false; listener.remove(); suspend(); controller.dispose(); setBinding(null); };
  }, [id, owner, token]));
  const current = binding?.id === id && binding.owner === owner && binding.token === token ? binding : null;
  return { state: current?.state ?? initialRoomState, controller: current?.controller ?? null };
}
