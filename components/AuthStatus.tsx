"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { getSupabaseClient } from "@/lib/supabaseClient";
import { ensureProfile, getProfileUsername, PROFILE_CHANGED_EVENT } from "@/lib/profiles";

export function AuthStatus() {
  const [session, setSession] = useState<Session | null>(null);
  const [username, setUsername] = useState<string | null>(null);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    const supabase = getSupabaseClient();

    if (!supabase) {
      setIsReady(true);
      return;
    }

    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setIsReady(true);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setIsReady(true);
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    const supabase = getSupabaseClient();

    if (!supabase || !session) {
      setUsername(null);
      return;
    }

    ensureProfile(supabase, session.user).then(setUsername);
  }, [session]);

  useEffect(() => {
    const supabase = getSupabaseClient();
    if (!supabase || !session) return;
    const refresh = () => { getProfileUsername(supabase, session.user.id).then(setUsername); };
    window.addEventListener(PROFILE_CHANGED_EVENT, refresh);
    return () => window.removeEventListener(PROFILE_CHANGED_EVENT, refresh);
  }, [session]);

  const label = session
    ? `Connecté : ${username ?? "profil sans pseudo"}`
    : "Non connecté";

  return (
    <div className="flex items-center gap-2 text-xs font-semibold">
      <span className="hidden max-w-[220px] truncate text-[var(--text-secondary)] sm:inline">
        {isReady ? label : "Session..."}
      </span>
      <Link
        className="coinche-secondary-action rounded-md border px-3 py-1.5 shadow-sm transition"
        href={session ? "/profile" : "/login"}
      >
        {session ? "Profil" : "Se connecter"}
      </Link>
    </div>
  );
}
