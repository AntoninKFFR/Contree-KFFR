import { useCallback, useLayoutEffect, useRef, useState } from "react";
import { AppState } from "react-native";
import { useFocusEffect } from "expo-router";
import { useAccount } from "@/auth/AccountProvider";
import { soloEnvironment } from "@/solo/environment";
import { createRoomApi, type RoomApi } from "./api";
import type { SoloIdentity } from "../solo/api";
import { RoomFailure } from "./contract";
export const savedRoomKey = (owner: string) => `kffr.native.multiplayer.room.v1:${owner}`;

/** Landing/social requests share the same cancellation and identity fence. */
export function useMultiplayerService(scope: string | null = null) {
  const account = useAccount(), ref = useRef(account);
  useLayoutEffect(() => { ref.current = account; }, [account]);
  const [api] = useState(() => createRoomApi(soloEnvironment.fetcher));
  const [busy, setBusy] = useState(false), [error, setError] = useState<string | null>(null);
  const epoch = useRef(0), requests = useRef(new Set<AbortController>()), locked = useRef(false), active = useRef(false);
  const owner = account.session?.user.id, token = account.session?.access_token;
  useFocusEffect(useCallback(() => {
    if (!owner || !token) return;
    void scope;
    const stop = () => { active.current = false; epoch.current++; for (const r of requests.current) r.abort(); requests.current.clear(); locked.current = false; setBusy(false); setError(null); };
    active.current = AppState.currentState === "active";
    const listener = AppState.addEventListener("change", (status) => { if (status === "active") active.current = true; else stop(); });
    return () => { listener.remove(); stop(); };
  }, [owner, token, scope]));
  const run = useCallback(async <T,>(fn: (api: RoomApi, who: SoloIdentity, signal: AbortSignal) => Promise<T>, mutation = true): Promise<T | undefined> => {
    const who = ref.current.session;
    if (!active.current || !who || mutation && locked.current) return;
    const generation = epoch.current, controller = new AbortController(); requests.current.add(controller);
    const current = () => active.current && epoch.current === generation && ref.current.session?.access_token === who.access_token && ref.current.session.user.id === who.user.id;
    if (mutation) { locked.current = true; setBusy(true); setError(null); }
    try { const result = await fn(api, who, controller.signal); return current() ? result : undefined; }
    catch (error) { if (current()) { setError(error instanceof Error ? error.message : "Connexion interrompue."); if (error instanceof RoomFailure && error.status === 401) ref.current.reload(); } }
    finally { requests.current.delete(controller); if (mutation && current()) { locked.current = false; setBusy(false); } }
  }, [api]);
  return { run, busy, error, setError, owner, token };
}
