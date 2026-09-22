"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
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
  const pathname = usePathname() ?? "/";
  const [isOpen, setIsOpen] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const close = (event: KeyboardEvent | PointerEvent) => {
      if (event instanceof KeyboardEvent && event.key === "Escape") setIsOpen(false);
      if (event instanceof PointerEvent && !rootRef.current?.contains(event.target as Node)) setIsOpen(false);
    };
    document.addEventListener("keydown", close);
    document.addEventListener("pointerdown", close);
    return () => {
      document.removeEventListener("keydown", close);
      document.removeEventListener("pointerdown", close);
    };
  }, [isOpen]);

  const run = (action: () => void) => {
    setIsOpen(false);
    action();
  };

  return <div ref={rootRef}>
    <TopBarChrome contextLabel={contextLabel} menuButtonRef={menuButtonRef} menuId="game-menu-panel" menuLabel="Ouvrir le menu de partie" menuOpen={isOpen} onOpenMenu={() => setIsOpen((value) => !value)} />
    <aside aria-hidden={!isOpen} aria-label="Menu de partie" className={`coinche-mobile-nav fixed left-0 right-0 top-12 z-40 max-h-[calc(100dvh-3rem)] overflow-y-auto border-b p-4 shadow-2xl sm:left-auto sm:w-96 ${isOpen ? "" : "hidden"}`} id="game-menu-panel" inert={!isOpen}>
      <div>
        <p className="coinche-nav-section-label mb-2 px-1 text-[10px] font-bold uppercase tracking-[0.18em]">Affichage</p>
        <div className="grid gap-2">
          {showFocusMode ? <button aria-checked={!focusMode} className="coinche-drawer-action flex items-center justify-between gap-4" onClick={() => run(onToggleFocusMode)} role="switch" type="button"><span>Scores en direct</span><span aria-hidden="true" className={`relative h-6 w-11 shrink-0 rounded-full shadow-inner transition ${focusMode ? "bg-white/15" : "bg-emerald-600"}`}><span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${focusMode ? "left-0.5" : "left-0.5 translate-x-5"}`} /></span></button> : null}
          <button className="coinche-drawer-action" onClick={() => run(onOpenPreferences)} type="button">{preferencesLabel}</button>
        </div>
        {menuActions.filter((action) => action.tone !== "danger").length ? <><p className="coinche-nav-section-label mb-2 mt-6 px-1 text-[10px] font-bold uppercase tracking-[0.18em]">Actions</p><div className="grid gap-2">{menuActions.filter((action) => action.tone !== "danger").map((action) => <button className="coinche-drawer-action" disabled={action.disabled} key={action.label} onClick={() => run(action.onSelect)} type="button">{action.label}</button>)}</div></> : null}
        <p className="coinche-nav-section-label mb-2 mt-6 px-1 text-[10px] font-bold uppercase tracking-[0.18em]">Navigation</p>
        <nav className="grid gap-1">{NAV_LINKS.map(([href, label]) => {
          const isActive = href === "/solo" ? pathname === "/solo" : href === "/multiplayer" ? pathname.startsWith("/multiplayer") : pathname === href;
          return <Link aria-current={isActive ? "page" : undefined} className={`coinche-game-nav-link rounded-xl px-3 py-2.5 text-sm font-semibold transition ${isActive ? "coinche-topnav-link--active" : ""}`} href={href} key={href} onClick={() => setIsOpen(false)}>{label}</Link>;
        })}</nav>
      </div>
      <div className="mt-4 space-y-2 border-t border-[var(--border)] pt-4">
        {menuActions.filter((action) => action.tone === "danger").map((action) => <button className="w-full rounded-xl border border-red-400/25 bg-red-950/30 px-4 py-3 text-left text-sm font-bold text-red-200 transition hover:bg-red-900/40 disabled:opacity-40" disabled={action.disabled} key={action.label} onClick={() => run(action.onSelect)} type="button">{action.label}</button>)}
      </div>
    </aside>
  </div>;
}
