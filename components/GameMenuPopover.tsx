"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

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

  return <aside aria-label="Menu de partie" className="coinche-popover fixed right-3 top-14 z-[80] max-h-[calc(100dvh-4rem)] w-[min(19rem,calc(100vw-1.5rem))] overflow-y-auto rounded-2xl border p-3 shadow-2xl sm:absolute sm:right-0 sm:top-full sm:mt-2" id="game-menu-panel">
    {showFocusMode ? <>
      <p className="coinche-nav-section-label mb-2 px-1 text-[10px] font-bold uppercase tracking-[0.18em]">Affichage</p>
      <button aria-checked={!focusMode} className="coinche-drawer-action flex w-full items-center justify-between gap-4" onClick={() => onSelect(onToggleFocusMode)} role="switch" type="button"><span>Scores en direct</span><span aria-hidden="true" className={`relative h-6 w-11 shrink-0 rounded-full shadow-inner transition ${focusMode ? "bg-white/15" : "bg-emerald-600"}`}><span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${focusMode ? "left-0.5" : "left-0.5 translate-x-5"}`} /></span></button>
    </> : null}

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
}: GameMenuPopoverProps) {
  const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setPortalTarget(document.getElementById("app-topnav-game-actions"));
  }, []);

  useEffect(() => {
    if (!isOpen) return;
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
    action();
  };

  return createPortal(<div className="relative" ref={rootRef}>
    <button aria-controls="game-menu-panel" aria-expanded={isOpen} aria-label="Menu Partie" className="coinche-account-link whitespace-nowrap" onClick={() => setIsOpen((value) => !value)} ref={buttonRef} type="button">
      <span className="hidden sm:inline">Partie <span aria-hidden="true">▾</span></span>
      <span aria-hidden="true" className="sm:hidden">•••</span>
    </button>
    {isOpen ? <GameMenuPanel focusMode={focusMode} menuActions={menuActions} onOpenPreferences={onOpenPreferences} onSelect={run} onToggleFocusMode={onToggleFocusMode} preferencesLabel={preferencesLabel} showFocusMode={showFocusMode} /> : null}
  </div>, portalTarget);
}
