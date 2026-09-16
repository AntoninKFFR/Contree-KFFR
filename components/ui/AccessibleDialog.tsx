"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { IconCloseButton } from "@/components/ui/IconCloseButton";

type Props = { children: ReactNode; closeLabel?: string; description?: string; footer?: ReactNode; minimalHeader?: boolean; onClose: () => void; showCloseButton?: boolean; stableHeight?: boolean; title: string; width?: "wide" | "medium" };
const FOCUSABLE = "button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])";

export function AccessibleDialog({ children, closeLabel, description, footer, minimalHeader = false, onClose, showCloseButton = true, stableHeight = false, title, width = "wide" }: Props) {
  const titleId = useId();
  const descriptionId = useId();
  const panelRef = useRef<HTMLElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    (closeRef.current ?? panelRef.current?.querySelector<HTMLElement>(FOCUSABLE))?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); onCloseRef.current(); return; }
      if (event.key !== "Tab" || !panelRef.current) return;
      const focusable = [...panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE)];
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable.at(-1)!;
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => { document.body.style.overflow = previousOverflow; document.removeEventListener("keydown", handleKeyDown); previousFocus?.focus(); };
  }, []);
  return <div aria-describedby={description ? descriptionId : undefined} aria-labelledby={titleId} aria-modal="true" className="coinche-dialog-backdrop fixed inset-0 z-[60] flex items-center justify-center p-0 backdrop-blur-sm sm:p-3" onClick={(event) => { if (event.target === event.currentTarget) onClose(); }} role="dialog">
    <section className={`coinche-dialog flex h-[100dvh] max-h-[100dvh] w-full flex-col overflow-hidden border sm:max-h-[calc(100dvh-1.5rem)] sm:rounded-3xl ${stableHeight ? "sm:h-[min(46rem,calc(100dvh-1.5rem))]" : "sm:h-auto"} ${width === "wide" ? "sm:max-w-6xl" : "sm:max-w-3xl"}`} onClick={(event) => event.stopPropagation()} ref={panelRef}>
      <header className={`coinche-dialog-header sticky top-0 z-30 flex shrink-0 items-center justify-between gap-4 border-b px-4 backdrop-blur sm:px-6 ${minimalHeader ? "py-3" : "py-3.5"}`}><div className="min-w-0">{minimalHeader ? null : <p className="coinche-ui-kicker text-[9px] font-black uppercase tracking-[0.18em]">Contrée KFFR</p>}<h2 className={`${minimalHeader ? "text-lg" : "mt-0.5 text-xl"} font-black`} id={titleId}>{title}</h2>{description ? <p className="mt-0.5 text-sm text-[var(--text-muted)]" id={descriptionId}>{description}</p> : null}</div>{showCloseButton ? <IconCloseButton label={closeLabel ?? `Fermer ${title}`} onClick={onClose} ref={closeRef} /> : null}</header>
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">{children}</div>
      {footer ? <footer className="coinche-dialog-footer shrink-0 border-t p-3 sm:px-6">{footer}</footer> : null}
    </section>
  </div>;
}
