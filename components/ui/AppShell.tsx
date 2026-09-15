import type { ReactNode } from "react";

export const appPrimaryActionClass = "coinche-primary-action inline-flex min-h-11 items-center justify-center rounded-xl border px-4 py-2.5 text-sm font-black transition disabled:cursor-not-allowed disabled:opacity-50";
export const appSecondaryActionClass = "coinche-secondary-action inline-flex min-h-11 items-center justify-center rounded-xl border px-4 py-2.5 text-sm font-bold shadow-sm transition disabled:cursor-not-allowed disabled:opacity-50";
export const appDangerActionClass = "inline-flex min-h-11 items-center justify-center rounded-xl border border-red-300/20 bg-red-950/35 px-4 py-2.5 text-sm font-bold text-red-100 transition hover:bg-red-900/45 disabled:cursor-not-allowed disabled:opacity-50";
export const appInputClass = "coinche-input min-h-11 w-full rounded-xl border px-3 py-2.5 text-sm font-medium shadow-inner outline-none focus:ring-2 focus:ring-emerald-300/15 disabled:cursor-not-allowed disabled:opacity-50";

type AppPageProps = {
  children: ReactNode;
  className?: string;
  width?: "narrow" | "medium" | "wide";
};

export function AppPage({ children, className = "", width = "medium" }: AppPageProps) {
  const widthClass = width === "narrow" ? "max-w-xl" : width === "wide" ? "max-w-6xl" : "max-w-4xl";
  return (
    <main className="coinche-app-page relative min-h-[calc(100dvh-56px)] overflow-hidden px-3 py-5 sm:px-5 sm:py-8">
      <div className={`mx-auto flex w-full ${widthClass} flex-col gap-4 ${className}`}>{children}</div>
    </main>
  );
}

export function AppSurface({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={`coinche-app-surface rounded-2xl border p-4 sm:p-5 ${className}`}>{children}</section>;
}

export function AppEyebrow({ children }: { children: ReactNode }) {
  return <p className="text-[10px] font-black uppercase tracking-[0.2em] text-emerald-300/70">{children}</p>;
}
