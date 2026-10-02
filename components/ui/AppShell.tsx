/** @jsxImportSource react */
import type { ReactNode } from "react";

export const appPrimaryActionClass = "coinche-primary-action coinche-action inline-flex items-center justify-center border px-4 py-2.5 text-sm font-black transition disabled:cursor-not-allowed disabled:opacity-50";
export const appSecondaryActionClass = "coinche-secondary-action coinche-action inline-flex items-center justify-center border px-4 py-2.5 text-sm font-bold transition disabled:cursor-not-allowed disabled:opacity-50";
export const appDangerActionClass = "coinche-danger-action coinche-action inline-flex items-center justify-center border px-4 py-2.5 text-sm font-bold transition disabled:cursor-not-allowed disabled:opacity-50";
export const appInputClass = "coinche-input min-h-11 w-full border px-3 py-2.5 text-sm font-medium outline-none disabled:cursor-not-allowed disabled:opacity-50";
export const appSegmentedItemClass = "coinche-segmented-item inline-flex min-h-10 items-center justify-center border px-3.5 py-2 text-sm font-bold transition";
export const appBadgeClass = "coinche-status-badge inline-flex items-center border px-2.5 py-1 text-xs font-bold";
// Opt-in compositions: existing pages keep their own content and layout choices.
export const appSegmentedGroupClass = "coinche-segmented-group";
export const appFormClass = "coinche-form";
export const appFieldClass = "coinche-field";
export const appRowClass = "coinche-row";
export const appMetadataClass = "coinche-metadata";
export const appTableScrollClass = "coinche-table-scroll";

type AppPageProps = {
  children: ReactNode;
  className?: string;
  width?: "narrow" | "medium" | "wide";
};

export function AppPage({ children, className = "", width = "medium" }: AppPageProps) {
  const widthClass = width === "narrow" ? "max-w-xl" : width === "wide" ? "max-w-6xl" : "max-w-4xl";
  return (
    <main className="coinche-app-page coinche-page-shell coinche-content-min coinche-safe-bottom relative">
      <div className={`coinche-page-stack mx-auto flex min-w-0 w-full ${widthClass} flex-col ${className}`}>{children}</div>
    </main>
  );
}

export function AppSurface({ children, className = "", variant = "panel" }: { children: ReactNode; className?: string; variant?: "panel" | "plain" }) {
  return <section className={`${variant === "plain" ? "coinche-app-section" : "coinche-app-surface border"} ${className}`}>{children}</section>;
}

export function AppEyebrow({ children }: { children: ReactNode }) {
  return <p className="coinche-app-eyebrow coinche-ui-kicker text-xs font-black uppercase tracking-[0.16em]">{children}</p>;
}

export function AppPageHeader({ eyebrow, title, description, actions, children, className = "" }: {
  eyebrow?: string; title: string; description?: string; actions?: ReactNode; children?: ReactNode; className?: string;
}) {
  return <header className={`coinche-page-header coinche-page-header--hero ${className}`}>
    <div className="coinche-page-header-main"><div className="coinche-page-header-copy">
      {eyebrow ? <AppEyebrow>{eyebrow}</AppEyebrow> : null}
      <h1>{title}</h1>
      {description ? <p className="coinche-page-header-description">{description}</p> : null}
    </div>{actions ? <div className="coinche-page-header-actions">{actions}</div> : null}{children}</div>
  </header>;
}

export function AppEmptyState({ title, description, children }: { title: string; description?: string; children?: ReactNode }) {
  return <div className="coinche-empty-state">
    <h2>{title}</h2>
    {description ? <p>{description}</p> : null}
    {children}
  </div>;
}
