"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { getSupabaseClient } from "@/lib/supabaseClient";
import { ensureProfile, getProfileUsername, PROFILE_CHANGED_EVENT } from "@/lib/profiles";
import { IconCloseButton } from "@/components/ui/IconCloseButton";
import { TopBarChrome } from "@/components/ui/TopBarChrome";

const NAV_LINKS = [
  { href: "/", label: "Accueil" },
  { href: "/solo", label: "Jouer en solo" },
  { href: "/multiplayer", label: "Multijoueur" },
  { href: "/leaderboard", label: "Classement" },
  { href: "/friends", label: "Amis" },
  { href: "/rules", label: "Règles" },
  { href: "/profile", label: "Profil" },
] as const;

export function AppDrawerNav() {
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const [username, setUsername] = useState<string | null>(null);
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
    const supabase = getSupabaseClient();
    if (!supabase || !session) {
      setUsername(null);
      return;
    }
    let cancelled = false;
    ensureProfile(supabase, session.user).then((name) => {
      if (!cancelled) setUsername(name);
    });
    const refresh = () => {
      getProfileUsername(supabase, session.user.id).then((name) => {
        if (!cancelled) setUsername(name);
      });
    };
    window.addEventListener(PROFILE_CHANGED_EVENT, refresh);
    return () => {
      cancelled = true;
      window.removeEventListener(PROFILE_CHANGED_EVENT, refresh);
    };
  }, [session]);

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
  const contextLabel = pathname === "/" ? "Accueil"
    : pathname === "/multiplayer" ? "Multijoueur"
    : pathname === "/leaderboard" ? "Classement"
    : pathname === "/friends" ? "Amis"
    : pathname === "/rules" ? "Règles"
    : pathname === "/profile" ? "Profil"
    : pathname === "/history" ? "Historique"
    : pathname === "/login" ? "Connexion"
    : "Contrée";

  return (
    <>
      <TopBarChrome contextLabel={contextLabel} menuButtonRef={menuButtonRef} menuId="app-drawer-nav" menuLabel="Ouvrir le menu" menuOpen={isOpen} onOpenMenu={() => setIsOpen(true)} />

      <div
        aria-hidden={!isOpen}
        className={[
          "fixed inset-0 z-[70] bg-black/60 backdrop-blur-sm transition-opacity duration-200",
          isOpen ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0",
        ].join(" ")}
        onClick={() => setIsOpen(false)}
      />

      <aside
        aria-hidden={!isOpen}
        className={[
          "coinche-app-drawer fixed right-0 top-0 z-[80] flex h-dvh w-[min(360px,96vw)] flex-col border-l shadow-[-20px_0_60px_var(--shadow)] transition-transform duration-200 ease-out sm:w-[min(320px,88vw)]",
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
          {NAV_LINKS.filter((link) => (link.href !== "/friends" && link.href !== "/leaderboard") || session).map((link) => {
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
            <div className="space-y-2">
              <Link className="coinche-login-link block rounded-xl border px-4 py-3 text-sm font-semibold transition" href="/profile" onClick={() => setIsOpen(false)}>
                {username ?? "Choisir un pseudo"} · Profil
              </Link>
              <button
                className="w-full rounded-xl border border-white/10 bg-white/[0.05] px-4 py-3 text-left text-sm font-semibold text-stone-200 transition hover:bg-white/[0.1]"
                onClick={handleSignOut}
                type="button"
              >
                Déconnexion
              </button>
            </div>
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
