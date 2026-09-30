"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import type { Session } from "@supabase/supabase-js";
import { getSupabaseClient } from "@/lib/supabaseClient";
import { getMyProgression, getMyRecentXpEvents, type RecentXpEvent } from "@/lib/progression/queries";
import type { ProgressionSummary } from "@/lib/progression/formulaV1";
import { PROGRESSION_CHANGED_EVENT } from "@/lib/progression/events";

type Snapshot = {
  status: "loading" | "signed-out" | "ready" | "error";
  userId: string | null;
  summary: ProgressionSummary | null;
  error: string | null;
  recentEvents: RecentXpEvent[];
  recentError: boolean;
};
const initial: Snapshot = {status:"loading",userId:null,summary:null,error:null,recentEvents:[],recentError:false};
type ProgressionContextValue = Snapshot & { loading: boolean; signedOut: boolean; refresh: () => void };
const Context = createContext<ProgressionContextValue | null>(null);

export function useProgression() {
  const context = useContext(Context);
  if (!context) throw new Error("ProgressionProvider is missing");
  return context;
}

export function ProgressionProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [snapshot, setSnapshot] = useState<Snapshot>(initial);
  const sessionRef = useRef<Session | null>(null);
  const epochRef = useRef(0);
  const inFlightRef = useRef(false);
  const rerunRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryAuthRef = useRef<(() => void) | null>(null);

  const load = useCallback(async () => {
    const client = getSupabaseClient();
    const userId = sessionRef.current?.user.id;
    if (!client || !userId) return;
    if (inFlightRef.current) { rerunRef.current = true; return; }
    inFlightRef.current = true;
    const epoch = epochRef.current;
    try {
      const [progression, recent] = await Promise.allSettled([getMyProgression(client), getMyRecentXpEvents(client)]);
      if (epoch !== epochRef.current) return;
      if (progression.status === "rejected") throw progression.reason;
      setSnapshot({status:"ready",userId,summary:progression.value,error:null,
        recentEvents:recent.status === "fulfilled" ? recent.value : [],recentError:recent.status === "rejected"});
    } catch {
      if (epoch === epochRef.current) setSnapshot({...initial,status:"error",userId,error:"Impossible de charger ta progression. Réessaie."});
    } finally {
      if (epoch === epochRef.current) {
        inFlightRef.current = false;
        if (rerunRef.current) { rerunRef.current = false; void load(); }
      }
    }
  }, []);
  const refresh = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      if (!sessionRef.current && retryAuthRef.current) retryAuthRef.current();
      else void load();
    }, 150);
  }, [load]);

  useEffect(() => {
    const client = getSupabaseClient();
    if (!client) { setSnapshot({...initial,status:"signed-out"}); return; }
    let cancelled = false;
    let authSeen = false;
    const change = (next: Session | null) => {
      if (cancelled) return;
      if (sessionRef.current?.user.id === next?.user.id && next) { sessionRef.current = next; return; }
      epochRef.current += 1;
      sessionRef.current = next;
      inFlightRef.current = false;
      rerunRef.current = false;
      setSnapshot({...initial,status:next ? "loading" : "signed-out",userId:next?.user.id ?? null});
      if (next) refresh();
    };
    const {data:{subscription}} = client.auth.onAuthStateChange((_event, next) => {authSeen = true; change(next);});
    const resolveSession = (initialRead = false) => {
      const epoch = epochRef.current;
      void client.auth.getSession().then(({data,error}) => {
        if (cancelled || epoch !== epochRef.current || (initialRead && authSeen)) return;
        if (error) {
          retryAuthRef.current = () => resolveSession();
          setSnapshot({...initial,status:"error",error:"Impossible de vérifier ta connexion."});
        } else {
          retryAuthRef.current = null;
          change(data.session);
        }
      }).catch(() => {
        if (!cancelled && epoch === epochRef.current && !(initialRead && authSeen)) {
          retryAuthRef.current = () => resolveSession();
          setSnapshot({...initial,status:"error",error:"Impossible de vérifier ta connexion."});
        }
      });
    };
    resolveSession(true);
    return () => {
      cancelled = true;
      epochRef.current += 1;
      subscription.unsubscribe();
      retryAuthRef.current = null;
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [refresh]);
  useEffect(() => { refresh(); }, [pathname, refresh]);
  useEffect(() => {
    const visible = () => { if (!document.hidden) refresh(); };
    window.addEventListener(PROGRESSION_CHANGED_EVENT, refresh);
    window.addEventListener("focus", visible);
    window.addEventListener("online", visible);
    document.addEventListener("visibilitychange", visible);
    return () => {
      window.removeEventListener(PROGRESSION_CHANGED_EVENT, refresh);
      window.removeEventListener("focus", visible);
      window.removeEventListener("online", visible);
      document.removeEventListener("visibilitychange", visible);
    };
  }, [refresh]);
  return <Context.Provider value={{...snapshot,loading:snapshot.status === "loading",signedOut:snapshot.status === "signed-out",refresh}}>{children}</Context.Provider>;
}
