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
      <span className="hidden max-w-[220px] truncate text-stone-700 sm:inline">
        {isReady ? label : "Session..."}
      </span>
      <Link
        className="rounded-md border border-emerald-800 bg-white px-3 py-1.5 text-emerald-900 shadow-sm transition hover:bg-emerald-50"
        href="/login"
      >
        {session ? "Compte" : "Se connecter"}
      </Link>
    </div>
  );
}
