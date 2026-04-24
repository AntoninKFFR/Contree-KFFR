"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { getSupabaseClient } from "@/lib/supabaseClient";

const NAV_LINKS = [
  { href: "/", label: "Accueil" },
  { href: "/solo", label: "Jouer en solo" },
  { href: "/multiplayer", label: "Multijoueur" },
  { href: "/rules", label: "Règles" },
  { href: "/profile", label: "Profil" },
] as const;

export function AppDrawerNav() {
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);
  const [session, setSession] = useState<Session | null>(null);

  useEffect(() => {
    setIsOpen(false);
  }, [pathname]);

  useEffect(() => {
    const supabase = getSupabaseClient();

    if (!supabase) {
      return;
    }

    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!isOpen) {
      document.body.style.overflow = "";
      return;
    }

    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  async function handleSignOut() {
    const supabase = getSupabaseClient();

    if (!supabase) {
      setIsOpen(false);
      return;
    }

    await supabase.auth.signOut();
    setIsOpen(false);
  }

  return (
    <>
      <header className="sticky top-0 z-40 border-b border-stone-200/80 bg-[#f4f1e8]/95 backdrop-blur-sm">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4 sm:px-5">
          <Link className="text-sm font-bold tracking-[0.08em] text-emerald-950" href="/">
            Contrée KFFR
          </Link>
          <button
            aria-controls="app-drawer-nav"
            aria-expanded={isOpen}
            aria-label="Ouvrir le menu"
            className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-stone-300 bg-white/80 text-lg font-semibold text-stone-900 shadow-sm transition hover:bg-white"
            onClick={() => setIsOpen(true)}
            type="button"
          >
            ☰
          </button>
        </div>
      </header>

      <div
        aria-hidden={!isOpen}
        className={[
          "fixed inset-0 z-40 bg-stone-950/20 transition-opacity duration-200",
          isOpen ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0",
        ].join(" ")}
        onClick={() => setIsOpen(false)}
      />

      <aside
        aria-hidden={!isOpen}
        className={[
          "fixed right-0 top-0 z-50 flex h-dvh w-[min(320px,88vw)] flex-col border-l border-stone-200 bg-[#f8f5ee] shadow-2xl transition-transform duration-200 ease-out",
          isOpen ? "translate-x-0" : "translate-x-full",
        ].join(" ")}
        id="app-drawer-nav"
      >
        <div className="flex items-center justify-between border-b border-stone-200 px-4 py-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-800">
              Navigation
            </p>
            <p className="text-lg font-bold text-stone-950">Contrée KFFR</p>
          </div>
          <button
            aria-label="Fermer le menu"
            className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-stone-300 bg-white text-lg font-semibold text-stone-900 shadow-sm transition hover:bg-stone-50"
            onClick={() => setIsOpen(false)}
            type="button"
          >
            ×
          </button>
        </div>

        <nav className="flex flex-1 flex-col gap-2 px-4 py-4">
          {NAV_LINKS.map((link) => {
            const isActive =
              pathname === link.href ||
              (link.href !== "/" && pathname?.startsWith(`${link.href}/`));

            return (
              <Link
                className={[
                  "rounded-lg border px-4 py-3 text-sm font-semibold transition",
                  isActive
                    ? "border-emerald-300 bg-emerald-50 text-emerald-950"
                    : "border-stone-200 bg-white text-stone-800 hover:bg-stone-50",
                ].join(" ")}
                href={link.href}
                key={link.href}
                onClick={() => setIsOpen(false)}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>

        <div className="border-t border-stone-200 px-4 py-4">
          {session ? (
            <button
              className="w-full rounded-lg border border-stone-300 bg-white px-4 py-3 text-left text-sm font-semibold text-stone-900 transition hover:bg-stone-50"
              onClick={handleSignOut}
              type="button"
            >
              Déconnexion
            </button>
          ) : (
            <Link
              className="block rounded-lg border border-stone-300 bg-white px-4 py-3 text-sm font-semibold text-stone-900 transition hover:bg-stone-50"
              href="/login"
              onClick={() => setIsOpen(false)}
            >
              Connexion
            </Link>
          )}
        </div>
      </aside>
    </>
  );
}
