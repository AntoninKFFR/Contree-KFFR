"use client";

import { useEffect, useState } from "react";
import { useProgression } from "./ProgressionProvider";
import { AppSurface } from "@/components/ui/AppShell";
import { formatXp } from "@/lib/progression/format";
import { weeklyMissionCopy, resetRemainingLabel, type WeeklyMission } from "@/lib/progression/weeklyMissions";

export function WeeklyProgressBar({mission,mini = false}: {mission: WeeklyMission; mini?: boolean}) {
  const progress = Math.max(0,Math.min(mission.progress,mission.target));
  return <div className={`progression-bar${mini ? " progression-bar--mini" : ""}`} role="progressbar"
    aria-label={`${weeklyMissionCopy[mission.key].title} : ${progress} sur ${mission.target}`}
    aria-valuemin={0} aria-valuemax={mission.target} aria-valuenow={progress}>
    <span style={{width:`${100*progress/mission.target}%`}} /></div>;
}
function ResetLabel({at}: {at: string}) {
  const [now,setNow] = useState<number | null>(null);
  useEffect(() => {setNow(Date.now()); const timer = setInterval(() => setNow(Date.now()),60000);return () => clearInterval(timer);},[at]);
  return <p className="mt-2 text-xs text-[var(--text-secondary)]">{now === null ? "Reset lundi à 00:00 · Europe/Paris" : resetRemainingLabel(at,now)}</p>;
}
export function WeeklyMissionsCard({compact = false}: {compact?: boolean}) {
  const {status,weeklySnapshot,weeklyError} = useProgression();
  const missions = [...(weeklySnapshot?.missions ?? [])];
  if (compact) missions.sort((a,b) => Number(a.completed)-Number(b.completed));
  return <AppSurface className="weekly-missions-card"><h2 className="font-black text-[var(--text-primary)]">Cette semaine</h2>
    {status !== "ready" ? <p className="mt-3 text-sm text-[var(--text-secondary)]">Chargement des missions hebdomadaires…</p>
      : weeklyError || !weeklySnapshot ? <p className="mt-3 text-sm text-[var(--text-secondary)]">Les missions hebdomadaires sont momentanément indisponibles.</p>
        : <><ResetLabel at={weeklySnapshot.nextResetAt} /><ul aria-label="Missions hebdomadaires" className={compact ? "mt-3 grid gap-3 sm:grid-cols-3" : "mt-4 grid gap-4 md:grid-cols-3"}>
          {missions.map(m => <li key={m.key} className={compact ? "min-w-0" : "min-w-0 rounded-2xl border border-[var(--border)] p-4"}>
            <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="text-sm font-bold text-[var(--text-primary)]">{weeklyMissionCopy[m.key].title}</h3>
              <span className={m.completed ? "text-xs font-bold text-[var(--accent)]" : "text-xs text-[var(--text-secondary)]"}>{m.completed && compact ? "✓ Terminé" : `${m.progress} / ${m.target}`}</span></div>
            {!compact ? <p className="mt-2 text-sm text-[var(--text-secondary)]">{weeklyMissionCopy[m.key].description.replace("{target}",String(m.target))}</p> : null}
            <div className="mt-3"><WeeklyProgressBar mission={m} mini={compact} /></div>
            {!compact ? <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-sm font-bold"><span className="text-[var(--text-primary)]">+{formatXp(m.rewardXp)}</span>{m.completed ? <span className="text-[var(--accent)]">✓ Terminé</span> : null}</div> : null}
          </li>)}
        </ul></>}
  </AppSurface>;
}
