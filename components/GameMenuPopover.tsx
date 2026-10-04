"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { AccessibleDialog } from "@/components/ui/AccessibleDialog";
import { appPrimaryActionClass, appSecondaryActionClass } from "@/components/ui/AppShell";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { AudioPopover } from "@/components/ui/AudioPopover";

export type GameMenuAction = {
  label: string;
  onSelect: () => void;
  disabled?: boolean;
  tone?: "default" | "danger";
};

type GameMenuPopoverProps = {
  focusMode: boolean;
  menuActions?: GameMenuAction[];
  onOpenPreferences: () => void;
  onToggleFocusMode: () => void;
  preferencesLabel?: "Paramètres" | "Préférences";
  showFocusMode?: boolean;
  exitDescription?: string;
};

type GameMenuPanelProps = GameMenuPopoverProps & {
  onSelect: (action: () => void) => void;
};

export function GameMenuPanel({
  focusMode,
  menuActions = [],
  onOpenPreferences,
  onSelect,
  onToggleFocusMode,
  preferencesLabel = "Préférences",
  showFocusMode = true,
}: GameMenuPanelProps) {
  const regularActions = menuActions.filter((action) => action.tone !== "danger");
  const dangerActions = menuActions.filter((action) => action.tone === "danger");

  return <aside aria-label="Menu de partie" className="coinche-popover coinche-game-menu fixed z-[80] overflow-y-auto overscroll-contain rounded-2xl border p-3 shadow-2xl sm:absolute sm:mt-2" id="game-menu-panel">
    {showFocusMode ? <>
      <p className="coinche-nav-section-label mb-2 px-1 text-[10px] font-bold uppercase tracking-[0.18em]">Affichage</p>
      <button aria-checked={!focusMode} className="coinche-drawer-action flex w-full items-center justify-between gap-4" onClick={() => onSelect(onToggleFocusMode)} role="switch" type="button"><span>Scores en direct</span><span aria-hidden="true" className={`relative h-6 w-11 shrink-0 rounded-full shadow-inner transition ${focusMode ? "bg-white/15" : "bg-emerald-600"}`}><span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${focusMode ? "left-0.5" : "left-0.5 translate-x-5"}`} /></span></button>
    </> : null}

    <div className="coinche-game-theme flex min-h-11 items-center justify-between gap-4 px-1"><span className="text-sm font-semibold">Thème</span><ThemeToggle /></div>
    <div className="coinche-game-audio"><AudioPopover inline /></div>

    <p className={`coinche-nav-section-label mb-2 px-1 text-[10px] font-bold uppercase tracking-[0.18em] ${showFocusMode ? "mt-4" : ""}`}>Partie</p>
    <div className="grid gap-2">
      <button className="coinche-drawer-action" onClick={() => onSelect(onOpenPreferences)} type="button">{preferencesLabel}</button>
      {regularActions.map((action) => <button className="coinche-drawer-action" disabled={action.disabled} key={action.label} onClick={() => onSelect(action.onSelect)} type="button">{action.label}</button>)}
    </div>

    {dangerActions.length ? <div className="mt-4 border-t border-[var(--border)] pt-3">
      <p className="mb-2 px-1 text-[10px] font-bold uppercase tracking-[0.18em] text-red-300">Zone dangereuse</p>
      <div className="grid gap-2">{dangerActions.map((action) => <button className="w-full rounded-xl border border-red-400/25 bg-red-950/30 px-4 py-3 text-left text-sm font-bold text-red-200 transition hover:bg-red-900/40 disabled:opacity-40" disabled={action.disabled} key={action.label} onClick={() => onSelect(action.onSelect)} type="button">{action.label}</button>)}</div>
    </div> : null}
  </aside>;
}

export function GameMenuPopover({
  focusMode,
  menuActions = [],
  onOpenPreferences,
  onToggleFocusMode,
  preferencesLabel = "Préférences",
  showFocusMode = true,
  exitDescription,
}: GameMenuPopoverProps) {
  const router = useRouter();
  const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [exitOpen, setExitOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setPortalTarget(document.getElementById("app-topnav-game-actions"));
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    rootRef.current?.querySelector<HTMLElement>('#game-menu-panel .coinche-drawer-action:not(:disabled)')?.focus();
    const close = (event: KeyboardEvent | PointerEvent) => {
      if (event instanceof KeyboardEvent && event.key === "Escape") {
        setIsOpen(false);
        buttonRef.current?.focus();
      }
      if (event instanceof PointerEvent && !rootRef.current?.contains(event.target as Node)) setIsOpen(false);
    };
    document.addEventListener("keydown", close);
    document.addEventListener("pointerdown", close);
    return () => {
      document.removeEventListener("keydown", close);
      document.removeEventListener("pointerdown", close);
    };
  }, [isOpen]);

  if (!portalTarget) return null;
  const run = (action: () => void) => {
    setIsOpen(false);
    if (rootRef.current?.contains(document.activeElement)) buttonRef.current?.focus();
    action();
  };

  return createPortal(<><div className="coinche-game-menu-root relative" ref={rootRef}>
    <button aria-controls="game-menu-panel" aria-expanded={isOpen} aria-label="Ouvrir le menu de partie" className="coinche-game-burger coinche-chrome-icon" onClick={(event) => { buttonRef.current = event.currentTarget; setIsOpen((value) => !value); }} type="button">☰</button>
    <button aria-controls="game-menu-panel" aria-expanded={isOpen} aria-label="Menu Partie" className="coinche-account-link whitespace-nowrap" onClick={(event) => { buttonRef.current = event.currentTarget; setIsOpen((value) => !value); }} type="button">
      <span className="hidden sm:inline">Partie <span aria-hidden="true">▾</span></span>
      <span aria-hidden="true" className="sm:hidden">•••</span>
      <span aria-hidden="true" className="coinche-game-edge-arrow">{isOpen ? "›" : "‹"}</span>
    </button>
    {isOpen ? <GameMenuPanel focusMode={focusMode} menuActions={menuActions} onOpenPreferences={onOpenPreferences} onSelect={run} onToggleFocusMode={onToggleFocusMode} preferencesLabel={preferencesLabel} showFocusMode={showFocusMode} /> : null}
  </div>
    {exitDescription ? <button aria-label="Quitter la table et revenir à l’accueil" className="coinche-game-exit coinche-table-control" onClick={(event) => { event.currentTarget.focus(); setExitOpen(true); }} type="button"><span aria-hidden="true">←</span></button> : null}
    {exitOpen ? <AccessibleDialog title="Revenir à l’accueil ?" description={exitDescription} width="medium" onClose={() => setExitOpen(false)} footer={<div className="flex justify-end gap-2"><button className={appSecondaryActionClass} onClick={() => setExitOpen(false)} type="button">Continuer la partie</button><button className={appPrimaryActionClass} onClick={() => { setExitOpen(false); router.push("/"); }} type="button">Revenir à l’accueil</button></div>}><div /></AccessibleDialog> : null}
  </>, portalTarget);
}
