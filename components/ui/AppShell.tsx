import type { ReactNode } from "react";

export const appPrimaryActionClass = "inline-flex min-h-11 items-center justify-center rounded-xl border border-[#ead8a6]/40 bg-[#ead8a6] px-4 py-2.5 text-sm font-black text-[#10251b] shadow-lg transition hover:bg-[#f7edcf] focus-visible:outline-amber-200 disabled:cursor-not-allowed disabled:opacity-50";
export const appSecondaryActionClass = "inline-flex min-h-11 items-center justify-center rounded-xl border border-white/12 bg-white/[0.07] px-4 py-2.5 text-sm font-bold text-white/85 shadow-sm transition hover:border-white/25 hover:bg-white/[0.12] focus-visible:outline-emerald-300 disabled:cursor-not-allowed disabled:opacity-50";
export const appDangerActionClass = "inline-flex min-h-11 items-center justify-center rounded-xl border border-red-300/20 bg-red-950/35 px-4 py-2.5 text-sm font-bold text-red-100 transition hover:bg-red-900/45 disabled:cursor-not-allowed disabled:opacity-50";
export const appInputClass = "min-h-11 w-full rounded-xl border border-white/15 bg-black/20 px-3 py-2.5 text-sm font-medium text-white shadow-inner outline-none placeholder:text-white/30 focus:border-emerald-300/70 focus:ring-2 focus:ring-emerald-300/15 disabled:cursor-not-allowed disabled:opacity-50";

type AppPageProps = {
  children: ReactNode;
  className?: string;
  width?: "narrow" | "medium" | "wide";
};

export function AppPage({ children, className = "", width = "medium" }: AppPageProps) {
  const widthClass = width === "narrow" ? "max-w-xl" : width === "wide" ? "max-w-6xl" : "max-w-4xl";
  return (
    <main className="coinche-app-page relative min-h-[calc(100dvh-56px)] overflow-hidden px-3 py-5 text-stone-50 sm:px-5 sm:py-8">
      <div aria-hidden="true" className="pointer-events-none absolute -left-32 top-20 h-80 w-80 rounded-full bg-emerald-500/[0.07] blur-3xl" />
      <div aria-hidden="true" className="pointer-events-none absolute -right-24 bottom-0 h-72 w-72 rounded-full bg-amber-200/[0.05] blur-3xl" />
      <div className={`relative mx-auto flex w-full ${widthClass} flex-col gap-4 ${className}`}>{children}</div>
    </main>
  );
}

export function AppSurface({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={`coinche-app-surface rounded-2xl border border-white/10 bg-[#0b1c15]/[0.88] p-4 shadow-[0_18px_55px_rgb(0_0_0_/_22%)] backdrop-blur-sm sm:p-5 ${className}`}>{children}</section>;
}

export function AppEyebrow({ children }: { children: ReactNode }) {
  return <p className="text-[10px] font-black uppercase tracking-[0.2em] text-emerald-300/70">{children}</p>;
}
