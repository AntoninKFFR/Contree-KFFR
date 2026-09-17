"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { loginPath, safeNextPath } from "@/lib/authRedirect";
import { completeAuthCallback } from "@/lib/authCallback";
import { getSupabaseClient } from "@/lib/supabaseClient";
import { AppPage, AppSurface, appPrimaryActionClass } from "@/components/ui/AppShell";

export default function AuthCallbackClient() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [returnToLogin, setReturnToLogin] = useState(loginPath("/"));

  useEffect(() => {
    let cancelled = false;
    async function finish() {
      const client = getSupabaseClient();
      const url = new URL(window.location.href);
      setReturnToLogin(loginPath(safeNextPath(url.searchParams.get("next"))));
      if (!client) { setError("Supabase est indisponible."); return; }
      try {
        const destination = await completeAuthCallback(client, url);
        if (!cancelled) router.replace(destination);
      } catch {
        if (!cancelled) setError("Connexion impossible. Réessaie.");
      }
    }
    finish();
    return () => { cancelled = true; };
  }, [router]);

  return <AppPage width="narrow"><AppSurface className="p-6 sm:p-8">
    <h1 className="text-2xl font-black text-stone-50">Connexion en cours</h1>
    <p className="mt-3 text-sm text-stone-300" role={error ? "alert" : undefined}>{error ?? "Finalisation de la connexion…"}</p>
    {error ? <Link className={`${appPrimaryActionClass} mt-5`} href={returnToLogin}>Retour à la connexion</Link> : null}
  </AppSurface></AppPage>;
}
