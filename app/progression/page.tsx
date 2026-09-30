"use client";

import Link from "next/link";
import { PermanentMissionsCard } from "@/components/progression/PermanentMissionsCard";
import { useProgression } from "@/components/progression/ProgressionProvider";
import { ProgressionStatusCard, ProgressionSummaryCard } from "@/components/progression/ProgressionCard";
import { AppPage, AppPageHeader, AppSurface, appPrimaryActionClass } from "@/components/ui/AppShell";
import { formatXp, xpSourceLabel } from "@/lib/progression/format";

export default function ProgressionPage() {
  const {status,summary,recentEvents,recentError} = useProgression();
  if (status === "signed-out") return <AppPage><AppPageHeader eyebrow="Progression" title="Connecte-toi pour suivre ta progression" description="Retrouve ton niveau et les XP gagnés au fil de tes parties." />
    <Link className={`${appPrimaryActionClass} self-start`} href="/login?next=%2Fprogression">Se connecter</Link></AppPage>;
  return <AppPage><AppPageHeader eyebrow="Progression" title={status === "ready" && summary ? `Niveau ${summary.level}` : "Ta progression"}
    description="Ton niveau KFFR progresse au fil des parties et reste permanent." />
    {status === "ready" && summary ? <ProgressionSummaryCard summary={summary} link={false} /> : <ProgressionStatusCard />}
    <div className="grid gap-5"><PermanentMissionsCard />
      <AppSurface><h2 className="font-black text-[var(--text-primary)]">Récompenses</h2><p className="mt-2 text-sm text-[var(--text-secondary)]">Les récompenses cosmétiques arriveront dans une prochaine étape.</p></AppSurface></div>
    {status === "ready" ? <AppSurface><h2 className="font-black text-[var(--text-primary)]">XP récents</h2>
      {recentError ? <p className="mt-3 text-sm text-[var(--text-secondary)]">Les gains récents sont momentanément indisponibles.</p>
        : !recentEvents.length ? <p className="mt-3 text-sm text-[var(--text-secondary)]">Tes premiers gains d’XP apparaîtront ici après une partie.</p>
          : <ul className="mt-3 divide-y divide-[var(--border)]">{recentEvents.map((event,index) => <li className="flex flex-wrap items-center justify-between gap-2 py-3" key={`${event.createdAt}:${index}`}>
            <span className="text-sm font-bold text-[var(--text-primary)]">+{formatXp(event.amount)} · {xpSourceLabel(event.sourceType)}</span>
            <time className="text-xs text-[var(--text-secondary)]" dateTime={event.createdAt}>{new Intl.DateTimeFormat("fr-FR",{day:"numeric",month:"short",year:"numeric"}).format(new Date(event.createdAt))}</time>
          </li>)}</ul>}
    </AppSurface> : null}
  </AppPage>;
}
