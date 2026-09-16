"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { getSupabaseClient } from "@/lib/supabaseClient";
import { IconCloseButton } from "@/components/ui/IconCloseButton";
import { TopBarChrome } from "@/components/ui/TopBarChrome";

export type GameMenuAction = {
  label: string;
  onSelect: () => void;
  disabled?: boolean;
  tone?: "default" | "danger";
};

type GameTopBarProps = {
  contextLabel: string;
  focusMode: boolean;
  menuActions?: GameMenuAction[];
  onOpenPreferences: () => void;
  onToggleFocusMode: () => void;
  preferencesLabel?: "Paramètres" | "Préférences";
  showFocusMode?: boolean;
};

const NAV_LINKS = [
  ["/", "Accueil"],
  ["/solo", "Jouer en solo"],
  ["/multiplayer", "Multijoueur"],
  ["/rules", "Règles"],
  ["/profile", "Profil"],
] as const;

export function GameTopBar({
  contextLabel,
  focusMode,
  menuActions = [],
  onOpenPreferences,
  onToggleFocusMode,
  preferencesLabel = "Préférences",
  showFocusMode = true,
}: GameTopBarProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const drawerRef = useRef<HTMLElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, next) => setSession(next));
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    const opener = menuButtonRef.current;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeButtonRef.current?.focus();
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsOpen(false);
      if (event.key !== "Tab" || !drawerRef.current) return;
      const focusable = [...drawerRef.current.querySelectorAll<HTMLElement>("button:not([disabled]), a[href], [tabindex]:not([tabindex='-1'])")];
      const first = focusable[0];
      const last = focusable.at(-1);
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", closeOnEscape);
      opener?.focus();
    };
  }, [isOpen]);

  async function signOut() {
    await getSupabaseClient()?.auth.signOut();
    setIsOpen(false);
  }

  const run = (action: () => void) => {
    setIsOpen(false);
    action();
  };

  return <>
    <TopBarChrome contextLabel={contextLabel} menuButtonRef={menuButtonRef} menuId="game-menu-drawer" menuLabel="Ouvrir le menu de partie" menuOpen={isOpen} onOpenMenu={() => setIsOpen(true)} />

    <button aria-label="Fermer le menu de partie" className={`fixed inset-0 z-[70] bg-black/55 transition-opacity ${isOpen ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0"}`} onClick={() => setIsOpen(false)} tabIndex={isOpen ? 0 : -1} type="button" />
    <aside aria-hidden={!isOpen} aria-label="Menu de partie" className={`coinche-app-drawer fixed right-0 top-0 z-[80] flex h-dvh w-[min(360px,92vw)] flex-col border-l shadow-2xl transition-transform duration-200 ${isOpen ? "translate-x-0" : "translate-x-full"}`} id="game-menu-drawer" inert={!isOpen} ref={drawerRef}>
      <div className="flex items-center justify-between border-b border-white/10 px-5 py-4"><div><p className="coinche-game-nav-kicker text-[10px] font-bold uppercase tracking-[0.2em]">Partie</p><p className="font-bold text-[#f3ead2]">{contextLabel}</p></div><IconCloseButton label="Fermer le menu" onClick={() => setIsOpen(false)} ref={closeButtonRef} /></div>
      <div className="flex-1 overflow-y-auto p-4">
        <p className="coinche-nav-section-label mb-2 px-1 text-[10px] font-bold uppercase tracking-[0.18em]">Affichage</p>
        <div className="grid gap-2">
          {showFocusMode ? <button aria-checked={!focusMode} className="coinche-drawer-action flex items-center justify-between gap-4" onClick={() => run(onToggleFocusMode)} role="switch" type="button"><span>Scores en direct</span><span aria-hidden="true" className={`relative h-6 w-11 shrink-0 rounded-full shadow-inner transition ${focusMode ? "bg-white/15" : "bg-emerald-600"}`}><span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${focusMode ? "left-0.5" : "left-0.5 translate-x-5"}`} /></span></button> : null}
          <button className="coinche-drawer-action" onClick={() => run(onOpenPreferences)} type="button">{preferencesLabel}</button>
        </div>
        {menuActions.filter((action) => action.tone !== "danger").length ? <><p className="coinche-nav-section-label mb-2 mt-6 px-1 text-[10px] font-bold uppercase tracking-[0.18em]">Actions</p><div className="grid gap-2">{menuActions.filter((action) => action.tone !== "danger").map((action) => <button className="coinche-drawer-action" disabled={action.disabled} key={action.label} onClick={() => run(action.onSelect)} type="button">{action.label}</button>)}</div></> : null}
        <p className="coinche-nav-section-label mb-2 mt-6 px-1 text-[10px] font-bold uppercase tracking-[0.18em]">Navigation</p>
        <nav className="grid gap-1">{NAV_LINKS.map(([href, label]) => <Link className="coinche-game-nav-link rounded-xl px-3 py-2.5 text-sm font-semibold transition" href={href} key={href} onClick={() => setIsOpen(false)}>{label}</Link>)}</nav>
      </div>
      <div className="space-y-2 border-t border-white/10 p-4">
        {menuActions.filter((action) => action.tone === "danger").map((action) => <button className="w-full rounded-xl border border-red-400/25 bg-red-950/30 px-4 py-3 text-left text-sm font-bold text-red-200 transition hover:bg-red-900/40 disabled:opacity-40" disabled={action.disabled} key={action.label} onClick={() => run(action.onSelect)} type="button">{action.label}</button>)}
        {session ? <button className="coinche-drawer-action" onClick={() => void signOut()} type="button">Déconnexion</button> : <Link className="coinche-drawer-action block" href="/login" onClick={() => setIsOpen(false)}>Connexion</Link>}
      </div>
    </aside>
  </>;
}
