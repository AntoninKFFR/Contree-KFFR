"use client";

import { useProgression } from "@/components/progression/ProgressionProvider";
import { AppSurface } from "@/components/ui/AppShell";
import { permanentMissionCopy } from "@/lib/progression/permanentMissions";
import { formatXp } from "@/lib/progression/format";

export function PermanentMissionsCard() {
  const {status,permanentMissions = [],missionsError} = useProgression();
  return <AppSurface><h2 className="font-black text-[var(--text-primary)]">Missions de départ</h2>
    <p className="mt-2 text-sm text-[var(--text-secondary)]">Cinq premières étapes, récompensées automatiquement et une seule fois.</p>
    {status !== "ready" ? <p className="mt-4 text-sm text-[var(--text-secondary)]">Les missions s’afficheront avec ta progression.</p>
      : missionsError ? <p className="mt-4 text-sm text-[var(--text-secondary)]">Les missions sont momentanément indisponibles.</p>
        : <ul aria-label="Missions de départ" className="mt-4 divide-y divide-[var(--border)]">
          {permanentMissions.map((mission) => <li key={mission.key} className="flex flex-wrap items-center justify-between gap-3 py-4">
            <div className="min-w-0 flex-1 basis-52"><h3 className="text-sm font-bold text-[var(--text-primary)]">{permanentMissionCopy[mission.key].title}</h3>
              <p className="mt-1 text-sm text-[var(--text-secondary)]">{permanentMissionCopy[mission.key].description}</p></div>
            <div className="flex shrink-0 items-center gap-4 text-sm"><span className="font-bold text-[var(--text-primary)]">+{formatXp(mission.rewardXp)}</span>
              <span className={mission.completed ? "font-bold text-[var(--accent)]" : "text-[var(--text-secondary)]"}>
                {mission.completed ? <><span aria-hidden="true">✓ </span>Terminé</> : "0 / 1"}</span></div>
          </li>)}
        </ul>}
  </AppSurface>;
}
