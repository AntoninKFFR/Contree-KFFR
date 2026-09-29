"use client";

import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { touchSocialPresence } from "@/lib/socialApi";
import { getSupabaseClient } from "@/lib/supabaseClient";

export function SocialPresenceHeartbeat() {
  const [session, setSession] = useState<Session | null>(null);

  useEffect(() => {
    const client = getSupabaseClient();
    if (!client) return;
    let active = true;
    void client.auth.getSession().then(({ data }) => { if (active) setSession(data.session); });
    const { data: { subscription } } = client.auth.onAuthStateChange((_event, next) => setSession(next));
    return () => { active = false; subscription.unsubscribe(); };
  }, []);

  useEffect(() => {
    if (!session) return;
    const heartbeat = () => {
      if (document.visibilityState !== "visible" || !navigator.onLine) return;
      void touchSocialPresence(session).catch(() => { /* Retry on the next activity or interval. */ });
    };
    heartbeat();
    const interval = window.setInterval(heartbeat, 30_000);
    window.addEventListener("focus", heartbeat);
    window.addEventListener("online", heartbeat);
    document.addEventListener("visibilitychange", heartbeat);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", heartbeat);
      window.removeEventListener("online", heartbeat);
      document.removeEventListener("visibilitychange", heartbeat);
    };
  }, [session]);

  return null;
}
