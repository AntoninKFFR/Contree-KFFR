"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";

type Props = { children: ReactNode; description?: string; footer?: ReactNode; onClose: () => void; showCloseButton?: boolean; title: string; width?: "wide" | "medium" };
const FOCUSABLE = "button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])";

export function AccessibleDialog({ children, description, footer, onClose, showCloseButton = true, title, width = "wide" }: Props) {
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
  return <div aria-describedby={description ? descriptionId : undefined} aria-labelledby={titleId} aria-modal="true" className="fixed inset-0 z-[60] flex items-center justify-center bg-[#020704]/80 p-0 backdrop-blur-sm sm:p-3" onClick={(event) => { if (event.target === event.currentTarget) onClose(); }} role="dialog">
    <section className={`coinche-dialog flex h-[100dvh] max-h-[100dvh] w-full flex-col overflow-hidden border border-white/10 bg-[#e9e4d8] shadow-[0_30px_100px_rgb(0_0_0_/_55%)] sm:h-auto sm:max-h-[calc(100dvh-1.5rem)] sm:rounded-3xl ${width === "wide" ? "sm:max-w-6xl" : "sm:max-w-3xl"}`} onClick={(event) => event.stopPropagation()} ref={panelRef}>
      <header className="sticky top-0 z-30 flex shrink-0 items-start justify-between gap-4 border-b border-white/10 bg-[#0c1c15] px-4 py-3.5 text-stone-100 backdrop-blur sm:px-6"><div className="min-w-0"><p className="text-[9px] font-black uppercase tracking-[0.18em] text-emerald-300/60">Contrée KFFR</p><h2 className="mt-0.5 text-xl font-black text-[#f4ead0]" id={titleId}>{title}</h2>{description ? <p className="mt-0.5 text-sm text-white/[0.48]" id={descriptionId}>{description}</p> : null}</div>{showCloseButton ? <button aria-label={`Fermer ${title}`} className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/12 bg-white/[0.07] text-xl font-bold text-white/75 transition hover:bg-white/[0.13] focus-visible:outline focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-emerald-300" onClick={onClose} ref={closeRef} type="button">×</button> : null}</header>
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">{children}</div>
      {footer ? <footer className="shrink-0 border-t border-white/10 bg-[#102219] p-3 text-stone-100 sm:px-6">{footer}</footer> : null}
    </section>
  </div>;
}
