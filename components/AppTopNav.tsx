"use client";

import Link from "next/link";
import { ProfileIdentity } from "@/components/profile/ProfileCosmetics";
import { useProgression } from "@/components/progression/ProgressionProvider";
import { ProgressionBar, ProgressionLevelBadge } from "@/components/progression/ProgressionCard";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { ensureProfile, getProfileUsername, PROFILE_CHANGED_EVENT } from "@/lib/profiles";
import { getSupabaseClient } from "@/lib/supabaseClient";
import { AudioPopover } from "@/components/ui/AudioPopover";
import { KffrLogo } from "@/components/ui/KffrLogo";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { SocialNotificationTrigger } from "@/components/social/SocialNotifications";
import { MobileNavigationDrawer } from "@/components/navigation/MobileNavigationDrawer";
import { activeNavigationHref, appNavigationItems, isTrainingRoute, matchesNavigationRoute, type NavigationMenu } from "@/lib/ui/appNavigation";

export { appNavigationLinks } from "@/lib/ui/appNavigation";
type Menu = NavigationMenu;

export function AppTopNav({ variant = "default" }: { variant?: "default" | "compact-game" } = {}) {
  const progression = useProgression();
  const pathname = usePathname() ?? "/";
  const [session, setSession] = useState<Session | null>(null);
  const [username, setUsername] = useState<string | null>(null);
  const [openMenu, setOpenMenu] = useState<Menu | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [trainingOpen, setTrainingOpen] = useState(false);
  const [navigationHash, setNavigationHash] = useState("");
  const burgerRef = useRef<HTMLButtonElement>(null);
  const rootRef = useRef<HTMLElement>(null);
  const pinnedMenuRef = useRef<Menu | null>(null);
  const hoverOpenedMenuRef = useRef<Menu | null>(null);

  useEffect(() => {
    pinnedMenuRef.current = null;
    hoverOpenedMenuRef.current = null;
    setOpenMenu(null);
    setMobileOpen(false);
    setNavigationHash(window.location.hash);
  }, [pathname]);
  useEffect(() => {
    const updateHash = () => setNavigationHash(window.location.hash);
    window.addEventListener("hashchange", updateHash);
    return () => window.removeEventListener("hashchange", updateHash);
  }, []);
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
    if (!openMenu) return;
    const close = (event: KeyboardEvent | PointerEvent) => {
      const shouldClose = (event instanceof KeyboardEvent && event.key === "Escape")
        || (event instanceof PointerEvent && !rootRef.current?.contains(event.target as Node));
      if (shouldClose) {
        pinnedMenuRef.current = null;
        hoverOpenedMenuRef.current = null;
        setOpenMenu(null);
      }
    };
    document.addEventListener("keydown", close);
    document.addEventListener("pointerdown", close);
    return () => { document.removeEventListener("keydown", close); document.removeEventListener("pointerdown", close); };
  }, [openMenu]);

  const summary = progression.status === "ready" && progression.userId === session?.user.id ? progression.summary : null;
  const cosmetics = progression.status === "ready" && progression.userId === session?.user.id ? progression.cosmeticsSnapshot:null;
  const items = appNavigationItems(Boolean(session));
  const activeHref = activeNavigationHref(pathname, navigationHash);
  const trainingActive = isTrainingRoute(pathname);
  const linkClass = (href: string) => `coinche-topnav-link ${activeHref === href ? "coinche-topnav-link--active" : ""}`;
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
  const closeNavigation = () => {
    pinnedMenuRef.current = null;
    hoverOpenedMenuRef.current = null;
    setOpenMenu(null);
    setMobileOpen(false);
  };

  const openMobileNavigation = () => {
    // Safari taps do not always focus buttons. The dialog restores this opener.
    burgerRef.current?.focus({ preventScroll: true });
    setNavigationHash(window.location.hash);
    setTrainingOpen(trainingActive);
    setOpenMenu(null);
    setMobileOpen(true);
  };

  // The dialog owns the shared body lock and focus lifecycle, including StrictMode.
  useEffect(() => {
    if (!mobileOpen) return;
    const desktop = window.matchMedia("(min-width: 1120px)");
    const closeOnDesktop = () => {
      if (!desktop.matches) return;
      setMobileOpen(false);
      requestAnimationFrame(() => rootRef.current?.querySelector<HTMLElement>('nav[aria-label="Navigation principale"] a')?.focus({ preventScroll: true }));
    };
    desktop.addEventListener("change", closeOnDesktop);
    return () => {
      desktop.removeEventListener("change", closeOnDesktop);
    };
  }, [mobileOpen]);

  return <header className="coinche-global-header sticky top-0 z-[var(--layer-header)] border-b shadow-lg backdrop-blur-md" data-header-variant={variant} ref={rootRef}>
    <div className="coinche-header-content mx-auto grid w-full max-w-[1600px] grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 min-[1440px]:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]">
      <Link aria-label="Accueil — KFFR Contrée" className="coinche-header-logo col-start-1 shrink-0 justify-self-start" href="/"><KffrLogo className="h-8 w-[5.25rem]" variant="compact" /></Link>
      <nav aria-label="Navigation principale" className="col-start-2 hidden min-w-0 items-center gap-1 justify-self-center min-[1120px]:flex">
        {items.map((item) => item.children ? <div className="relative" key={item.id} onMouseEnter={() => openOnHover(item.id)} onMouseLeave={() => closeOnHoverLeave(item.id)}>
          <button aria-controls={`${item.id}-menu`} aria-current={(item.id === "training" ? trainingActive : item.children.some((child) => matchesNavigationRoute(pathname, child.href))) ? "page" : undefined}
            aria-expanded={openMenu === item.id} className={`coinche-topnav-link ${(item.id === "training" ? trainingActive : item.children.some((child) => activeHref === child.href)) ? "coinche-topnav-link--active" : ""}`} onClick={() => toggleMenu(item.id)} type="button">{`${item.label} `}<span aria-hidden="true">▾</span></button>
          {openMenu === item.id ? <div className="absolute left-0 top-full w-44 pt-2" id={`${item.id}-menu`}>
            <div className="coinche-popover rounded-xl border p-1.5 shadow-2xl">
              {item.children.map((child) => <Link aria-current={activeHref === child.href ? "page" : undefined} className="coinche-dropdown-link" href={child.href} key={child.href} onClick={() => { setNavigationHash(child.href.includes("#") ? `#${child.href.split("#")[1]}` : ""); closeNavigation(); }}>{child.label}</Link>)}
            </div>
          </div> : null}
        </div> : <Link aria-current={activeHref === item.href ? "page" : undefined} className={linkClass(item.href)} href={item.href} key={item.href}>{item.label}</Link>)}
      </nav>
      <div className="coinche-header-controls col-start-3 flex shrink-0 items-center gap-1.5 justify-self-end">
        <div id="app-topnav-game-actions" />
        <SocialNotificationTrigger />
        <AudioPopover />
        <ThemeToggle />
        <div className="hidden min-[1120px]:block">
          {session ? <Link className="coinche-account-link progression-account" href="/profile" title={username ?? "Profil"}>
            <span className="progression-account-line"><ProfileIdentity compact snapshot={cosmetics} name={<span className="progression-account-name">{username ?? "Profil"}</span>}/>
              <span className="progression-account-desktop">{summary ? <ProgressionLevelBadge summary={summary} /> : <span className="progression-account-placeholder" aria-hidden="true" />}</span></span>
            <span className="progression-account-desktop progression-account-track">{summary ? <ProgressionBar mini summary={summary} /> : null}</span>
          </Link> : <Link className="coinche-account-link" href="/login">Se connecter</Link>}
        </div>
        <button aria-controls="mobile-navigation" aria-expanded={mobileOpen} aria-label="Ouvrir le menu" className="coinche-chrome-icon min-[1120px]:hidden" onClick={openMobileNavigation} ref={burgerRef} type="button">☰</button>
      </div>
    </div>
    {mobileOpen ? <MobileNavigationDrawer activeHref={activeHref} currentHref={`${pathname}${navigationHash}`} authenticated={Boolean(session)} cosmetics={cosmetics} onClose={closeNavigation}
      onTrainingToggle={() => setTrainingOpen((value) => !value)} summary={summary} trainingActive={trainingActive} trainingOpen={trainingOpen} username={username} /> : null}
  </header>;
}
