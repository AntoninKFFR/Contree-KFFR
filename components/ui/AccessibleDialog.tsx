"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { IconCloseButton } from "@/components/ui/IconCloseButton";
import { lockBodyScroll } from "@/lib/ui/bodyScrollLock";

type Props = { children: ReactNode; backdropClassName?: string; closeLabel?: string; description?: string; footer?: ReactNode; minimalHeader?: boolean; onClose: () => void; showCloseButton?: boolean; stableHeight?: boolean; title: string; width?: "wide" | "medium" | "navigation" };
const FOCUSABLE = "button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])";
// A critical dialog opened above navigation owns Escape and focus until it closes.
const dialogStack: HTMLElement[] = [];

export function AccessibleDialog({ children, backdropClassName = "", closeLabel, description, footer, minimalHeader = false, onClose, showCloseButton = true, stableHeight = false, title, width = "wide" }: Props) {
  const titleId = useId();
  const descriptionId = useId();
  const panelRef = useRef<HTMLElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  useEffect(() => {
    const panel = panelRef.current;
    if (!panel) return;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const releaseScroll = lockBodyScroll(document.body);
    dialogStack.push(panel);
    (closeRef.current ?? panelRef.current?.querySelector<HTMLElement>(FOCUSABLE))?.focus({ preventScroll: true });
    const handleKeyDown = (event: KeyboardEvent) => {
      if (dialogStack.at(-1) !== panel) return;
      if (event.key === "Escape") { event.preventDefault(); onCloseRef.current(); return; }
      if (event.key !== "Tab" || !panelRef.current) return;
      const focusable = [...panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE)];
      if (focusable.length === 0) return;
      const current = focusable.indexOf(document.activeElement as HTMLElement);
      const next = (current + (event.shiftKey ? -1 : 1) + focusable.length) % focusable.length;
      event.preventDefault();
      focusable[next].focus({ preventScroll: true });
    };
    const containFocus = (event: FocusEvent) => {
      if (dialogStack.at(-1) !== panel) return;
      if (panel.contains(event.target as Node)) {
        // Reveal focused navigation links using only the drawer's own scroller.
        const target = event.target as HTMLElement;
        const scroller = target.closest<HTMLElement>(".coinche-mobile-nav");
        if (scroller) {
          const item = target.getBoundingClientRect();
          const bounds = scroller.getBoundingClientRect();
          if (item.bottom > bounds.bottom) scroller.scrollTop += item.bottom - bounds.bottom;
          else if (item.top < bounds.top) scroller.scrollTop -= bounds.top - item.top;
        }
        return;
      }
      (closeRef.current ?? panel.querySelector<HTMLElement>(FOCUSABLE))?.focus({ preventScroll: true });
    };
    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("focusin", containFocus);
    return () => {
      const wasTop = dialogStack.at(-1) === panel;
      const index = dialogStack.indexOf(panel);
      if (index !== -1) dialogStack.splice(index, 1);
      releaseScroll();
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("focusin", containFocus);
      if (wasTop && previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
    };
  }, []);
  return <div aria-describedby={description ? descriptionId : undefined} aria-labelledby={titleId} aria-modal="true" className={`coinche-dialog-backdrop coinche-fullscreen-safe fixed inset-0 z-[var(--layer-dialog)] flex items-center justify-center backdrop-blur-sm ${backdropClassName}`} onClick={(event) => { if (event.target === event.currentTarget) onClose(); }} role="dialog">
    <section className={`coinche-dialog flex w-full flex-col overflow-hidden border sm:rounded-3xl ${stableHeight ? "coinche-dialog--stable" : ""} ${width === "navigation" ? "coinche-dialog--navigation" : width === "wide" ? "sm:max-w-6xl" : "sm:max-w-3xl"}`} onClick={(event) => event.stopPropagation()} ref={panelRef}>
      <header className={`coinche-dialog-header sticky top-0 z-30 flex shrink-0 items-center justify-between gap-4 border-b px-4 backdrop-blur sm:px-6 ${minimalHeader ? "py-3" : "py-3.5"}`}><div className="min-w-0">{minimalHeader ? null : <p className="coinche-ui-kicker text-[9px] font-black uppercase tracking-[0.18em]">Contrée KFFR</p>}<h2 className={`${minimalHeader ? "text-lg" : "mt-0.5 text-xl"} font-black`} id={titleId}>{title}</h2>{description ? <p className="mt-0.5 text-sm text-[var(--text-muted)]" id={descriptionId}>{description}</p> : null}</div>{showCloseButton ? <IconCloseButton label={closeLabel ?? `Fermer ${title}`} onClick={onClose} ref={closeRef} /> : null}</header>
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">{children}</div>
      {footer ? <footer className="coinche-dialog-footer shrink-0 border-t p-3 sm:px-6">{footer}</footer> : null}
    </section>
  </div>;
}
