"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import type { MobileEnvironment } from "@/lib/pwa/environment";
import { appPrimaryActionClass } from "@/components/ui/AppShell";

interface InstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export function InstallRequiredScreen({ environment }: { environment: MobileEnvironment }) {
  const deferred = useRef<InstallPromptEvent | null>(null);
  const [available, setAvailable] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  useEffect(() => {
    const beforeInstall = (event: Event) => {
      if (environment.platform !== "android") return;
      event.preventDefault();
      deferred.current = event as InstallPromptEvent;
      setAvailable(true);
    };
    const installed = () => {
      deferred.current = null;
      setAvailable(false);
      setStatus("KFFR est installé. Ouvre maintenant l’application depuis ton écran d’accueil.");
    };
    window.addEventListener("beforeinstallprompt", beforeInstall);
    window.addEventListener("appinstalled", installed);
    return () => {
      window.removeEventListener("beforeinstallprompt", beforeInstall);
      window.removeEventListener("appinstalled", installed);
      deferred.current = null;
    };
  }, [environment.platform]);

  async function install() {
    const event = deferred.current;
    if (!event || busy) return;
    deferred.current = null;
    setAvailable(false);
    setBusy(true);
    try {
      await event.prompt();
      const choice = await event.userChoice;
      setStatus(choice.outcome === "accepted"
        ? "Ouvre KFFR depuis son icône une fois l’installation terminée."
        : "L’installation est nécessaire pour utiliser KFFR sur téléphone.");
    } catch {
      setStatus("Utilise le menu de ton navigateur pour installer KFFR.");
    } finally { setBusy(false); }
  }

  return <main className="coinche-fullscreen-safe pwa-screen" aria-labelledby="install-title">
    <section className="pwa-card">
      <div className="pwa-intro">
        <Image src="/pwa/icon-192.png" alt="KFFR" width={80} height={80} priority />
        <h1 id="install-title">Installer KFFR pour continuer</h1>
        <p>KFFR s’utilise comme une application sur téléphone. L’installation permet notamment de jouer en plein écran sans la barre Safari.</p>
      </div>
      <div className="pwa-instructions">
        {environment.platform === "ios" ? <>
          {!environment.safari ? <p className="pwa-highlight">Ouvre cette page dans Safari pour installer KFFR.</p> : null}
          <ol>
            <li>Appuie sur le bouton Partager de Safari.</li>
            <li>Choisis « Sur l’écran d’accueil ».</li>
            <li>Appuie sur « Ajouter ».</li>
            <li>Ouvre ensuite KFFR depuis son icône.</li>
          </ol>
        </> : <>
          {available ? <button className={appPrimaryActionClass} disabled={busy} onClick={() => void install()} type="button">Installer KFFR</button> : null}
          <p>Dans le menu de ton navigateur, choisis « Installer l’application » ou « Ajouter à l’écran d’accueil », puis ouvre KFFR depuis son icône.</p>
        </>}
        <p className="pwa-reminder">KFFR est peut-être déjà installé. Ouvre-le depuis ton écran d’accueil.</p>
        <p role="status" aria-live="polite">{status}</p>
      </div>
    </section>
  </main>;
}
