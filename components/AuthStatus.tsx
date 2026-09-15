"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { getSupabaseClient } from "@/lib/supabaseClient";
import { getProfileUsername } from "@/lib/profiles";

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

    getProfileUsername(supabase, session.user.id).then(setUsername);
  }, [session]);

  const label = session
    ? `Connecté: ${username ?? "profil sans pseudo"}`
    : "Non connecté";

  return (
    <div className="flex items-center gap-2 text-xs font-semibold">
      <span className="hidden max-w-[220px] truncate text-[var(--text-secondary)] sm:inline">
        {isReady ? label : "Session..."}
      </span>
      <Link
        className="coinche-secondary-action rounded-md border px-3 py-1.5 shadow-sm transition"
        href="/login"
      >
        {session ? "Compte" : "Se connecter"}
      </Link>
      {session ? (
        <Link
          className="coinche-secondary-action rounded-md border px-3 py-1.5 shadow-sm transition"
          href="/profile"
        >
          Profil
        </Link>
      ) : null}
    </div>
  );
}
