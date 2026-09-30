"use client";

import Link from "next/link";
import { WeeklyMissionsCard } from "./WeeklyMissionsCard";
import type { ProgressionSummary } from "@/lib/progression/formulaV1";
import { formatProgressionNumber, formatXp } from "@/lib/progression/format";
import { AppEyebrow, AppSurface, appSecondaryActionClass } from "@/components/ui/AppShell";
import { useProgression } from "./ProgressionProvider";

export function ProgressionBar({summary, mini = false}: {summary: ProgressionSummary; mini?: boolean}) {
  return <div className={`progression-bar${mini ? " progression-bar--mini" : ""}`} role="progressbar"
    aria-label={`Progression niveau ${summary.level} : ${formatProgressionNumber(summary.xpIntoLevel)} XP sur ${formatProgressionNumber(summary.xpForNextLevel)}`}
    aria-valuemin={0} aria-valuemax={summary.xpForNextLevel} aria-valuenow={summary.xpIntoLevel}>
    <span style={{width:`${summary.progressPercent}%`}} />
  </div>;
}
export function ProgressionLevelBadge({summary}: {summary: ProgressionSummary}) {
  return <span className="progression-level-badge">Niv. {summary.level}</span>;
}
export function ProgressionSummaryCard({summary, compact = false, link = true}: {summary: ProgressionSummary; compact?: boolean; link?: boolean}) {
  return <AppSurface className={`progression-card ${compact ? "progression-card--compact" : ""}`}>
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><AppEyebrow>Progression</AppEyebrow><h2 className="mt-2 text-2xl font-black text-[var(--text-primary)]">Niveau {summary.level}</h2></div>
      <ProgressionLevelBadge summary={summary} />
    </div>
    <div className="mt-4"><ProgressionBar summary={summary} /></div>
    <p className="mt-2 font-bold text-[var(--text-primary)]">{formatProgressionNumber(summary.xpIntoLevel)} / {formatXp(summary.xpForNextLevel)}</p>
    {!compact ? <div className="mt-2 text-sm text-[var(--text-secondary)]"><p>{formatXp(summary.xpRemaining)} avant le niveau {summary.level + 1}</p><p className="mt-1">{formatXp(summary.totalXp)} au total</p></div> : null}
    {link ? <Link className={`${appSecondaryActionClass} mt-4`} href="/progression">Voir ma progression <span aria-hidden="true" className="ml-2">→</span></Link> : null}
  </AppSurface>;
}
export function ProgressionStatusCard() {
  const {status, error, refresh} = useProgression();
  return <AppSurface className="progression-card"><AppEyebrow>Progression</AppEyebrow>
    {status === "error" ? <div className="mt-3"><p role="status">{error}</p><button className={`${appSecondaryActionClass} mt-3`} onClick={refresh} type="button">Réessayer</button></div>
      : <p className="mt-3 text-[var(--text-secondary)]" role="status">Chargement de la progression…</p>}
  </AppSurface>;
}
export function ProfileProgressionCard() {
  const {status, summary, userId} = useProgression();
  if (!userId && status === "signed-out") return null;
  return status === "ready" && summary ? <ProgressionSummaryCard summary={summary} /> : <ProgressionStatusCard />;
}
export function HomeProgressionCard() {
  const {status, summary, userId} = useProgression();
  if (!userId) return null;
  return status === "ready" && summary ? <div className="grid gap-3"><ProgressionSummaryCard compact summary={summary} /><WeeklyMissionsCard compact /></div> : <ProgressionStatusCard />;
}
