"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { detectMobileDevice, isStandaloneDisplayMode, type MobileEnvironment } from "@/lib/pwa/environment";
import { completeAuthCallback } from "@/lib/authCallback";
import { getSupabaseClient } from "@/lib/supabaseClient";
import { InstallRequiredScreen } from "./InstallRequiredScreen";
import { appPrimaryActionClass } from "@/components/ui/AppShell";

type State = { environment: MobileEnvironment; standalone: boolean } | null;

/** Only this technical flow may run outside the gate, without application providers. */
function MobileAuthCompletion() {
  const router = useRouter();
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let cancelled = false;
    const client = getSupabaseClient();
    if (!client) { setFailed(true); return; }
    completeAuthCallback(client, new URL(window.location.href))
      .then((destination) => { if (!cancelled) router.replace(destination); })
      .catch(() => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; };
  }, [router]);
  return failed ? <p className="pwa-callback-status" role="alert">Connexion impossible. Ouvre KFFR depuis son icône pour réessayer la connexion.</p> : <p className="pwa-callback-status" role="status">Finalisation de la connexion…</p>;
}

async function connectionAvailable(): Promise<boolean> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 6000);
  try {
    const response = await fetch("/api/pwa/connectivity", { cache: "no-store", credentials: "omit", signal: controller.signal });
    return response.ok;
  } catch { return false; }
  finally { window.clearTimeout(timeout); }
}

export function MobileInstallGate({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [state, setState] = useState<State>(null);
  const [offline, setOffline] = useState(false);
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    const media = window.matchMedia("(display-mode: standalone)");
    const update = () => {
      const standalone = isStandaloneDisplayMode(navigator, media.matches);
      if (standalone && !navigator.onLine) setChecking(true);
      else if (!standalone) setChecking(false);
      setState({ environment: detectMobileDevice(navigator), standalone });
    };
    update();
    media.addEventListener("change", update);
    window.addEventListener("pageshow", update);
    return () => { media.removeEventListener("change", update); window.removeEventListener("pageshow", update); };
  }, []);

  useEffect(() => {
    // Register once outside business providers; only the static offline document is cached.
    if ("serviceWorker" in navigator && window.isSecureContext) {
      void navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" }).catch(() => undefined);
    }
  }, []);

  useEffect(() => {
    if (!state?.standalone) return;
    let cancelled = false;
    let generation = 0;
    const check = async () => {
      const current = ++generation;
      const connected = await connectionAvailable();
      if (!cancelled && current === generation) { setOffline(!connected); setChecking(false); }
    };
    const onOffline = () => { void check(); };
    const onOnline = () => { void check(); };
    void check();
    window.addEventListener("offline", onOffline);
    window.addEventListener("online", onOnline);
    window.addEventListener("pageshow", onOnline);
    return () => {
      cancelled = true;
      window.removeEventListener("offline", onOffline);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("pageshow", onOnline);
    };
  }, [state?.standalone]);

  if (!state) return <main className="coinche-fullscreen-safe pwa-detecting" aria-label="Chargement de KFFR"><span>KFFR</span></main>;
  if (state.environment.phone && !state.standalone) return <>
    <InstallRequiredScreen environment={state.environment} />
    {pathname === "/auth/callback" ? <MobileAuthCompletion /> : null}
  </>;
  if (checking && !offline) return <main className="coinche-fullscreen-safe pwa-detecting" aria-label="Vérification de la connexion"><span>KFFR</span></main>;
  if (state.standalone && offline) return <main className="coinche-fullscreen-safe pwa-screen">
    <section className="pwa-card pwa-offline"><h1>Connexion nécessaire</h1><p>KFFR a besoin d’une connexion Internet pour fonctionner.</p>
      <button className={appPrimaryActionClass} disabled={checking} onClick={async () => {
        setChecking(true);
        const connected = await connectionAvailable();
        setChecking(false);
        if (connected) window.location.reload();
      }} type="button">{checking ? "Vérification…" : "Réessayer"}</button>
    </section>
  </main>;
  return children;
}
