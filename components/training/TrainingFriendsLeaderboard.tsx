"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import { AppSurface } from "@/components/ui/AppShell";
import { formatDuration } from "@/components/training/pileCountCopy";
import { MEMORY_AXIS_IDS, MEMORY_LABELS, MEMORY_LEVELS } from "@/engine/training/memory";
import { OPPONENT_VOIDS_LEVELS } from "@/engine/training/opponentVoids";
import { isPersistablePuzzleAxisId, type PersistablePuzzleAxisId } from "@/engine/training/seriesContract";
import { readFriendsTrainingLeaderboard, type TrainingLeaderboardResult } from "@/lib/trainingLeaderboardClient";

const AXES: { id: PersistablePuzzleAxisId; label: string; levels: number }[] = [
  { id: "trick-value", label: "Valeur d’un pli", levels: 2 },
  ...MEMORY_AXIS_IDS.map((id) => ({ id, label: MEMORY_LABELS[id], levels: MEMORY_LEVELS[id] })),
  { id: "opponent-voids", label: "Jeu des autres", levels: OPPONENT_VOIDS_LEVELS },
];

type QueryResult = { key: string; result: TrainingLeaderboardResult };
const scoreFormat = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 });

export function TrainingFriendsLeaderboard({ signedIn, authEpoch, authGeneration }: {
  signedIn: boolean | null;
  authEpoch: number;
  authGeneration: RefObject<number>;
}) {
  const [axisId, setAxisId] = useState<PersistablePuzzleAxisId>("trick-value");
  const [level, setLevel] = useState(1);
  const [query, setQuery] = useState<QueryResult | null>(null);
  const requestGeneration = useRef(0);
  const selectedAxis = AXES.find((axis) => axis.id === axisId)!;
  const key = `${authEpoch}:${axisId}:${level}`;

  useEffect(() => {
    const generation = ++requestGeneration.current;
    if (signedIn !== true) return;
    let active = true;
    const actorGeneration = authGeneration.current;
    const requestKey = `${authEpoch}:${axisId}:${level}`;
    void readFriendsTrainingLeaderboard(axisId, level).then((result) => {
      if (active && generation === requestGeneration.current
        && actorGeneration === authGeneration.current) setQuery({ key: requestKey, result });
    });
    return () => { active = false; };
  }, [signedIn, authEpoch, authGeneration, axisId, level]);

  const current = query?.key === key ? query.result : null;
  return <AppSurface className="mt-4">
    <h2 className="text-2xl font-black">Classement entre amis</h2>
    {signedIn === false ? <p className="mt-3 text-sm text-[var(--text-secondary)]">Connecte-toi pour comparer tes records avec ceux de tes amis.</p>
      : signedIn === null ? <p className="mt-3 text-sm text-[var(--text-secondary)]" role="status">Chargement du compte…</p>
        : <>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <label className="flex min-w-0 flex-col gap-1 text-sm font-semibold">Axe
              <select aria-label="Axe du classement" className="min-w-0 rounded-lg border border-[var(--border)] bg-[var(--surface-raised)] px-3 py-2 text-[var(--text-primary)]"
                value={axisId} onChange={(event) => {
                  if (isPersistablePuzzleAxisId(event.target.value)) {
                    setAxisId(event.target.value);
                    setLevel(1);
                  }
                }}>
                {AXES.map((axis) => <option key={axis.id} value={axis.id}>{axis.label}</option>)}
              </select>
            </label>
            <label className="flex min-w-0 flex-col gap-1 text-sm font-semibold">Niveau
              <select aria-label="Niveau du classement" className="min-w-0 rounded-lg border border-[var(--border)] bg-[var(--surface-raised)] px-3 py-2 text-[var(--text-primary)]"
                value={level} onChange={(event) => setLevel(Number(event.target.value))}>
                {Array.from({ length: selectedAxis.levels }, (_, index) => index + 1)
                  .map((availableLevel) => <option key={availableLevel} value={availableLevel}>Niveau {availableLevel}</option>)}
              </select>
            </label>
          </div>
          {!current ? <p className="mt-4 text-sm text-[var(--text-secondary)]" role="status">Chargement du classement…</p>
            : current.status === "failed" ? <p className="mt-4 text-sm text-[var(--text-secondary)]" role="status">Classement indisponible pour le moment.</p>
              : current.status === "signed-out" ? <p className="mt-4 text-sm text-[var(--text-secondary)]" role="status">Connecte-toi pour comparer tes records avec ceux de tes amis.</p>
                : current.entries.length === 0 ? <p className="mt-4 text-sm text-[var(--text-secondary)]" role="status">Aucun record à afficher pour ce niveau.</p>
                  : <ol className="mt-4 space-y-2" aria-label="Classement entre amis">
                    {current.entries.map((entry, index) => <li key={`${entry.username}:${index}`} className="flex min-w-0 items-start gap-3 rounded-lg border border-[var(--border)] bg-[var(--surface-raised)] px-3 py-2 text-sm">
                      <span className="w-7 shrink-0 font-bold text-[var(--accent)]">{index + 1}.</span>
                      <span className="min-w-0 flex-1 break-words font-semibold">{entry.username}</span>
                      <span className="shrink-0 text-right tabular-nums">{scoreFormat.format(entry.bestScore)} / 10
                        {entry.bestDurationMs !== null ? <span className="block text-xs text-[var(--text-secondary)]">{formatDuration(entry.bestDurationMs)}</span> : null}
                      </span>
                    </li>)}
                  </ol>}
        </>}
  </AppSurface>;
}
