"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";

type Props = { children: ReactNode; description: string; footer?: ReactNode; onClose: () => void; title: string; width?: "wide" | "medium" };
const FOCUSABLE = "button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])";

export function AccessibleDialog({ children, description, footer, onClose, title, width = "wide" }: Props) {
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
    closeRef.current?.focus();
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
  return <div aria-describedby={descriptionId} aria-labelledby={titleId} aria-modal="true" className="fixed inset-0 z-[60] flex items-center justify-center bg-black/65 p-0 sm:p-3" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }} role="dialog">
    <section className={`coinche-dialog flex h-[100dvh] w-full flex-col overflow-hidden bg-[#f4f1e8] shadow-2xl sm:h-auto sm:max-h-[94dvh] sm:rounded-2xl ${width === "wide" ? "sm:max-w-6xl" : "sm:max-w-3xl"}`} onMouseDown={(event) => event.stopPropagation()} ref={panelRef}>
      <header className="sticky top-0 z-30 flex shrink-0 items-start justify-between gap-4 border-b border-stone-300 bg-[#f4f1e8]/95 px-4 py-3 backdrop-blur sm:px-6"><div><h2 className="text-xl font-bold text-stone-950" id={titleId}>{title}</h2><p className="mt-0.5 text-sm text-stone-600" id={descriptionId}>{description}</p></div><button aria-label={`Fermer ${title}`} className="rounded-lg border border-stone-400 bg-white px-3 py-2 text-sm font-semibold shadow-sm hover:bg-stone-50 focus-visible:outline focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-emerald-700" onClick={onClose} ref={closeRef} type="button">Fermer</button></header>
      <div className="min-h-0 flex-1 overflow-hidden">{children}</div>
      {footer ? <footer className="shrink-0 border-t border-stone-300 bg-white/80 p-3 sm:px-6">{footer}</footer> : null}
    </section>
  </div>;
}
