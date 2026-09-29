"use client";

import { useEffect, useRef, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { fetchFriendPresence } from "@/lib/socialApi";
import { SOCIAL_CHANGED_EVENT } from "@/lib/socialEvents";

export function useFriendPresence(session: Session | null): ReadonlySet<string> {
  const [onlineIds, setOnlineIds] = useState<ReadonlySet<string>>(new Set());
  const pendingRef = useRef<ReadonlySet<string> | null>(null);

  useEffect(() => {
    let active = true;
    let sequence = 0;
    pendingRef.current = null;
    setOnlineIds(new Set());
    if (!session) return () => { active = false; };
    const apply = (next: ReadonlySet<string>) => {
      // Moving a row between groups unmounts its button. Keep focus while an
      // action is being used, then apply the latest presence on focusout.
      if (document.activeElement?.closest(".friend-presence-row")) pendingRef.current = next;
      else setOnlineIds(next);
    };
    const applyPending = () => {
      if (!pendingRef.current) return;
      const next = pendingRef.current;
      pendingRef.current = null;
      window.setTimeout(() => {
        if (!active) return;
        if (document.activeElement?.closest(".friend-presence-row")) pendingRef.current = next;
        else setOnlineIds(next);
      }, 0);
    };
    const refresh = () => {
      if (document.visibilityState !== "visible" || !navigator.onLine) return;
      const current = ++sequence;
      void fetchFriendPresence(session).then((next) => {
        if (active && current === sequence) apply(next);
      }).catch(() => { if (active && current === sequence) apply(new Set()); });
    };
    refresh();
    const interval = window.setInterval(refresh, 30_000);
    window.addEventListener("focus", refresh);
    window.addEventListener("online", refresh);
    window.addEventListener(SOCIAL_CHANGED_EVENT, refresh);
    document.addEventListener("visibilitychange", refresh);
    document.addEventListener("focusout", applyPending);
    return () => {
      active = false;
      window.clearInterval(interval);
      window.removeEventListener("focus", refresh);
      window.removeEventListener("online", refresh);
      window.removeEventListener(SOCIAL_CHANGED_EVENT, refresh);
      document.removeEventListener("visibilitychange", refresh);
      document.removeEventListener("focusout", applyPending);
    };
  }, [session]);

  return onlineIds;
}
