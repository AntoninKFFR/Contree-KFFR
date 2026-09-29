"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { ensureProfile, getProfileUsername, PROFILE_CHANGED_EVENT } from "@/lib/profiles";
import { getSupabaseClient } from "@/lib/supabaseClient";
import { AudioPopover } from "@/components/ui/AudioPopover";
import { KffrLogo } from "@/components/ui/KffrLogo";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { SocialNotificationTrigger } from "@/components/social/SocialNotifications";

const PUBLIC_LINKS = [{ href: "/", label: "Accueil" }, { href: "/training", label: "Entraînement" }, { href: "/rules", label: "Règles" }] as const;
const PRIVATE_LINKS = [{ href: "/leaderboard", label: "Classement" }, { href: "/friends", label: "Amis" }, { href: "/history", label: "Historique" }] as const;
const TRAINING_LINKS = [
  { href: "/training", label: "Vue d’ensemble" },
  { href: "/training#calculer", label: "Calculer" },
  { href: "/training#memoriser", label: "Mémoriser" },
  { href: "/training#deduire", label: "Déduire" },
  { href: "/training#annoncer", label: "Annoncer" },
] as const;
type Menu = "play" | "training";

export function appNavigationLinks(authenticated: boolean) {
  return authenticated ? [PUBLIC_LINKS[0], ...PRIVATE_LINKS, PUBLIC_LINKS[1], PUBLIC_LINKS[2]] : [...PUBLIC_LINKS];
}

function active(pathname: string, href: string) {
  return pathname === href || (href !== "/" && pathname.startsWith(`${href}/`));
}

export function AppTopNav() {
  const pathname = usePathname() ?? "/";
  const [session, setSession] = useState<Session | null>(null);
  const [username, setUsername] = useState<string | null>(null);
  const [openMenu, setOpenMenu] = useState<Menu | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const rootRef = useRef<HTMLElement>(null);
  const pinnedMenuRef = useRef<Menu | null>(null);
  const hoverOpenedMenuRef = useRef<Menu | null>(null);

  useEffect(() => {
    pinnedMenuRef.current = null;
    hoverOpenedMenuRef.current = null;
    setOpenMenu(null);
    setMobileOpen(false);
  }, [pathname]);
  useEffect(() => {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    void supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, next) => setSession(next));
    return () => subscription.unsubscribe();
  }, []);
  useEffect(() => {
    const supabase = getSupabaseClient();
    if (!supabase || !session) { setUsername(null); return; }
    let cancelled = false;
    void ensureProfile(supabase, session.user).then((value) => { if (!cancelled) setUsername(value); });
    const refresh = () => void getProfileUsername(supabase, session.user.id).then((value) => { if (!cancelled) setUsername(value); });
    window.addEventListener(PROFILE_CHANGED_EVENT, refresh);
    return () => { cancelled = true; window.removeEventListener(PROFILE_CHANGED_EVENT, refresh); };
  }, [session]);
  useEffect(() => {
    if (!openMenu && !mobileOpen) return;
    const close = (event: KeyboardEvent | PointerEvent) => {
      const shouldClose = (event instanceof KeyboardEvent && event.key === "Escape")
        || (event instanceof PointerEvent && !rootRef.current?.contains(event.target as Node));
      if (shouldClose) {
        pinnedMenuRef.current = null;
        hoverOpenedMenuRef.current = null;
        setOpenMenu(null);
        setMobileOpen(false);
      }
    };
    document.addEventListener("keydown", close);
    document.addEventListener("pointerdown", close);
    return () => { document.removeEventListener("keydown", close); document.removeEventListener("pointerdown", close); };
  }, [mobileOpen, openMenu]);

  const links = appNavigationLinks(Boolean(session));
  const playActive = pathname === "/solo" || pathname.startsWith("/multiplayer");
  const trainingActive = active(pathname, "/training");
  const linkClass = (href: string) => `coinche-topnav-link ${active(pathname, href) ? "coinche-topnav-link--active" : ""}`;
  const openOnHover = (menu: Menu) => {
    if (pinnedMenuRef.current === menu) return;
    pinnedMenuRef.current = null;
    hoverOpenedMenuRef.current = menu;
    setOpenMenu(menu);
  };
  const closeOnHoverLeave = (menu: Menu) => {
    if (pinnedMenuRef.current === menu || hoverOpenedMenuRef.current !== menu) return;
    hoverOpenedMenuRef.current = null;
    setOpenMenu(null);
  };
  const toggleMenu = (menu: Menu) => {
    if (hoverOpenedMenuRef.current === menu) {
      hoverOpenedMenuRef.current = null;
      pinnedMenuRef.current = menu;
      setOpenMenu(menu);
      return;
    }
    const next = openMenu === menu ? null : menu;
    hoverOpenedMenuRef.current = null;
    pinnedMenuRef.current = next;
    setOpenMenu(next);
  };
  const closeTrainingNavigation = () => {
    pinnedMenuRef.current = null;
    hoverOpenedMenuRef.current = null;
    setOpenMenu(null);
    setMobileOpen(false);
  };

  return <header className="coinche-global-header sticky top-0 z-50 h-14 border-b shadow-lg backdrop-blur-md" ref={rootRef}>
    <div className="mx-auto grid h-full w-full max-w-[1600px] grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3 px-3 sm:px-5">
      <Link aria-label="Accueil — KFFR Contrée" className="col-start-1 shrink-0 justify-self-start" href="/"><KffrLogo className="h-8 w-[5.25rem]" variant="compact" /></Link>
      <nav aria-label="Navigation principale" className="col-start-2 hidden min-w-0 items-center gap-1 justify-self-center min-[1120px]:flex">
        <Link aria-current={pathname === "/" ? "page" : undefined} className={linkClass("/")} href="/">Accueil</Link>
        <div className="relative" onMouseEnter={() => openOnHover("play")} onMouseLeave={() => closeOnHoverLeave("play")}>
          <button aria-controls="play-menu" aria-current={playActive ? "page" : undefined} aria-expanded={openMenu === "play"} className={`coinche-topnav-link ${playActive ? "coinche-topnav-link--active" : ""}`} onClick={() => toggleMenu("play")} type="button">Jouer <span aria-hidden="true">▾</span></button>
          {openMenu === "play" ? <div className="absolute left-0 top-full w-44 pt-2" id="play-menu">
            <div className="coinche-popover rounded-xl border p-1.5 shadow-2xl">
              <Link aria-current={pathname === "/solo" ? "page" : undefined} className="coinche-dropdown-link" href="/solo">Solo</Link>
              <Link aria-current={pathname.startsWith("/multiplayer") ? "page" : undefined} className="coinche-dropdown-link" href="/multiplayer">Multijoueur</Link>
            </div>
          </div> : null}
        </div>
        {links.filter((link) => link.href !== "/").map((link) => link.href === "/training" ? <div className="relative" key={link.href} onMouseEnter={() => openOnHover("training")} onMouseLeave={() => closeOnHoverLeave("training")}>
          <button aria-controls="training-menu" aria-current={trainingActive ? "page" : undefined} aria-expanded={openMenu === "training"} className={`coinche-topnav-link ${trainingActive ? "coinche-topnav-link--active" : ""}`} onClick={() => toggleMenu("training")} type="button">Entraînement <span aria-hidden="true">▾</span></button>
          {openMenu === "training" ? <div className="absolute left-0 top-full w-44 pt-2" id="training-menu">
            <div className="coinche-popover rounded-xl border p-1.5 shadow-2xl">
              {TRAINING_LINKS.map((item) => <Link aria-current={item.href === "/training" && pathname === "/training" ? "page" : undefined} className="coinche-dropdown-link" href={item.href} key={item.href} onClick={closeTrainingNavigation}>{item.label}</Link>)}
            </div>
          </div> : null}
        </div> : <Link aria-current={active(pathname, link.href) ? "page" : undefined} className={linkClass(link.href)} href={link.href} key={link.href}>{link.label}</Link>)}
      </nav>
      <div className="col-start-3 flex shrink-0 items-center gap-1.5 justify-self-end">
        <div id="app-topnav-game-actions" />
        <SocialNotificationTrigger />
        <AudioPopover />
        <ThemeToggle />
        <div className="hidden min-[480px]:block">
          {session ? <Link className="coinche-account-link max-w-28 truncate" href="/profile">{username ?? "Profil"}</Link> : <Link className="coinche-account-link" href="/login">Se connecter</Link>}
        </div>
        <button aria-controls="mobile-navigation" aria-expanded={mobileOpen} aria-label="Ouvrir le menu" className="coinche-chrome-icon min-[1120px]:hidden" onClick={() => setMobileOpen((value) => !value)} type="button">☰</button>
      </div>
    </div>
    {mobileOpen ? <nav aria-label="Navigation mobile" className="coinche-mobile-nav absolute left-0 right-0 top-full max-h-[calc(100dvh-3.5rem)] overflow-y-auto border-b p-3 shadow-2xl min-[1120px]:hidden" id="mobile-navigation">
      <Link aria-current={pathname === "/" ? "page" : undefined} className={linkClass("/")} href="/">Accueil</Link>
      <p className={`coinche-mobile-nav-label ${playActive ? "coinche-topnav-link--active" : ""}`}>Jouer</p>
      <div className="ml-3 grid gap-1 border-l border-[var(--border)] pl-3"><Link className={linkClass("/solo")} href="/solo">Solo</Link><Link className={linkClass("/multiplayer")} href="/multiplayer">Multijoueur</Link></div>
      {links.filter((link) => link.href !== "/").map((link) => link.href === "/training" ? <div key={link.href}>
        <p className={`coinche-mobile-nav-label ${trainingActive ? "coinche-topnav-link--active" : ""}`}>Entraînement</p>
        <div className="ml-3 grid gap-1 border-l border-[var(--border)] pl-3">{TRAINING_LINKS.map((item) => <Link aria-current={item.href === "/training" && pathname === "/training" ? "page" : undefined} className={item.href === "/training" && pathname === "/training" ? "coinche-topnav-link coinche-topnav-link--active" : "coinche-topnav-link"} href={item.href} key={item.href} onClick={closeTrainingNavigation}>{item.label}</Link>)}</div>
      </div> : <Link aria-current={active(pathname, link.href) ? "page" : undefined} className={linkClass(link.href)} href={link.href} key={link.href}>{link.label}</Link>)}
      <div className="min-[480px]:hidden">
        {session ? <Link className={linkClass("/profile")} href="/profile">{username ?? "Profil"}</Link> : <Link className={linkClass("/login")} href="/login">Se connecter</Link>}
      </div>
    </nav> : null}
  </header>;
}
