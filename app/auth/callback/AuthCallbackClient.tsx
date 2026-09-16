"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { loginPath, safeNextPath } from "@/lib/authRedirect";
import { ensureProfile } from "@/lib/profiles";
import { getSupabaseClient } from "@/lib/supabaseClient";
import { AppPage, AppSurface, appPrimaryActionClass } from "@/components/ui/AppShell";

export default function AuthCallbackClient() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function finish() {
      const client = getSupabaseClient();
      const url = new URL(window.location.href);
      const next = safeNextPath(url.searchParams.get("next"));
      if (!client) { setError("Supabase est indisponible."); return; }
      if (url.searchParams.get("error")) { setError("Le lien de confirmation est invalide ou expiré."); return; }
      try {
        const code = url.searchParams.get("code");
        let { data, error: sessionError } = await client.auth.getSession();
        if (!data.session && code) {
          const { error: exchangeError } = await client.auth.exchangeCodeForSession(code);
          if (exchangeError) throw exchangeError;
          ({ data, error: sessionError } = await client.auth.getSession());
        }
        if (sessionError || !data.session) throw sessionError ?? new Error("No session");
        const username = await ensureProfile(client, data.session.user);
        if (!cancelled) router.replace(username ? next : "/profile");
      } catch {
        if (!cancelled) setError("Confirmation impossible. Réessaie depuis le lien reçu par email.");
      }
    }
    finish();
    return () => { cancelled = true; };
  }, [router]);

  return <AppPage width="narrow"><AppSurface className="p-6 sm:p-8">
    <h1 className="text-2xl font-black text-stone-50">Confirmation du compte</h1>
    <p className="mt-3 text-sm text-stone-300" role={error ? "alert" : undefined}>{error ?? "Connexion en cours…"}</p>
    {error ? <Link className={`${appPrimaryActionClass} mt-5`} href={loginPath("/")}>Retour à la connexion</Link> : null}
  </AppSurface></AppPage>;
}
