"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { getSupabaseClient } from "@/lib/supabaseClient";
import { IconCloseButton } from "@/components/ui/IconCloseButton";
import { ThemeToggle } from "@/components/ui/ThemeToggle";

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
  const drawerRef = useRef<HTMLElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);

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
    if (!isOpen) return;

    const previousOverflow = document.body.style.overflow;
    const menuButton = menuButtonRef.current;
    document.body.style.overflow = "hidden";
    closeButtonRef.current?.focus();

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsOpen(false);
        return;
      }

      if (event.key !== "Tab" || !drawerRef.current) return;

      const focusable = Array.from(
        drawerRef.current.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      );
      const first = focusable[0];
      const last = focusable.at(-1);

      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
      menuButton?.focus();
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

  const isGameRoute = pathname === "/solo" || /^\/multiplayer\/[^/]+$/.test(pathname ?? "");
  if (isGameRoute) return null;

  return (
    <>
      <header className="coinche-global-header sticky top-0 z-40 border-b shadow-[0_10px_30px_var(--shadow)] backdrop-blur-xl">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4 sm:px-5">
          <Link className="flex items-center gap-2.5 text-sm font-bold tracking-[0.08em] text-stone-50" href="/">
            <span className="coinche-brand-mark grid h-8 w-8 place-items-center rounded-full border text-sm shadow-inner">
              ♣
            </span>
            Contrée KFFR
          </Link>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <button
              aria-controls="app-drawer-nav"
              aria-expanded={isOpen}
              aria-label="Ouvrir le menu"
              className="coinche-icon-button inline-flex h-10 w-10 items-center justify-center rounded-xl border text-lg font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-200"
              onClick={() => setIsOpen(true)}
              ref={menuButtonRef}
              type="button"
            >
              ☰
            </button>
          </div>
        </div>
      </header>

      <div
        aria-hidden={!isOpen}
        className={[
          "fixed inset-0 z-40 bg-black/60 backdrop-blur-sm transition-opacity duration-200",
          isOpen ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0",
        ].join(" ")}
        onClick={() => setIsOpen(false)}
      />

      <aside
        aria-hidden={!isOpen}
        className={[
          "coinche-app-drawer fixed right-0 top-0 z-50 flex h-dvh w-[min(360px,96vw)] flex-col border-l shadow-[-20px_0_60px_var(--shadow)] transition-transform duration-200 ease-out sm:w-[min(320px,88vw)]",
          isOpen ? "translate-x-0" : "translate-x-full",
        ].join(" ")}
        id="app-drawer-nav"
        inert={!isOpen}
        ref={drawerRef}
      >
        <div className="flex items-center justify-between border-b border-white/10 px-5 py-5">
          <div>
            <p className="coinche-nav-kicker text-[0.68rem] font-semibold uppercase tracking-[0.2em]">
              Navigation
            </p>
            <p className="mt-1 text-lg font-bold text-stone-50">Contrée KFFR</p>
          </div>
          <IconCloseButton
            label="Fermer le menu"
            onClick={() => setIsOpen(false)}
            ref={closeButtonRef}
          />
        </div>

        <nav className="flex flex-1 flex-col gap-2 px-4 py-5">
          {NAV_LINKS.map((link) => {
            const isActive =
              pathname === link.href ||
              (link.href !== "/" && pathname?.startsWith(`${link.href}/`));

            return (
              <Link
                className={[
                  "coinche-nav-link rounded-xl border px-4 py-3 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]",
                  isActive ? "coinche-nav-link--active" : "",
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

        <div className="border-t border-white/10 bg-black/10 px-4 py-4">
          {session ? (
            <button
              className="w-full rounded-xl border border-white/10 bg-white/[0.05] px-4 py-3 text-left text-sm font-semibold text-stone-200 transition hover:bg-white/[0.1]"
              onClick={handleSignOut}
              type="button"
            >
              Déconnexion
            </button>
          ) : (
            <Link
              className="coinche-login-link block rounded-xl border px-4 py-3 text-sm font-semibold transition"
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
